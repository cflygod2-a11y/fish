"""Durable delivery of the live client's receipt and render timestamps."""
import json
import os
import sqlite3
import threading
import time
from urllib.error import HTTPError

import douyin


ACK_URL = "https://webcast.bytedance.com/api/live_data/ack"


class Receipts:
    def __init__(self, path, room_id, appid):
        self.room_id = room_id
        self.appid = appid
        self.lock = threading.Lock()
        self.sender = threading.Lock()
        self.token = None
        self.expires = 0
        self.db = sqlite3.connect(str(path), timeout=8, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS render_receipt(
                room TEXT NOT NULL, app TEXT NOT NULL, key TEXT NOT NULL, kind TEXT NOT NULL,
                msg TEXT NOT NULL, feedback TEXT NOT NULL, received_ms INTEGER, rendered_ms INTEGER,
                sent_stage INTEGER NOT NULL DEFAULT 0, UNIQUE(room,app,key)
            );
            CREATE INDEX IF NOT EXISTS receipt_pending ON render_receipt(room,app,rendered_ms);
            CREATE INDEX IF NOT EXISTS receipt_to_send ON render_receipt(room,app,sent_stage);
        """)

    def register(self, events_with_feedback):
        rows = []
        for kind, msg, feedback in events_with_feedback:
            if kind not in ("live_comment", "live_gift") or not isinstance(msg, str) or not msg:
                raise ValueError("履约消息格式无效")
            rows.append((self.room_id, self.appid, kind + ":" + msg, kind, msg, feedback))
        with self.lock, self.db:
            self.db.executemany("""INSERT INTO render_receipt(room,app,key,kind,msg,feedback)
                                   VALUES(?,?,?,?,?,?) ON CONFLICT(room,app,key) DO NOTHING""", rows)

    def pending(self):
        with self.lock:
            rows = self.db.execute("""SELECT key,feedback AS message FROM render_receipt
                                      WHERE room=? AND app=? AND rendered_ms IS NULL
                                      ORDER BY rowid LIMIT 100""", (self.room_id, self.appid))
            return [dict(row) for row in rows]

    def mark(self, keys, received_ms, rendered_ms):
        if not isinstance(keys, list) or len(keys) > 100 or not all(isinstance(key, str) for key in keys):
            raise ValueError("单次确认至多 100 条消息")
        if type(received_ms) is not int or not 0 < received_ms < 10**14:
            raise ValueError("客户端接收时间无效")
        if rendered_ms is not None and (type(rendered_ms) is not int or not received_ms <= rendered_ms < 10**14):
            raise ValueError("客户端渲染时间无效")
        with self.lock, self.db:
            self.db.executemany("""UPDATE render_receipt SET received_ms=coalesce(received_ms,?),
                                   rendered_ms=coalesce(rendered_ms,?) WHERE room=? AND app=? AND key=?""",
                                [(received_ms, rendered_ms, self.room_id, self.appid, key) for key in keys])

    def _token(self):
        configured = os.getenv("DOUYIN_ACCESS_TOKEN")
        if configured:
            return configured
        if self.token and self.expires > time.monotonic():
            return self.token
        secret = os.getenv("DOUYIN_APP_SECRET")
        if not self.appid or not secret:
            raise ValueError("履约上报需要 DOUYIN_APP_ID 及应用密钥或有效的 access token")
        data = douyin._post_json(douyin.TOKEN_URL, {"appid": self.appid, "secret": secret,
                                                     "grant_type": "client_credential"})
        token = data.get("access_token")
        if not isinstance(token, str) or not token:
            raise RuntimeError("平台响应缺少有效的 access_token")
        lifetime = int(data.get("expires_in") or 7200)
        self.token = token
        self.expires = time.monotonic() + max(1, lifetime - min(300, lifetime // 5))
        return token

    def flush(self):
        """Send bounded batches; an unconfirmed network result remains retryable."""
        sent = 0
        with self.sender:
            for stage, column in ((1, "received_ms"), (2, "rendered_ms")):
                with self.lock:
                    rows = self.db.execute(
                        f"""SELECT key,msg,kind,{column} AS client_time FROM render_receipt
                            WHERE room=? AND app=? AND sent_stage=? AND {column} IS NOT NULL
                            ORDER BY rowid LIMIT 100""", (self.room_id, self.appid, stage-1)).fetchall()
                if not rows:
                    continue
                data = [{"msg_id": row["msg"], "msg_type": row["kind"], "client_time": row["client_time"]}
                        for row in rows]
                payload = {"room_id": self.room_id, "app_id": self.appid, "ack_type": stage,
                           "data": json.dumps(data, separators=(",", ":"))}
                try:
                    douyin._post_json(ACK_URL, payload, self._token())
                except (HTTPError, RuntimeError) as exc:
                    if getattr(exc, "code", None) == 401 or "40022" in str(exc):
                        self.token = None
                    raise
                with self.lock, self.db:
                    self.db.executemany("""UPDATE render_receipt SET sent_stage=?
                                           WHERE room=? AND app=? AND key=? AND sent_stage=?""",
                                        [(stage, self.room_id, self.appid, row["key"], stage-1) for row in rows])
                sent += len(rows)
        return sent

    def close(self):
        with self.sender, self.lock:
            self.db.close()
