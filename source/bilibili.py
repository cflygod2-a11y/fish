"""Bilibili Open Live app lifecycle and live room message adapter."""
import hashlib
import hmac
import http.client
import json
import logging
import sqlite3
import struct
import time
import uuid
import zlib
from urllib.parse import urlsplit

import brotli
from websockets.exceptions import WebSocketException
from websockets.sync.client import connect

from douyin import clean_name, parse_comment


API_HOST = "live-open.biliapi.com"
HEADER = struct.Struct("!IHHII")
MAX_PACKET = 2 * 1024 * 1024
COMMENTS = {"LIVE_OPEN_PLATFORM_DM", "OPEN_LIVEROOM_DM"}
GIFTS = {"LIVE_OPEN_PLATFORM_SEND_GIFT", "OPEN_LIVEROOM_SEND_GIFT"}


def signed_headers(body, access_key, secret):
    headers = {
        "x-bili-accesskeyid": access_key,
        "x-bili-content-md5": hashlib.md5(body).hexdigest(),
        "x-bili-signature-method": "HMAC-SHA256",
        "x-bili-signature-nonce": uuid.uuid4().hex,
        "x-bili-signature-version": "1.0",
        "x-bili-timestamp": str(int(time.time())),
    }
    canonical = "\n".join(f"{key}:{headers[key]}" for key in sorted(headers))
    headers["Authorization"] = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    headers["Accept"] = headers["Content-Type"] = "application/json"
    return headers


def packet(operation, body=b""):
    return HEADER.pack(HEADER.size + len(body), HEADER.size, 1, operation, 1) + body


def unpack_packets(message, decompress=True):
    if len(message) > MAX_PACKET:
        raise ValueError("B站长连消息过大")
    offset = 0
    while offset < len(message):
        if len(message) - offset < HEADER.size:
            raise ValueError("B站长连消息头不完整")
        size, header_size, version, operation, _ = HEADER.unpack_from(message, offset)
        if not HEADER.size <= header_size <= size <= len(message) - offset:
            raise ValueError("B站长连消息长度无效")
        body = message[offset + header_size:offset + size]
        offset += size
        if version in (0, 1):
            yield operation, body
        elif version in (2, 3) and decompress:
            if version == 2:
                decoder = zlib.decompressobj()
                decoded = decoder.decompress(body, MAX_PACKET + 1)
                if not decoder.eof:
                    raise ValueError("B站长连压缩包无效")
            else:
                try:
                    decoded = brotli.decompress(body)
                except brotli.error:
                    raise ValueError("B站长连压缩包无效") from None
            yield from unpack_packets(decoded, decompress=False)
        else:
            raise ValueError("B站长连协议版本无效")


def read_event(message, room_id, gift_actions):
    if not isinstance(message, dict):
        return None
    cmd, data = message.get("cmd"), message.get("data")
    if not isinstance(cmd, str) or not isinstance(data, dict) or data.get("room_id") != room_id:
        return None
    if cmd in COMMENTS:
        content = data.get("msg")
        action = parse_comment(content)
        kind, count = "comment", 1
    elif cmd in GIFTS:
        gift_id = data.get("gift_id")
        action = gift_actions.get(str(gift_id)) if type(gift_id) is int else None
        kind, count = "gift", data.get("gift_num")
    else:
        return None
    msg_id, open_id = data.get("msg_id"), data.get("open_id")
    if (not action or type(count) is not int or not 1 <= count <= 2**31-1
            or not all(isinstance(value, str) and 0 < len(value) <= 512 for value in (msg_id, open_id))):
        return None
    uid = hashlib.sha256(f"bilibili:{room_id}:{open_id}".encode()).hexdigest()
    name = clean_name(data.get("uname")) or "钓友" + uid[:5].upper()
    return f"bilibili-{kind}:{msg_id}", uid, name, action, count


class ApiError(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(f"B站直播 API 错误码 {code}")


class Session:
    def __init__(self, app_id, access_key, secret):
        self.app_id = app_id
        self.access_key = access_key
        self.secret = secret
        self.game_id = ""
        self.connected = False
        self.ended = False

    def _post(self, action, payload):
        body = json.dumps(payload, separators=(",", ":")).encode()
        conn = http.client.HTTPSConnection(API_HOST, timeout=5)
        try:
            conn.request("POST", "/v2/app/" + action, body, signed_headers(body, self.access_key, self.secret))
            response = conn.getresponse()
            if response.status != 200:
                raise RuntimeError(f"B站直播 API HTTP {response.status}")
            raw = response.read(MAX_PACKET + 1)
            result = json.loads(raw) if len(raw) <= MAX_PACKET else None
        except (OSError, http.client.HTTPException, ValueError):
            raise RuntimeError("B站直播 API 请求失败") from None
        finally:
            conn.close()
        if not isinstance(result, dict) or type(result.get("code")) is not int:
            raise RuntimeError("B站直播 API 响应无效")
        if result["code"]:
            raise ApiError(result["code"])
        return result.get("data")

    def start(self, code):
        data = self._post("start", {"app_id": self.app_id, "code": code})
        try:
            game_id = data["game_info"]["game_id"]
            if not isinstance(game_id, str) or not game_id:
                raise ValueError
            self.game_id = game_id
            self.room_id = data["anchor_info"]["room_id"]
            auth = data["websocket_info"]
            self.auth_body = auth["auth_body"].encode()
            links = auth["wss_link"]
            self.links = [url for url in links if isinstance(url, str) and urlsplit(url).scheme == "wss"]
            if type(self.room_id) is not int or self.room_id <= 0 or not self.auth_body or not self.links:
                raise ValueError
        except (TypeError, AttributeError, KeyError, ValueError):
            raise RuntimeError("B站直播 API 开启响应缺少有效的场次或长连信息") from None
        self.next_heartbeat = time.monotonic() + 20
        return self.room_id

    def _heartbeat(self):
        if time.monotonic() < self.next_heartbeat:
            return
        try:
            self._post("heartbeat", {"game_id": self.game_id})
        except RuntimeError as error:
            if isinstance(error, ApiError) and error.code == 7003:
                self.ended = True
                logging.error("B站场次已失效，请重新启动游戏")
            else:
                logging.warning("B站项目心跳失败，将重试：%s", error)
                self.next_heartbeat = time.monotonic() + 5
        else:
            self.next_heartbeat = time.monotonic() + 20

    def _receive(self, ws, done, inbox, gift_actions):
        ws.send(packet(7, self.auth_body))
        auth_deadline = time.monotonic() + 8
        next_ping, pong_deadline = 0, None
        while not done.is_set() and not self.ended:
            self._heartbeat()
            if self.ended:
                return
            now = time.monotonic()
            if not self.connected and now >= auth_deadline:
                raise TimeoutError("B站长连鉴权超时")
            if pong_deadline is not None and now >= pong_deadline:
                raise TimeoutError("B站长连心跳超时")
            if self.connected and now >= next_ping:
                ws.send(packet(2))
                next_ping, pong_deadline = now + 30, now + 12
            try:
                message = ws.recv(timeout=1)
            except TimeoutError:
                continue
            if not isinstance(message, bytes):
                continue
            events = []
            for operation, body in unpack_packets(message):
                if operation == 8:
                    result = json.loads(body)
                    if not isinstance(result, dict) or result.get("code") != 0:
                        raise ValueError("B站长连鉴权被拒绝")
                    self.connected = True
                    logging.info("B站直播长连已连接，房间 %s", self.room_id)
                elif operation == 3:
                    pong_deadline = None
                elif operation == 5 and self.connected:
                    event = read_event(json.loads(body), self.room_id, gift_actions)
                    if event:
                        events.append(event)
            inbox.put(events)

    def run(self, done, inbox, gift_actions):
        index = 0
        while not done.is_set() and not self.ended:
            self._heartbeat()
            if self.ended or done.is_set():
                break
            try:
                with connect(self.links[index], open_timeout=5, close_timeout=1,
                             max_size=MAX_PACKET) as ws:
                    self._receive(ws, done, inbox, gift_actions)
            except (WebSocketException, OSError, RuntimeError, ValueError, zlib.error, sqlite3.Error) as error:
                if not done.is_set():
                    logging.warning("B站直播长连中断，将尝试重连（%s）", type(error).__name__)
            finally:
                self.connected = False
            index = (index + 1) % len(self.links)
            done.wait(2)

    def close(self):
        if self.game_id and not self.ended:
            try:
                self._post("end", {"app_id": self.app_id, "game_id": self.game_id})
            except RuntimeError as error:
                logging.warning("结束B站场次失败：%s", error)
