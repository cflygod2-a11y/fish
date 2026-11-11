"""Transactional single-session fishing rules for Python 3.9+."""
import bisect
import random
import sqlite3
import threading
import time
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone


# Fish lengths are integer millimetres, shown to players in 0.1 cm steps.
SPECIES = (
    (("沙丁鱼", 100, 300), ("竹荚鱼", 140, 440), ("银鲳", 150, 500)),
    (("花鲈", 260, 920), ("真鲷", 220, 960), ("蓝点马鲛", 280, 1120)),
    (("红石斑", 320, 1220), ("黄鳍金枪鱼", 460, 1750), ("珍珠鳐", 420, 1460)),
    (("星纹旗鱼", 900, 3200), ("金鳞皇带鱼", 1200, 3800)),
)
RARITIES = ("常见", "少见", "稀有", "传说")
SIZE_NAMES = ("普通", "大", "巨型")
RARITY_THRESHOLDS = ((72, 94, 99), (42, 76, 96))
SIZE_THRESHOLDS = ((80, 97), (52, 88))
IDLE_SECONDS = 60
CAST_SECONDS_RANGE = (5, 20)
DAILY_FREE_CASTS = 10
BEIJING_TIME = timezone(timedelta(hours=8))
NORMAL_SEATS = 10
TOTAL_SEATS = 12
SEASON_SECONDS = 10 * 60
SEASONS = {"spring": "春季", "summer": "夏季", "autumn": "秋季", "winter": "冬季"}
SEASON_ORDER = tuple(SEASONS)
SEASON_ACTIONS = {"season_" + key: key for key in SEASONS}


def draw_fish(rng, upgraded):
    """Choose rarity, species and size independently of seat and prior catches."""
    rarity = bisect.bisect_right(RARITY_THRESHOLDS[upgraded], rng.randrange(100))
    fish, lo, hi = rng.choice(SPECIES[rarity])
    size = bisect.bisect_right(SIZE_THRESHOLDS[upgraded], rng.randrange(100))
    cuts = (lo, lo + (hi-lo)*7//10, lo + (hi-lo)*9//10, hi+1)
    mm = rng.randrange(cuts[size], cuts[size+1])
    return fish, mm, RARITIES[rarity], SIZE_NAMES[size]


def _name(value):
    value = "".join(c for c in str(value or "") if not unicodedata.category(c).startswith("C"))
    return value.strip()[:24] or "钓友"


def _quota_day(now):
    return datetime.fromtimestamp(now, BEIJING_TIME).date().isoformat()


class Engine:
    def __init__(self, path, mode, interval=None):
        self.mode = mode
        self.interval = interval
        if mode not in ("demo", "live"):
            raise ValueError("运行模式无效")
        self.rng = random.SystemRandom()
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, timeout=8, isolation_level=None, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS session_info(mode TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS angler(
                uid TEXT PRIMARY KEY, name TEXT NOT NULL, rods INTEGER NOT NULL DEFAULT 0,
                best INTEGER REFERENCES catch(id), free_cast_day TEXT NOT NULL DEFAULT '',
                free_cast_used INTEGER NOT NULL DEFAULT 0, gift_casts INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS seat(
                id INTEGER PRIMARY KEY, uid TEXT UNIQUE REFERENCES angler(uid),
                idle_until REAL NOT NULL DEFAULT 0, last_at REAL NOT NULL DEFAULT 0,
                cast_due_at REAL NOT NULL DEFAULT 0, seat_order INTEGER NOT NULL DEFAULT 0,
                queued_casts INTEGER NOT NULL DEFAULT 0, cast_from_gift INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS normal_queue(
                seq INTEGER PRIMARY KEY, uid TEXT UNIQUE NOT NULL REFERENCES angler(uid)
            );
            CREATE TABLE IF NOT EXISTS vip_queue(
                seq INTEGER PRIMARY KEY, uid TEXT UNIQUE NOT NULL REFERENCES angler(uid)
            );
            CREATE TABLE IF NOT EXISTS catch(
                id INTEGER PRIMARY KEY, uid TEXT NOT NULL REFERENCES angler(uid), seat INTEGER NOT NULL,
                name TEXT NOT NULL, fish TEXT NOT NULL, mm INTEGER NOT NULL, rarity TEXT NOT NULL,
                size TEXT NOT NULL, rod TEXT NOT NULL, caught_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS message(id TEXT PRIMARY KEY, result TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS season_clock(
                id INTEGER PRIMARY KEY CHECK(id=1), season_key TEXT NOT NULL, started_at REAL NOT NULL
            );
        """)
        with self._transaction() as db:
            row = db.execute("SELECT mode FROM session_info LIMIT 1").fetchone()
            if row and row["mode"] != mode:
                raise ValueError("该存档属于其他运行模式，请使用独立存档")
            if not row:
                db.execute("INSERT INTO session_info VALUES(?)", (mode,))
            db.execute("INSERT OR IGNORE INTO season_clock VALUES(1, 'spring', ?)", (time.time(),))
            seat_columns = {column["name"] for column in db.execute("PRAGMA table_info(seat)")}
            if "idle_until" not in seat_columns:
                db.execute("ALTER TABLE seat ADD COLUMN idle_until REAL NOT NULL DEFAULT 0")
                db.execute("UPDATE seat SET idle_until=? WHERE uid IS NOT NULL", (time.time() + IDLE_SECONDS,))
            if "cast_due_at" not in seat_columns:
                db.execute("ALTER TABLE seat ADD COLUMN cast_due_at REAL NOT NULL DEFAULT 0")
            if "seat_order" not in seat_columns:
                db.execute("ALTER TABLE seat ADD COLUMN seat_order INTEGER NOT NULL DEFAULT 0")
                db.execute("UPDATE seat SET seat_order=id WHERE uid IS NOT NULL")
            if "queued_casts" not in seat_columns:
                db.execute("ALTER TABLE seat ADD COLUMN queued_casts INTEGER NOT NULL DEFAULT 0")
            if "cast_from_gift" not in seat_columns:
                db.execute("ALTER TABLE seat ADD COLUMN cast_from_gift INTEGER NOT NULL DEFAULT 0")
            angler_columns = {column["name"] for column in db.execute("PRAGMA table_info(angler)")}
            for column, definition in (("free_cast_day", "TEXT NOT NULL DEFAULT ''"),
                                       ("free_cast_used", "INTEGER NOT NULL DEFAULT 0"),
                                       ("gift_casts", "INTEGER NOT NULL DEFAULT 0")):
                if column not in angler_columns:
                    db.execute(f"ALTER TABLE angler ADD COLUMN {column} {definition}")
            db.executemany("INSERT OR IGNORE INTO seat(id) VALUES(?)", [(i,) for i in range(1, TOTAL_SEATS + 1)])

    @contextmanager
    def _transaction(self, read=False):
        with self.lock:
            db = self.db
            db.execute("BEGIN" if read else "BEGIN IMMEDIATE")
            try:
                yield db
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise

    def _release_seat(self, db, seat_id):
        db.execute("""UPDATE seat SET uid=NULL,last_at=0,idle_until=0,cast_due_at=0,
                      seat_order=0,queued_casts=0,cast_from_gift=0
                      WHERE id=?""", (seat_id,))

    def _fill_seats(self, db, now, vip):
        first, last = (NORMAL_SEATS + 1, TOTAL_SEATS) if vip else (1, NORMAL_SEATS)
        queue = "vip_queue" if vip else "normal_queue"
        waiting = db.execute(f"SELECT uid FROM {queue} ORDER BY seq LIMIT ?", (last - first + 1,)).fetchall()
        for member in waiting:
            seat = db.execute("SELECT id FROM seat WHERE id BETWEEN ? AND ? AND uid IS NULL ORDER BY id LIMIT 1",
                              (first, last)).fetchone()
            if not seat:
                seat = db.execute("""SELECT id FROM seat WHERE id BETWEEN ? AND ?
                                     AND cast_due_at=0 AND idle_until<=?
                                     ORDER BY seat_order, id LIMIT 1""", (first, last, now)).fetchone()
            if not seat:
                break
            uid = member["uid"]
            previous = db.execute("SELECT id,cast_due_at,queued_casts,cast_from_gift FROM seat WHERE uid=?",
                                  (uid,)).fetchone()
            due = previous["cast_due_at"] if previous else 0
            queued = previous["queued_casts"] if previous else 0
            from_gift = previous["cast_from_gift"] if previous else 0
            if previous:
                self._release_seat(db, previous["id"])
            db.execute("""UPDATE seat SET uid=?,last_at=0,idle_until=?,cast_due_at=?,queued_casts=?,cast_from_gift=?,
                          seat_order=(SELECT max(seat_order)+1 FROM seat) WHERE id=?""",
                       (uid, now + IDLE_SECONDS, due, queued, from_gift, seat["id"]))
            db.execute(f"DELETE FROM {queue} WHERE uid=?", (uid,))
            if vip:
                db.execute("DELETE FROM normal_queue WHERE uid=?", (uid,))

    def _fill_queues(self, db, now):
        self._fill_seats(db, now, vip=True)
        self._fill_seats(db, now, vip=False)

    def _request_seat(self, db, now, uid, name, vip):
        queue, label = ("vip_queue", "VIP") if vip else ("normal_queue", "普通席")
        db.execute(f"INSERT OR IGNORE INTO {queue}(uid) VALUES(?)", (uid,))
        self._fill_queues(db, now)
        seat = db.execute("SELECT id FROM seat WHERE uid=?", (uid,)).fetchone()
        if seat and (not vip or seat["id"] > NORMAL_SEATS):
            return f"{name} 加入 {label} {seat['id']} 号席"
        position = db.execute(f"SELECT count(*) FROM {queue} WHERE seq <= (SELECT seq FROM {queue} WHERE uid=?)",
                              (uid,)).fetchone()[0]
        return f"{label}已满，{name} 候补第 {position} 位"

    def _cast_delay(self):
        return self.rng.randint(*CAST_SECONDS_RANGE) if self.interval is None else self.interval

    def _start_cast(self, db, name, seat, now, from_gift=False):
        delay = self._cast_delay()
        db.execute("UPDATE seat SET cast_due_at=?,cast_from_gift=? WHERE id=?",
                   (now + delay, from_gift, seat["id"]))
        return f"{name} 已下竿，等待 {delay:g} 秒上鱼"

    def _request_cast(self, db, uid, name, seat, now):
        if not seat:
            return f"{name} 请先发送「加入」入座，再发送「钓鱼」"
        today = _quota_day(now)
        allowance = db.execute("""SELECT CASE WHEN free_cast_day=? THEN free_cast_used ELSE 0 END AS used,
                                  gift_casts FROM angler WHERE uid=?""", (today, uid)).fetchone()
        if allowance["used"] >= DAILY_FREE_CASTS:
            if allowance["gift_casts"] and not seat["cast_due_at"]:
                return self._start_cast(db, name, seat, now, from_gift=True) + "（使用礼物机会）"
            if allowance["gift_casts"]:
                return f"{name} 的礼物机会会自动结算，请等待当前竿次结束"
            return f"{name} 今日 {DAILY_FREE_CASTS} 次免费机会已用完，可送指定鱼竿礼物继续钓鱼"
        used = allowance["used"] + 1
        db.execute("UPDATE angler SET free_cast_day=?,free_cast_used=? WHERE uid=?", (today, used, uid))
        if seat["cast_due_at"]:
            queued = seat["queued_casts"] + 1
            db.execute("UPDATE seat SET queued_casts=? WHERE id=?", (queued, seat["id"]))
            result = f"{name} 的钓鱼指令已排队"
        else:
            result = self._start_cast(db, name, seat, now)
        return f"{result} · 今日免费剩余 {DAILY_FREE_CASTS - used} 次"

    def _land_fish(self, db, seat, now):
        uid = seat["uid"]
        upgraded = seat["rods"] > 0
        fish, mm, rarity, size = draw_fish(self.rng, upgraded)
        rod = "好竿" if upgraded else "普通竿"
        caught = db.execute("""INSERT INTO catch(uid,seat,name,fish,mm,rarity,size,rod,caught_at)
                               VALUES(?,?,?,?,?,?,?,?,?)""",
                            (uid, seat["id"], seat["name"], fish, mm, rarity, size, rod, now)).lastrowid
        used_gift = seat["cast_from_gift"]
        db.execute("""UPDATE angler SET rods=rods-?, gift_casts=gift_casts-?, best=CASE
                      WHEN best IS NULL OR ?>(SELECT mm FROM catch WHERE id=best) THEN ?
                      ELSE best END WHERE uid=?""", (int(upgraded), used_gift, mm, caught, uid))
        queued = seat["queued_casts"]
        next_from_gift = not queued and seat["gift_casts"] > used_gift
        next_due = now + self._cast_delay() if queued or next_from_gift else 0
        db.execute("""UPDATE seat SET last_at=?,idle_until=?,cast_due_at=?,queued_casts=?,cast_from_gift=?
                      WHERE id=?""",
                   (now, now + IDLE_SECONDS, next_due, max(0, queued - 1), next_from_gift, seat["id"]))

    def _advance(self, db, now):
        ready = db.execute("""SELECT s.id, s.queued_casts, s.cast_from_gift, a.uid, a.name, a.rods, a.gift_casts
                              FROM seat s JOIN angler a ON a.uid=s.uid
                              WHERE s.cast_due_at>0 AND s.cast_due_at<=? ORDER BY s.cast_due_at, s.id""",
                           (now,)).fetchall()
        for seat in ready:
            self._land_fish(db, seat, now)
        self._fill_queues(db, now)

    def _handle(self, db, uid, name, action, count, now):
        if action in SEASON_ACTIONS:
            key = SEASON_ACTIONS[action]
            db.execute("UPDATE season_clock SET season_key=?, started_at=? WHERE id=1", (key, now))
            return f"{name} 的礼物让渔港进入{SEASONS[key]}，本季从现在起持续 10 分钟"
        db.execute("""INSERT INTO angler(uid,name) VALUES(?,?) ON CONFLICT(uid)
                      DO UPDATE SET name=excluded.name""", (uid, name))
        seat = db.execute("SELECT id,cast_due_at,queued_casts FROM seat WHERE uid=?", (uid,)).fetchone()
        if action == "rod":
            db.execute("UPDATE angler SET rods=rods+?,gift_casts=gift_casts+? WHERE uid=?", (count, count, uid))
            if seat and not seat["cast_due_at"]:
                return self._start_cast(db, name, seat, now, from_gift=True) + f" · 获得 {count} 次礼物机会"
            if seat:
                return f"{name} 获得 {count} 次礼物机会，已加入待下竿队列"
            return f"{name} 获得 {count} 次礼物机会和好竿，入座后可使用"
        if action == "fish":
            return self._request_cast(db, uid, name, seat, now)
        if action == "leave":
            queued = db.execute("DELETE FROM vip_queue WHERE uid=?", (uid,)).rowcount
            queued += db.execute("DELETE FROM normal_queue WHERE uid=?", (uid,)).rowcount
            if seat:
                self._release_seat(db, seat["id"])
                self._fill_queues(db, now)
                return f"{name} 已离开 {seat['id']} 号席，剩余好竿和未结算的礼物机会保留"
            return f"{name} 已退出候补" if queued else f"{name} 当前未入席"
        if action == "join":
            if seat:
                return f"{name} 已在 {seat['id']} 号席"
            return self._request_seat(db, now, uid, name, vip=False)
        if seat and seat["id"] > NORMAL_SEATS:
            return f"{name} 已在 VIP {seat['id']} 号席"
        return self._request_seat(db, now, uid, name, vip=True)

    def event(self, event_id, uid, name, action, count=1):
        if action not in ("join", "leave", "vip", "rod", "fish", *SEASON_ACTIONS):
            return "未匹配玩法指令"
        if not isinstance(event_id, str) or not event_id or not isinstance(uid, str) or not uid:
            raise ValueError("缺少事件或观众标识")
        if type(count) is not int or not 1 <= count <= 2147483647:
            raise ValueError("事件数量无效")
        with self._transaction() as db:
            seen = db.execute("SELECT result FROM message WHERE id=?", (event_id,)).fetchone()
            if seen:
                return seen["result"]
            now = time.time()
            self._advance(db, now)
            result = self._handle(db, uid, _name(name), action, count, now)
            db.execute("INSERT INTO message VALUES(?,?)", (event_id, result))
            return result

    def advance(self, now=None):
        with self._transaction() as db:
            self._advance(db, time.time() if now is None else now)

    def _season(self, db, now):
        # The persisted anchor also covers missed boundaries while the room was closed.
        anchor = db.execute("SELECT season_key, started_at FROM season_clock WHERE id=1").fetchone()
        elapsed = max(0, int((now - anchor["started_at"]) // SEASON_SECONDS))
        index = (SEASON_ORDER.index(anchor["season_key"]) + elapsed) % len(SEASON_ORDER)
        key = SEASON_ORDER[index]
        return {"key": key, "name": SEASONS[key],
                "nextChangeAt": anchor["started_at"] + (elapsed + 1) * SEASON_SECONDS}

    def state(self):
        with self._transaction(read=True) as db:
            now = time.time()
            seats = [dict(r) for r in db.execute("""
                SELECT s.id,s.id>10 AS vip,a.name,coalesce(a.rods,0) AS rod_ready,
                    s.last_at AS last_catch_at,
                    s.queued_casts + CASE WHEN s.cast_due_at>0 THEN coalesce(a.gift_casts,0)-s.cast_from_gift ELSE 0 END
                        AS queued_casts,
                    ? - CASE WHEN a.free_cast_day=? THEN a.free_cast_used ELSE 0 END AS free_casts_left,
                    EXISTS(SELECT 1 FROM vip_queue q WHERE q.uid=s.uid) AS vip_waiting
                FROM seat s LEFT JOIN angler a ON a.uid=s.uid ORDER BY s.id
            """, (DAILY_FREE_CASTS, _quota_day(now)))]
            for seat in seats:
                seat["vip"] = bool(seat["vip"])
                seat["vip_waiting"] = bool(seat["vip_waiting"])
            ranking = [dict(r) for r in db.execute("""
                SELECT a.name,c.fish,c.mm/10.0 AS cm,c.rarity,c.size,c.rod,c.id,c.seat FROM angler a
                JOIN catch c ON c.id=a.best ORDER BY c.mm DESC,c.id LIMIT 5
            """)]
            catches = [dict(r) for r in db.execute("""
                SELECT id,seat,name,fish,mm/10.0 AS cm,rarity,size,rod,caught_at
                FROM catch ORDER BY id DESC LIMIT 12
            """)]
            waiting_vip = db.execute("SELECT count(*) FROM vip_queue").fetchone()[0]
            waiting_normal = db.execute("SELECT count(*) FROM normal_queue").fetchone()[0]
            return {"mode": self.mode, "demo": self.mode == "demo", "server_time": now,
                    "season": self._season(db, now),
                    "daily_free_casts": DAILY_FREE_CASTS,
                    "cast_seconds": self.interval, "cast_seconds_range": CAST_SECONDS_RANGE,
                    "seats": seats, "ranking": ranking,
                    "catches": catches, "waiting_vip": waiting_vip, "waiting_normal": waiting_normal}

    def close(self):
        with self.lock:
            self.db.close()
