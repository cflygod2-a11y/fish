"""Douyin live-gameplay server callbacks, token acquisition and push subscriptions."""
import base64
import hashlib
import hmac
import json
import os
import time
import unicodedata
import urllib.error
import urllib.request


SIGNED_FIELDS = ("x-msg-type", "x-nonce-str", "x-roomid", "x-timestamp")
COMMENT_ACTIONS = {"加入": "join", "离开": "leave", "钓鱼": "fish"}
TOKEN_URL = "https://developer.toutiao.com/api/apps/v2/token"
TASK_URL = "https://webcast.bytedance.com/api/live_data/task/"


class CallbackError(ValueError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def _signature(signed, body, secret):
    prefix = "&".join(name + "=" + signed[name] for name in SIGNED_FIELDS)
    # The platform signs the exact wire bytes, including JSON spacing.
    digest = hashlib.md5(prefix.encode("utf-8") + body + secret.encode("utf-8"))
    return base64.b64encode(digest.digest())


def read_events(headers, body, secret, expected_room, gift_actions):
    """Verify wire bytes and map configured platform actions to durable game events."""
    if not secret or not expected_room:
        raise CallbackError(503, "请配置推送签名密钥和本场 room_id")
    signed = {}
    for key, value in headers.items():
        name = key.lower()
        if name in SIGNED_FIELDS or name == "x-signature":
            if name in signed:
                raise CallbackError(400, "重复的签名请求头")
            signed[name] = value
    if not all(signed.get(name) for name in (*SIGNED_FIELDS, "x-signature")):
        raise CallbackError(401, "缺少签名请求头")
    expected = _signature(signed, body, secret)
    if not hmac.compare_digest(expected, signed["x-signature"].encode("utf-8")):
        raise CallbackError(401, "签名校验失败")
    if signed["x-roomid"] != expected_room:
        raise CallbackError(403, "直播间不匹配")
    try:
        sent_ms = int(signed["x-timestamp"])
    except ValueError:
        raise CallbackError(400, "请求时间戳无效") from None
    if abs(int(time.time() * 1000) - sent_ms) > 5 * 60 * 1000:
        raise CallbackError(401, "请求时间已过期或服务器时钟有偏差")
    kind = signed["x-msg-type"]
    if kind not in ("live_comment", "live_gift"):
        return []
    try:
        batch = json.loads(body.decode("utf-8"))
    except (UnicodeError, ValueError, RecursionError):
        raise CallbackError(400, "批次应为 UTF-8 JSON") from None
    if not isinstance(batch, list):
        raise CallbackError(400, "批次应为数组")
    events = []
    for event in batch:
        if not isinstance(event, dict):
            raise CallbackError(400, "数据格式错误")
        if event.get("test") is True:
            continue
        if kind == "live_comment":
            content = event.get("content", "")
            action = COMMENT_ACTIONS.get(content.strip()) if isinstance(content, str) else None
            count = 1
        else:
            gift_id = event.get("sec_gift_id")
            action = gift_actions.get(gift_id) if isinstance(gift_id, str) else None
            count = event.get("gift_num")
        if not action:
            continue
        if type(count) is not int or not 1 <= count <= 2**31-1:
            raise CallbackError(400, "礼物数量无效")
        msg, uid = event.get("msg_id"), event.get("sec_openid")
        if not all(isinstance(v,str) and 0 < len(v) <= 512 for v in (msg, uid)):
            raise CallbackError(400, "消息或用户标识缺失")
        player = hashlib.sha256((expected_room+"|"+uid).encode()).hexdigest()
        nick = clean_name(event.get("nickname")) or "钓友" + player[:5].upper()
        events.append((kind + ":" + msg, player, nick, action, count))
    return events


def clean_name(name):
    if not isinstance(name, str):
        return ""
    return "".join(c for c in name if not unicodedata.category(c).startswith("C")).strip()[:18]


def _post_json(url, payload, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["access-token"] = token
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.load(response)
    if not isinstance(result, dict) or "err_no" not in result:
        raise RuntimeError("平台返回了未识别的响应")
    if result["err_no"] != 0:
        # Do not print request bodies, tokens or secrets.
        raise RuntimeError("抖音 API 错误码 {}，logid={}".format(
            result["err_no"], result.get("logid", "-")
        ))
    return result.get("data") or {}


def get_access_token(appid, app_secret):
    data = _post_json(TOKEN_URL, {
        "appid": appid, "secret": app_secret, "grant_type": "client_credential"
    })
    if not isinstance(data.get("access_token"), str) or not data["access_token"]:
        raise RuntimeError("平台响应缺少 access_token")
    return data["access_token"]


def subscribe(roomid, include_gifts, stopping=False):
    appid = os.getenv("DOUYIN_APP_ID")
    token = os.getenv("DOUYIN_ACCESS_TOKEN")
    secret = os.getenv("DOUYIN_APP_SECRET")
    if not (appid and roomid and (token or secret)):
        raise ValueError("订阅需要 DOUYIN_APP_ID、DOUYIN_ROOM_ID 及 DOUYIN_ACCESS_TOKEN 或 DOUYIN_APP_SECRET")
    token = token or get_access_token(appid, secret)
    for kind in (("live_comment", "live_gift") if include_gifts else ("live_comment",)):
        _post_json(TASK_URL + ("stop" if stopping else "start"), {
            "appid": appid, "roomid": roomid, "msg_type": kind
        }, token)
        print(kind, "已停止" if stopping else "已订阅", flush=True)
