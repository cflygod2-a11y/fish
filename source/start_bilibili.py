"""Windows entry point for the Bilibili Live Studio package."""

import argparse
import getpass
import logging
import os
import sys

import fishing


CREDENTIAL_FIELDS = {
    "BILIBILI_APP_ID": "项目 ID",
    "BILIBILI_ACCESS_KEY_ID": "Access Key ID",
    "BILIBILI_ACCESS_KEY_SECRET": "Access Key Secret",
    "BILIBILI_ANCHOR_CODE": "主播身份码",
}


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="晚汐渔港 · B站启动程序",
        epilog="游戏选项：--port 端口、--data 存档目录、--no-browser、--interval 秒数。",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--live", action="store_true", help="连接 B 站直播间")
    mode.add_argument("--demo", action="store_true", help="启动本地试玩")
    parser.add_argument("--code", "-code", help="直播姬传入的主播身份码")
    parser.add_argument("--room-id", "--room_id", "-room_id", help="直播姬传入的房间号")
    argv = sys.argv[1:] if argv is None else argv
    # Live Studio can send code=VALUE without a leading hyphen. The authorized
    # room is obtained from Bilibili's start response, even when room_id is sent.
    args, game_args = parser.parse_known_args([
        "--" + arg if arg.startswith(("code=", "room_id=")) else arg for arg in argv
    ])
    launched_by_studio = args.code is not None or args.room_id is not None
    if args.demo and launched_by_studio:
        parser.error("--demo 不能与直播姬启动参数同时使用")

    credentials = {name: os.getenv(name, "").strip() for name in CREDENTIAL_FIELDS}
    if args.code is not None:
        credentials["BILIBILI_ANCHOR_CODE"] = args.code.strip()
    if args.demo or not (args.live or launched_by_studio or all(credentials.values())):
        fishing.main(game_args)
        return

    missing = [name for name, value in credentials.items() if not value]
    if missing and not sys.stdin.isatty():
        parser.error("B站直播还需要设置 " + "、".join(missing))
    for name in missing:
        if name == "BILIBILI_ANCHOR_CODE":
            print("请从 https://play-live.bilibili.com/ 右下角「身份码」获取。")
        prompt = CREDENTIAL_FIELDS[name] + "："
        value = input(prompt) if name == "BILIBILI_APP_ID" else getpass.getpass(prompt)
        if not value.strip():
            parser.error("请填写 " + CREDENTIAL_FIELDS[name])
        credentials[name] = value.strip()
    os.environ.update(credentials)
    fishing.main([*game_args, "--live", "--platform", "bilibili"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        sys.exit(130)
