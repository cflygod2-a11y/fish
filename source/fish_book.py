"""Persistent personal species records and the shared, non-blocking display queue.

Every function runs within the owning Engine transaction, except create_schema.
Browser connections never acknowledge or restart a display: the server owns time.
"""
import json

from fish_catalog import FISH_BY_NAME, public_catalog


PAGE_SECONDS = 4
PAGE_SIZE = 9
QUERY_ENTER_SECONDS = .5
QUERY_EXIT_SECONDS = .3
ALBUM_SECONDS = 12.8
CARD_SECONDS = 6.8
RECORD_SECONDS = 2.0
CATCH_PRESENTATION_DELAY = 2.3
PENDING_LIFETIME = 300
MAX_PENDING_QUERIES = 20
DISCOVERY_SECONDS = {"常见": 3.2, "少见": 3.2, "稀有": 3.2, "传说": 4.2, "神秘": 4.8}


def create_schema(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS fish_record(
            uid TEXT NOT NULL REFERENCES angler(uid), fish TEXT NOT NULL,
            best_mm INTEGER NOT NULL, first_catch_id INTEGER NOT NULL REFERENCES catch(id),
            last_catch_id INTEGER NOT NULL REFERENCES catch(id),
            first_at REAL NOT NULL, last_at REAL NOT NULL, catches INTEGER NOT NULL,
            PRIMARY KEY(uid,fish)
        );
        CREATE INDEX IF NOT EXISTS catch_owner_species ON catch(uid,fish,mm);
        CREATE TABLE IF NOT EXISTS fish_book_display(
            id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
            uid TEXT NOT NULL REFERENCES angler(uid), fish TEXT,
            requested_at REAL NOT NULL, available_at REAL NOT NULL,
            started_at REAL, ends_at REAL, duration REAL NOT NULL,
            expires_at REAL NOT NULL, payload TEXT NOT NULL DEFAULT '{}'
        );
        CREATE UNIQUE INDEX IF NOT EXISTS fish_book_one_pending_query
            ON fish_book_display(uid) WHERE started_at IS NULL AND kind IN ('album','card');
    """)


def migrate_records(db):
    if db.execute("SELECT 1 FROM schema_migration WHERE name='fish_book_v1'").fetchone():
        return
    # Upgrade all history, not just the last twelve catches sent to browsers.
    # Backfilling is intentionally silent; none of these fish was just caught.
    db.execute("""INSERT OR IGNORE INTO fish_record
        SELECT uid,fish,MAX(mm),MIN(id),MAX(id),MIN(caught_at),MAX(caught_at),COUNT(*)
        FROM catch GROUP BY uid,fish""")
    db.execute("INSERT INTO schema_migration VALUES('fish_book_v1')")


def view_target(action):
    """Return (is_view_command, target); reject unknown targets without falling into VIP."""
    if action == 'view':
        return True, None
    if isinstance(action, str) and action.startswith('view:'):
        return True, action[5:]
    return False, None


def personal_book(db, uid):
    member = db.execute("SELECT name FROM angler WHERE uid=?", (uid,)).fetchone()
    records = {r['fish']: r for r in db.execute("SELECT * FROM fish_record WHERE uid=?", (uid,))}
    cards = []
    for index, fish in enumerate(public_catalog(), 1):
        record = records.get(fish['name'])
        cards.append(dict(id=str(index).zfill(3), fish=fish['name'], rarity=fish['rarity'],
                          seasons=fish['seasons'], min_cm=fish['min_cm'], max_cm=fish['max_cm'],
                          unlocked=record is not None, best_cm=record['best_mm'] / 10 if record else None))
    return dict(uid=uid, name=member['name'] if member else '钓友', total=len(cards),
                collected=sum(card['unlocked'] for card in cards), cards=cards)


def _enqueue(db, kind, uid, fish, now, available_at, duration, payload=None):
    return db.execute("""INSERT INTO fish_book_display
        (kind,uid,fish,requested_at,available_at,duration,expires_at,payload)
        VALUES(?,?,?,?,?,?,?,?)""", (kind, uid, fish, now, available_at, duration,
                                     now + PENDING_LIFETIME,
                                     json.dumps(payload or {}, ensure_ascii=False))).lastrowid


def request_view(db, uid, name, target, now):
    if target is not None and target not in FISH_BY_NAME:
        return '没有这条鱼，请发送「查看」或「查看 红石斑」'
    kind = 'card' if target else 'album'
    active = db.execute("""SELECT * FROM fish_book_display WHERE started_at IS NOT NULL
                           AND uid=? AND kind IN ('album','card')""", (uid,)).fetchone()
    if active and active['fish'] == target:
        return f'{name} 的鱼册正在展示，重复请求已合并'
    queued = db.execute("""SELECT id FROM fish_book_display WHERE started_at IS NULL
                           AND uid=? AND kind IN ('album','card')""", (uid,)).fetchone()
    if queued:
        # A new target replaces this user's waiting request without moving their place
        # or extending its lifetime. Active display time is never reset by spam.
        db.execute("UPDATE fish_book_display SET kind=?,fish=?,duration=? WHERE id=?",
                   (kind, target, CARD_SECONDS if target else ALBUM_SECONDS, queued['id']))
        return f'{name} 的鱼册请求已合并，保留原排队位置'
    count = db.execute("""SELECT COUNT(*) FROM fish_book_display
                          WHERE started_at IS NULL AND kind IN ('album','card')""").fetchone()[0]
    if count >= MAX_PENDING_QUERIES:
        return f'鱼册查询队列已满（{MAX_PENDING_QUERIES} 人），请稍后再发「查看」；收藏记录不受影响'
    _enqueue(db, kind, uid, target, now, now, CARD_SECONDS if target else ALBUM_SECONDS)
    advance_display(db, now)
    active = db.execute("SELECT uid,kind,fish FROM fish_book_display WHERE started_at IS NOT NULL").fetchone()
    if active and active['uid'] == uid and active['kind'] == kind and active['fish'] == target:
        return f'正在打开 {name} 的' + (f'「{target}」鱼卡' if target else '鱼册，自动翻页后收起')
    return f'{name} 的鱼册已排队，轮到后自动展示'


def record_catch(db, uid, fish, mm, rarity, catch_id, now):
    previous = db.execute("SELECT best_mm FROM fish_record WHERE uid=? AND fish=?", (uid, fish)).fetchone()
    before = sum(row['fish'] in FISH_BY_NAME for row in db.execute("SELECT fish FROM fish_record WHERE uid=?", (uid,)))
    if previous:
        db.execute("""UPDATE fish_record SET best_mm=MAX(best_mm,?),last_catch_id=?,last_at=?,catches=catches+1
                      WHERE uid=? AND fish=?""", (mm, catch_id, now, uid, fish))
        if mm <= previous['best_mm']:
            return
        kind, duration = 'record', RECORD_SECONDS
    else:
        db.execute("INSERT INTO fish_record VALUES(?,?,?,?,?,?,?,1)",
                   (uid, fish, mm, catch_id, catch_id, now, now))
        kind, duration = 'discovery', DISCOVERY_SECONDS[rarity]
    payload = dict(catch=dict(fish=fish, cm=mm / 10, rarity=rarity,
                             previous_cm=previous['best_mm'] / 10 if previous else None,
                             catch_id=catch_id),
                   collection_before=before, collection_after=before + (0 if previous else 1))
    if kind == 'record':
        pending = db.execute("""SELECT id,payload FROM fish_book_display
            WHERE started_at IS NULL AND kind='record' AND uid=? AND fish=?""", (uid, fish)).fetchone()
        if pending:
            # Consecutive personal bests use one waiting slot. Preserve the old baseline.
            payload['catch']['previous_cm'] = json.loads(pending['payload'])['catch']['previous_cm']
            db.execute("UPDATE fish_book_display SET payload=? WHERE id=?",
                       (json.dumps(payload, ensure_ascii=False), pending['id']))
            return
    _enqueue(db, kind, uid, fish, now, now + CATCH_PRESENTATION_DELAY, duration, payload)


def advance_display(db, now):
    # Expiry affects only transient presentation; fish_record and catch are permanent.
    db.execute("DELETE FROM fish_book_display WHERE started_at IS NULL AND expires_at<=?", (now,))
    db.execute("DELETE FROM fish_book_display WHERE started_at IS NOT NULL AND ends_at<=?", (now,))
    if db.execute("SELECT 1 FROM fish_book_display WHERE started_at IS NOT NULL").fetchone():
        return
    next_show = db.execute("SELECT * FROM fish_book_display ORDER BY id LIMIT 1").fetchone()
    if not next_show or next_show['available_at'] > now:
        return
    payload = json.loads(next_show['payload'])
    # A display has a stable snapshot and timeline shared by every browser connection.
    payload['book'] = personal_book(db, next_show['uid'])
    db.execute("UPDATE fish_book_display SET started_at=?,ends_at=?,payload=? WHERE id=?",
               (now, now + next_show['duration'], json.dumps(payload, ensure_ascii=False), next_show['id']))


def display_state(db, now):
    advance_display(db, now)
    active = db.execute("SELECT * FROM fish_book_display WHERE started_at IS NOT NULL").fetchone()
    current = None
    if active:
        current = dict(active)
        current.update(json.loads(current.pop('payload')))
        member = db.execute("SELECT name FROM angler WHERE uid=?", (active['uid'],)).fetchone()
        current['name'] = member['name'] if member else current['book']['name']
        current['book']['name'] = current['name']
        current['content_started_at'] = active['started_at'] + (QUERY_ENTER_SECONDS if active['kind'] in ('album', 'card') else 0)
        current['page'] = min(2, max(0, int((now - current['content_started_at']) // PAGE_SECONDS))) if active['kind'] == 'album' else 0
    pending = [dict(row) for row in db.execute("""SELECT d.id,d.uid,a.name,d.kind,d.fish
        FROM fish_book_display d JOIN angler a ON a.uid=d.uid
        WHERE started_at IS NULL ORDER BY d.id""")]
    return dict(current=current, queue=pending, page_seconds=PAGE_SECONDS, page_size=PAGE_SIZE,
                query_enter_seconds=QUERY_ENTER_SECONDS, query_exit_seconds=QUERY_EXIT_SECONDS)
