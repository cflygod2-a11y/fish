"""Transactional single-session fishing rules for Python 3.9+."""
import bisect
import random
import sqlite3
import threading
import time
import unicodedata
from contextlib import contextmanager


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
DEFAULT_CAST_SECONDS = 8
NORMAL_SEATS = 10
TOTAL_SEATS = 12


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


class Engine:
    def __init__(self, path, mode, interval=DEFAULT_CAST_SECONDS):
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
                best INTEGER REFERENCES catch(id)
            );
            CREATE TABLE IF NOT EXISTS seat(
                id INTEGER PRIMARY KEY, uid TEXT UNIQUE REFERENCES angler(uid),
                idle_until REAL NOT NULL DEFAULT 0, last_at REAL NOT NULL DEFAULT 0,
                cast_due_at REAL NOT NULL DEFAULT 0
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
        """)
        with self._transaction() as db:
            row = db.execute("SELECT mode FROM session_info LIMIT 1").fetchone()
            if row and row["mode"] != mode:
                raise ValueError("该存档属于其他运行模式，请使用独立存档")
            if not row:
                db.execute("INSERT INTO session_info VALUES(?)", (mode,))
            seat_columns = {column["name"] for column in db.execute("PRAGMA table_info(seat)")}
            if "idle_until" not in seat_columns:
                db.execute("ALTER TABLE seat ADD COLUMN idle_until REAL NOT NULL DEFAULT 0")
                db.execute("UPDATE seat SET idle_until=? WHERE uid IS NOT NULL", (time.time() + IDLE_SECONDS,))
            if "cast_due_at" not in seat_columns:
                db.execute("ALTER TABLE seat ADD COLUMN cast_due_at REAL NOT NULL DEFAULT 0")
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

    def _fill_vip(self, db, now):
        free = db.execute("SELECT id FROM seat WHERE id>10 AND uid IS NULL ORDER BY id").fetchall()
        waiting = db.execute("SELECT uid FROM vip_queue ORDER BY seq LIMIT ?", (len(free),)).fetchall()
        for seat, member in zip(free, waiting):
            uid = member["uid"]
            previous = db.execute("SELECT cast_due_at FROM seat WHERE uid=?", (uid,)).fetchone()
            due = previous["cast_due_at"] if previous else 0
            db.execute("UPDATE seat SET uid=NULL,last_at=0,idle_until=0,cast_due_at=0 WHERE uid=?", (uid,))
            db.execute("UPDATE seat SET uid=?,last_at=0,idle_until=?,cast_due_at=? WHERE id=?",
                       (uid, now + IDLE_SECONDS, due, seat["id"]))
            db.execute("DELETE FROM vip_queue WHERE uid=?", (uid,))

    def _expire_idle(self, db, now):
        for first, last in ((1, NORMAL_SEATS), (NORMAL_SEATS + 1, TOTAL_SEATS)):
            free = db.execute("SELECT 1 FROM seat WHERE id BETWEEN ? AND ? AND uid IS NULL LIMIT 1",
                              (first, last)).fetchone()
            if not free:
                db.execute("""UPDATE seat SET uid=NULL, idle_until=0, last_at=0
                              WHERE id BETWEEN ? AND ? AND cast_due_at=0 AND idle_until<=?""",
                           (first, last, now))
        self._fill_vip(db, now)

    def _start_cast(self, db, name, seat, now):
        if seat["cast_due_at"]:
            return f"{name} 已下竿，正在等鱼上钩"
        db.execute("UPDATE seat SET cast_due_at=? WHERE id=?", (now + self.interval, seat["id"]))
        return f"{name} 已下竿，等待 {self.interval:g} 秒上鱼"

    def _land_fish(self, db, seat, now):
        uid = seat["uid"]
        upgraded = seat["rods"] > 0
        fish, mm, rarity, size = draw_fish(self.rng, upgraded)
        rod = "好竿" if upgraded else "普通竿"
        caught = db.execute("""INSERT INTO catch(uid,seat,name,fish,mm,rarity,size,rod,caught_at)
                               VALUES(?,?,?,?,?,?,?,?,?)""",
                            (uid, seat["id"], seat["name"], fish, mm, rarity, size, rod, now)).lastrowid
        db.execute("""UPDATE angler SET rods=rods-?, best=CASE
                      WHEN best IS NULL OR ?>(SELECT mm FROM catch WHERE id=best) THEN ?
                      ELSE best END WHERE uid=?""", (int(upgraded), mm, caught, uid))
        db.execute("UPDATE seat SET last_at=?,idle_until=?,cast_due_at=0 WHERE id=?",
                   (now, now + IDLE_SECONDS, seat["id"]))

    def _advance(self, db, now):
        ready = db.execute("""SELECT s.id, a.uid, a.name, a.rods FROM seat s JOIN angler a ON a.uid=s.uid
                              WHERE s.cast_due_at>0 AND s.cast_due_at<=? ORDER BY s.cast_due_at, s.id""",
                           (now,)).fetchall()
        for seat in ready:
            self._land_fish(db, seat, now)
        self._expire_idle(db, now)

    def _handle(self, db, uid, name, action, count, now):
        db.execute("""INSERT INTO angler(uid,name) VALUES(?,?) ON CONFLICT(uid)
                      DO UPDATE SET name=excluded.name""", (uid, name))
        seat = db.execute("SELECT id,cast_due_at FROM seat WHERE uid=?", (uid,)).fetchone()
        if action == "rod":
            db.execute("UPDATE angler SET rods=rods+? WHERE uid=?", (count, uid))
            if seat:
                return self._start_cast(db, name, seat, now)
            return f"{name} 获得 {count} 次好竿，入座后优先使用"
        if action == "fish":
            if seat:
                return self._start_cast(db, name, seat, now)
            return f"{name} 请先发送「加入」入座，再发送「钓鱼」"
        if action == "leave":
            queued = db.execute("DELETE FROM vip_queue WHERE uid=?", (uid,)).rowcount
            if seat:
                db.execute("UPDATE seat SET uid=NULL,idle_until=0,last_at=0,cast_due_at=0 WHERE uid=?", (uid,))
                self._fill_vip(db, now)
                return f"{name} 已离开 {seat['id']} 号席，剩余好竿保留"
            return f"{name} 已退出候补" if queued else f"{name} 当前未入席"
        if action == "join":
            if seat:
                return f"{name} 已在 {seat['id']} 号席"
            empty = db.execute("SELECT id FROM seat WHERE id<=10 AND uid IS NULL ORDER BY id LIMIT 1").fetchone()
            if not empty:
                return "10 个普通席已满，请等有空席时再发送「加入」"
            db.execute("UPDATE seat SET uid=?,idle_until=?,last_at=0 WHERE id=?",
                       (uid, now + IDLE_SECONDS, empty["id"]))
            return f"{name} 加入 {empty['id']} 号席"
        if seat and seat["id"] > 10:
            return f"{name} 已在 VIP {seat['id']} 号席"
        db.execute("INSERT OR IGNORE INTO vip_queue(uid) VALUES(?)", (uid,))
        self._fill_vip(db, now)
        vip = db.execute("SELECT id FROM seat WHERE uid=? AND id>10", (uid,)).fetchone()
        if vip:
            return f"{name} 加入 VIP {vip['id']} 号席"
        position = db.execute("SELECT count(*) FROM vip_queue WHERE seq <= (SELECT seq FROM vip_queue WHERE uid=?)",
                              (uid,)).fetchone()[0]
        return f"VIP 已满，{name} 候补第 {position} 位，空席时自动入座"

    def event(self, event_id, uid, name, action, count=1):
        if action not in ("join", "leave", "vip", "rod", "fish"):
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

    def state(self):
        with self._transaction(read=True) as db:
            seats = [dict(r) for r in db.execute("""
                SELECT s.id,s.id>10 AS vip,a.name,coalesce(a.rods,0) AS rod_ready,
                    s.last_at AS last_catch_at,
                    EXISTS(SELECT 1 FROM vip_queue q WHERE q.uid=s.uid) AS vip_waiting
                FROM seat s LEFT JOIN angler a ON a.uid=s.uid ORDER BY s.id
            """)]
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
            waiting = db.execute("SELECT count(*) FROM vip_queue").fetchone()[0]
            return {"mode": self.mode, "demo": self.mode == "demo", "server_time": time.time(),
                    "cast_seconds": self.interval, "seats": seats, "ranking": ranking,
                    "catches": catches, "waiting_vip": waiting}

    def close(self):
        with self.lock:
            self.db.close()
