"""晚汐渔港 – run directly for the offline play room, or pass --live."""
import argparse
import hashlib
import json
import logging
import os
import sqlite3
import sys
import threading
import time
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from douyin import CallbackError, clean_name, read_events, subscribe
from engine import Engine
from receipts import Receipts

ASSETS = Path(__file__).resolve().parent
HOME_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ASSETS
DEMO_PLAYERS = ("小满", "阿潮", "星野", "橘猫", "白露", "海盐", "半夏", "小渔", "椰青", "薄荷", "晚风", "阿渡")
FILES = {"/": ("game.html", "text/html"), "/scene.js": ("scene.js", "application/javascript"),
         "/species.js": ("species.js", "application/javascript"),
         "/game.js": ("game.js", "application/javascript"), "/game.css": ("game.css", "text/css")}


class Inbox:
    """Persist a signed batch before acknowledging it; replay uses the engine's event IDs."""
    def __init__(self, path):
        self.lock = threading.Lock()
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        with self.db:
            self.db.execute("""CREATE TABLE IF NOT EXISTS inbox (
              seq INTEGER PRIMARY KEY, msg TEXT UNIQUE, uid TEXT, name TEXT, action TEXT, count INTEGER)""")

    def put(self, events):
        if events:
            with self.lock, self.db:
                self.db.executemany("INSERT OR IGNORE INTO inbox(msg,uid,name,action,count) VALUES (?,?,?,?,?)", events)

    def process(self, game, receipts):
        with self.lock:
            rows = self.db.execute("SELECT * FROM inbox ORDER BY seq LIMIT 256").fetchall()
        if rows:
            feedback = []
            for seq, *event in rows:
                result = game.event(*event)
                msg_type, msg_id = event[0].split(":", 1)
                feedback.append((msg_type, msg_id, result))
            if receipts:
                receipts.register(feedback)
            with self.lock, self.db:
                self.db.execute("DELETE FROM inbox WHERE seq<=?", (rows[-1][0],))


def demo_event(game, name, action):
    uid = "demo:" + name.casefold()
    return game.event(uuid.uuid4().hex, uid, name, action)


def main():
    parser = argparse.ArgumentParser(description="晚汐渔港 · 弹幕钓鱼")
    parser.add_argument("--live", action="store_true", help="连接已获授权的真实直播间")
    parser.add_argument("--subscribe", action="store_true", help="开机时启动平台推送任务")
    parser.add_argument("--stop-push", action="store_true", help="停止对应房间的平台推送")
    parser.add_argument("--no-browser", action="store_true", help="后台运行服务")
    parser.add_argument("--interval", type=float, default=8, help="两次抛竿之间的秒数（默认 8）")
    parser.add_argument("--port", type=int, default=8786)
    parser.add_argument("--data", type=Path, default=HOME_DIR / "saves", help="存档目录")
    args = parser.parse_args()
    if not 1 <= args.interval <= 3600 or not 0 <= args.port <= 65535:
        parser.error("interval 取 1 到 3600，port 取 0 到 65535")
    if (args.subscribe or args.stop_push) and not args.live:
        parser.error("订阅参数需配合 --live 使用")
    room_id = os.getenv("DOUYIN_ROOM_ID", "").strip()
    appid = os.getenv("DOUYIN_APP_ID", "").strip()
    secret = os.getenv("DOUYIN_PUSH_SECRET", "").strip()
    if args.live and not (room_id and appid):
        parser.error("直播模式需要设置 DOUYIN_ROOM_ID 和 DOUYIN_APP_ID")
    vip_id = os.getenv("FISH_VIP_GIFT_ID", "").strip() if args.live else ""
    rod_id = os.getenv("FISH_ROD_GIFT_ID", "").strip() if args.live else ""
    if vip_id and vip_id == rod_id:
        parser.error("两种礼物必须使用不同的 sec_gift_id")
    gift_actions = {key: value for key, value in [(vip_id, "vip"), (rod_id, "rod")] if key}
    if args.stop_push:
        subscribe(room_id, bool(gift_actions), stopping=True)
        return
    if args.live and not secret:
        parser.error("直播模式需要设置 DOUYIN_PUSH_SECRET")
    if args.subscribe and not (os.getenv("DOUYIN_APP_ID") and
                               (os.getenv("DOUYIN_APP_SECRET") or os.getenv("DOUYIN_ACCESS_TOKEN"))):
        parser.error("自动订阅还需要 AppID 和应用密钥或有效令牌，详见使用说明")
    mode = "live" if args.live else "demo"
    key = "live-" + hashlib.sha256(room_id.encode()).hexdigest()[:20] if args.live else "demo"
    args.data.mkdir(parents=True, exist_ok=True)
    # Cache only shipped browser assets. No filesystem path is formed from a request.
    assets = {path: ((ASSETS / filename).read_bytes(), typ + "; charset=utf-8")
              for path, (filename, typ) in FILES.items() if (ASSETS / filename).is_file()}
    if "/" not in assets or "/scene.js" not in assets:
        raise FileNotFoundError("缺少画面文件，请使用完整发行包或源码目录")
    gifts = {
        "vip": not args.live or bool(vip_id), "rod": not args.live or bool(rod_id),
        "vip_label": os.getenv("FISH_VIP_GIFT_NAME", "") or "席位礼物",
        "rod_label": os.getenv("FISH_ROD_GIFT_NAME", "") or "鱼竿礼物",
    }
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *values):
            pass

        def send(self, status, content, mime="application/json; charset=utf-8"):
            if not isinstance(content, bytes):
                content = json.dumps(content, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            try:
                self.wfile.write(content)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            path = urlsplit(self.path).path
            if path in assets:
                return self.send(200, *assets[path])
            if path == "/state":
                pending = receipts.pending() if receipts else []
                state = game.state()
                state["gifts"] = gifts
                state["receipts"] = pending
                return self.send(200, state)
            if path == "/favicon.ico":
                return self.send(204, b"")
            return self.send(404, {})

        def do_POST(self):
            path = urlsplit(self.path).path
            if path != ("/douyin" if args.live else "/simulate") and not (path == "/receipts" and receipts):
                return self.send(404, {})
            if self.headers.get_content_type() != "application/json":
                return self.send(415, {})
            try:
                n = int(self.headers.get("Content-Length", -1))
            except ValueError:
                return self.send(400, {})
            if not 0 < n <= 2*1024*1024:
                return self.send(413, {})
            data = self.rfile.read(n)
            if path == "/douyin":
                try:
                    events = read_events(self.headers, data, secret, room_id, gift_actions)
                    inbox.put(events)
                except CallbackError as exc:
                    return self.send(exc.status, {"message": str(exc)})
                except sqlite3.Error:
                    logging.exception("回调写入存档失败")
                    return self.send(503, {})
                return self.send(200, {})
            try:
                req = json.loads(data)
            except (UnicodeError, ValueError, RecursionError):
                return self.send(400, {})
            if not isinstance(req, dict):
                return self.send(400, {})
            if path == "/receipts":
                keys, received, rendered = (req.get(k) for k in ("keys", "received_ms", "rendered_ms"))
                if (not isinstance(keys,list) or not 1 <= len(keys) <= 100 or
                    not all(isinstance(k,str) and 0 < len(k) <= 1024 for k in keys) or
                    type(received) is not int or type(rendered) is not int or
                    not 0 < received <= rendered <= (time.time()+300)*1000):
                    return self.send(400, {})
                receipts.mark(keys, received, rendered)
                return self.send(200, {})
            action = req.get("action")
            if action == "populate":
                for index, name in enumerate(DEMO_PLAYERS):
                    demo_event(game, name, "join" if index < 10 else "vip")
                return self.send(200, {"message": "已安排体验钓手入座，空位优先，已有钓手保留。"})
            name = clean_name(req.get("name"))
            if not name or action not in ("join", "leave", "vip", "rod"):
                return self.send(400, {"message": "请填写钓手名，并选择有效操作。"})
            return self.send(200, {"message": demo_event(game, name, action)})

    def loop():
        while not done.wait(.25):
            try:
                if inbox:
                    inbox.process(game, receipts)
                game.advance()
            except sqlite3.OperationalError:
                logging.exception("暂时无法写入存档，将重试")
                done.wait(1)

    def report_receipts():
        while not done.wait(1):
            try:
                receipts.flush()
            except (ValueError, OSError, RuntimeError, sqlite3.Error) as exc:
                logging.warning("履约上报延后，将重试：%s", exc)
                done.wait(10)

    def start_push():
        for delay in (0, 4, 15):
            if done.wait(delay):
                return
            try:
                subscribe(room_id, bool(gift_actions))
                return
            except (ValueError, OSError, RuntimeError) as exc:
                logging.error("启动推送失败：%s", exc)
        logging.error("请核对权限和挂载状态，成功后重启并带 --subscribe。")

    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        game = Engine(args.data / (key+".sqlite3"), mode, args.interval)
        inbox = Inbox(args.data / (key+"-inbox.sqlite3")) if args.live else None
        receipts = Receipts(args.data / (key+"-receipts.sqlite3"), room_id, appid) if args.live else None
        address = f"http://127.0.0.1:{server.server_port}/"
        print("晚汐渔港", "· 直播接入" if args.live else "· 本地试玩", flush=True)
        print("操作台", address, "\n投屏页", address+"?broadcast=1", "\n存档", args.data,
              "\n关闭此窗口或按 Ctrl+C 停止。", flush=True)
        threading.Thread(target=loop, daemon=True).start()
        if receipts and appid and (os.getenv("DOUYIN_APP_SECRET") or os.getenv("DOUYIN_ACCESS_TOKEN")):
            threading.Thread(target=report_receipts, daemon=True).start()
        if args.subscribe:
            threading.Thread(target=start_push, daemon=True).start()
        if not args.no_browser:
            webbrowser.open(address)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            done.set()


if __name__ == "__main__":
    main()
