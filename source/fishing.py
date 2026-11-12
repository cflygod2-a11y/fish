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
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from douyin import CallbackError, clean_name, read_events, subscribe
from engine import CAST_SECONDS_RANGE, SEASON_ACTIONS, SEASONS, Engine
from receipts import Receipts

ASSETS = Path(__file__).resolve().parent
HOME_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ASSETS
DEMO_PLAYERS = ("小满", "阿潮", "星野", "橘猫", "白露", "海盐", "半夏", "小渔", "椰青", "薄荷", "晚风", "阿渡")
DEMO_SEASON_GIFTS = {"spring": "春樱", "summer": "流萤", "autumn": "枫叶", "winter": "雪花"}
FILES = {"/": ("game.html", "text/html"), "/scene.js": ("scene.js", "application/javascript"),
         "/npc.js": ("npc.js", "application/javascript"),
         "/species.js": ("species.js", "application/javascript"),
         "/game.js": ("game.js", "application/javascript"), "/game.css": ("game.css", "text/css")}


class Inbox:
    """Persist platform events for replay using the engine's event IDs."""
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
                if receipts:
                    msg_type, msg_id = event[0].split(":", 1)
                    feedback.append((msg_type, msg_id, result))
            if receipts:
                receipts.register(feedback)
            with self.lock, self.db:
                self.db.execute("DELETE FROM inbox WHERE seq<=?", (rows[-1][0],))


def demo_event(game, name, action, count=1):
    uid = "demo:" + name.casefold()
    return game.event(uuid.uuid4().hex, uid, name, action, count)


def gift_configuration(live, platform="douyin"):
    """Bind each platform gift to a single action; expose only labels and availability to clients."""
    actions = {}
    bilibili = live and platform == "bilibili"
    gift_prefix = "BILIBILI" if bilibili else "FISH"
    id_field = "gift_id" if bilibili else "sec_gift_id"

    def configure(action, prefix, default_label, legacy_prefix=None):
        gift_id = os.getenv(prefix + "_ID", "").strip() if live else ""
        configured_prefix = prefix
        if live and not gift_id and legacy_prefix:
            gift_id = os.getenv(legacy_prefix + "_ID", "").strip()
            configured_prefix = legacy_prefix
        if gift_id:
            if bilibili and not (gift_id.isascii() and gift_id.isdecimal() and gift_id[0] != "0"):
                raise ValueError(f"{prefix}_ID 必须是正整数 gift_id")
            if gift_id in actions:
                raise ValueError(f"{prefix}_ID 的 {id_field} 已绑定到 {actions[gift_id]}，每种礼物须单独配置")
            actions[gift_id] = action
        label = (os.getenv(prefix + "_NAME", "").strip() or
                 (os.getenv(configured_prefix + "_NAME", "").strip() if live else "") or default_label)
        return {"enabled": not live or bool(gift_id), "label": label}

    vip = configure("vip", gift_prefix + "_VIP_GIFT", "席位礼物")
    bait = configure("bait", gift_prefix + "_BAIT_GIFT", "鱼饵包", gift_prefix + "_ROD_GIFT")
    seasons = {
        key: configure("season_" + key, f"{gift_prefix}_{key.upper()}_GIFT",
                       name + "礼物" if live else DEMO_SEASON_GIFTS[key])
        for key, name in SEASONS.items()
    }
    return actions, {"vip": vip["enabled"], "vip_label": vip["label"],
                     "bait": bait["enabled"], "bait_label": bait["label"],
                     "bait_casts_per_gift": 10, "seasons": seasons}


def main():
    parser = argparse.ArgumentParser(description="晚汐渔港 · 弹幕钓鱼")
    parser.add_argument("--live", action="store_true", help="连接已获授权的真实直播间")
    parser.add_argument("--platform", choices=("douyin", "bilibili"), default="douyin",
                        help="直播平台（默认 douyin）")
    parser.add_argument("--subscribe", action="store_true", help="开机时启动抖音推送任务")
    parser.add_argument("--stop-push", action="store_true", help="停止对应房间的抖音推送")
    parser.add_argument("--no-browser", action="store_true", help="后台运行服务")
    parser.add_argument("--interval", type=float,
                        help=f"指定固定等待秒数（默认随机 {CAST_SECONDS_RANGE[0]}–{CAST_SECONDS_RANGE[1]} 秒）")
    parser.add_argument("--port", type=int, default=8786)
    parser.add_argument("--data", type=Path, default=HOME_DIR / "saves", help="存档目录")
    args = parser.parse_args()
    if args.interval is not None and not 1 <= args.interval <= 3600:
        parser.error("interval 取 1 到 3600 秒")
    if not 0 <= args.port <= 65535:
        parser.error("port 取 0 到 65535")
    douyin_live = args.live and args.platform == "douyin"
    bilibili_live = args.live and args.platform == "bilibili"
    if args.platform == "bilibili" and not args.live:
        parser.error("B站模式请使用 --live --platform bilibili")
    if (args.subscribe or args.stop_push) and not douyin_live:
        parser.error("订阅参数需配合抖音 --live 模式使用")
    room_id = os.getenv("DOUYIN_ROOM_ID", "").strip()
    appid = os.getenv("DOUYIN_APP_ID", "").strip()
    secret = os.getenv("DOUYIN_PUSH_SECRET", "").strip()
    if douyin_live and not (room_id and appid):
        parser.error("抖音直播需要设置 DOUYIN_ROOM_ID 和 DOUYIN_APP_ID")
    try:
        gift_actions, gifts = gift_configuration(args.live, args.platform)
    except ValueError as exc:
        parser.error(str(exc))
    if args.stop_push:
        subscribe(room_id, bool(gift_actions), stopping=True)
        return
    if douyin_live and not secret:
        parser.error("抖音直播需要设置 DOUYIN_PUSH_SECRET")
    if args.subscribe and not (os.getenv("DOUYIN_APP_ID") and
                               (os.getenv("DOUYIN_APP_SECRET") or os.getenv("DOUYIN_ACCESS_TOKEN"))):
        parser.error("自动订阅还需要 AppID 和应用密钥或有效令牌，详见使用说明")
    mode = "live" if args.live else "demo"
    key = "live-" + hashlib.sha256(room_id.encode()).hexdigest()[:20] if douyin_live else "demo"
    bili = None
    if bilibili_live:
        bili_app = os.getenv("BILIBILI_APP_ID", "").strip()
        bili_key = os.getenv("BILIBILI_ACCESS_KEY_ID", "").strip()
        bili_secret = os.getenv("BILIBILI_ACCESS_KEY_SECRET", "").strip()
        bili_code = os.getenv("BILIBILI_ANCHOR_CODE", "").strip()
        if not (bili_app.isascii() and bili_app.isdecimal() and 0 < len(bili_app) <= 19
                and 0 < int(bili_app) < 2**63 and bili_key and bili_secret and bili_code):
            parser.error("B站直播需要有效的 BILIBILI_APP_ID、BILIBILI_ACCESS_KEY_ID、"
                         "BILIBILI_ACCESS_KEY_SECRET 和 BILIBILI_ANCHOR_CODE")
        try:
            from bilibili import Session as BilibiliSession

            bili = BilibiliSession(int(bili_app), bili_key, bili_secret)
        except ImportError:
            parser.error("B站直播依赖未安装，请执行 python -m pip install -r source/requirements-bilibili.txt")
    args.data.mkdir(parents=True, exist_ok=True)
    # Cache only shipped browser assets. No filesystem path is formed from a request.
    assets = {path: ((ASSETS / filename).read_bytes(), typ + "; charset=utf-8")
              for path, (filename, typ) in FILES.items() if (ASSETS / filename).is_file()}
    if "/" not in assets or "/scene.js" not in assets:
        raise FileNotFoundError("缺少画面文件，请使用完整发行包或源码目录")
    demo_actions = ("join", "leave", "vip", "bait", "rod", "fish", *SEASON_ACTIONS)
    done = threading.Event()
    interaction_route = "/douyin" if douyin_live else "/simulate" if not args.live else None

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
                state["platform"] = args.platform if args.live else None
                if bili:
                    state["live_connected"] = bili.connected
                    state["live_ended"] = bili.ended
                return self.send(200, state)
            if path == "/favicon.ico":
                return self.send(204, b"")
            return self.send(404, {})

        def do_POST(self):
            path = urlsplit(self.path).path
            if path != interaction_route and not (path == "/receipts" and receipts):
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
            if not name or action not in demo_actions:
                return self.send(400, {"message": "请填写钓手名，并选择有效操作。"})
            count = req.get("count", 1)
            if type(count) is not int or not 1 <= count <= 100:
                return self.send(400, {"message": "试玩礼物数量应为 1 到 100 的整数。"})
            return self.send(200, {"message": demo_event(game, name, action, count)})

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

    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server, ExitStack() as cleanup:
        if bili:
            cleanup.callback(bili.close)
            try:
                bili_room = bili.start(bili_code)
            except RuntimeError as error:
                parser.exit(1, f"{error}\n")
            key = "bilibili-" + hashlib.sha256(f"{bili_app}:{bili_room}".encode()).hexdigest()[:20]
        game = Engine(args.data / (key+".sqlite3"), mode, args.interval)
        inbox = Inbox(args.data / (key+"-inbox.sqlite3")) if args.live else None
        receipts = Receipts(args.data / (key+"-receipts.sqlite3"), room_id, appid) if douyin_live else None
        address = f"http://127.0.0.1:{server.server_port}/"
        print("晚汐渔港", "· B站直播" if bili else "· 抖音直播" if douyin_live else "· 本地试玩", flush=True)
        print("操作台", address, "\n投屏页", address+"?broadcast=1", "\n存档", args.data,
              "\n关闭此窗口或按 Ctrl+C 停止。", flush=True)
        bili_worker = None
        try:
            threading.Thread(target=loop, daemon=True).start()
            if receipts and appid and (os.getenv("DOUYIN_APP_SECRET") or os.getenv("DOUYIN_ACCESS_TOKEN")):
                threading.Thread(target=report_receipts, daemon=True).start()
            if args.subscribe:
                threading.Thread(target=start_push, daemon=True).start()
            if bili:
                worker = threading.Thread(target=bili.run, args=(done, inbox, gift_actions), daemon=True)
                worker.start()
                bili_worker = worker
            if not args.no_browser:
                webbrowser.open(address)
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            done.set()
            if bili_worker:
                bili_worker.join(timeout=8)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    main()
