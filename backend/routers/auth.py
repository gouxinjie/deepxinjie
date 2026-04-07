import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

import jwt
import requests
import xmltodict
from fastapi import APIRouter, Depends, Request, Response
from passlib.context import CryptContext
from pydantic import BaseModel

from auth_utils import JWT_ALGORITHM, JWT_SECRET
from db import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 微信登录相关配置。
WECHAT_APPID = os.getenv("WECHAT_APPID")
WECHAT_SECRET = os.getenv("WECHAT_SECRET")

# 密码加密配置。
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 内存缓存 access_token。
# 说明：
# - 这里只做开发期轻量缓存。
# - 生产环境更适合放到 Redis 之类的共享存储中。
_access_token_cache: dict[str, Any] = {
    "token": None,
    "expire_at": 0,
}


class LoginRequest(BaseModel):
    """
    手机号登录请求体。

    参数：
    - phone: 手机号。
    - password: 明文密码，由后端负责加密和校验。
    """

    phone: str
    password: str


def build_success_response(data: Any, message: str = "操作成功") -> dict[str, Any]:
    """
    构造统一成功响应。
    """
    return {
        "success": True,
        "code": 200,
        "message": message,
        "data": data,
    }


def build_error_response(code: int, message: str, data: Any = None) -> dict[str, Any]:
    """
    构造统一错误响应。
    """
    return {
        "success": False,
        "code": code,
        "message": message,
        "data": data,
    }


def create_access_token(user_id: int) -> str:
    """
    生成 JWT 登录令牌。
    """
    return jwt.encode(
        {
            "user_id": user_id,
            "exp": datetime.utcnow() + timedelta(days=7),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def get_password_hash(password: str) -> str:
    """
    对明文密码进行哈希处理。
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    校验明文密码与数据库哈希是否匹配。
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_wechat_access_token() -> str:
    """
    获取微信 Access Token。

    异常：
    - 当微信配置缺失或微信接口返回异常时抛出错误。
    """
    if not WECHAT_APPID or not WECHAT_SECRET:
        raise RuntimeError("未配置微信登录所需环境变量")

    now = time.time()
    cached_token = _access_token_cache["token"]
    if cached_token and _access_token_cache["expire_at"] > now:
        return str(cached_token)

    url = (
        "https://api.weixin.qq.com/cgi-bin/token"
        f"?grant_type=client_credential&appid={WECHAT_APPID}&secret={WECHAT_SECRET}"
    )
    resp = requests.get(url, timeout=10).json()
    access_token = resp.get("access_token")
    if not access_token:
        raise RuntimeError(f"获取微信 Access Token 失败：{resp.get('errmsg', '未知错误')}")

    _access_token_cache["token"] = access_token
    _access_token_cache["expire_at"] = now + int(resp.get("expires_in", 7200)) - 60
    return str(access_token)


@router.post("/login")
async def login_by_phone(req: LoginRequest, db=Depends(get_db)) -> dict[str, Any]:
    """
    手机号密码登录。

    行为：
    - 用户不存在时自动注册。
    - 用户存在时校验密码。
    """
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM user WHERE phone = %s", (req.phone,))
        user = cursor.fetchone()

        if not user:
            hashed_password = get_password_hash(req.password)
            nickname = f"用户_{req.phone[-4:]}"
            cursor.execute(
                "INSERT INTO user (phone, password_hash, nickname) VALUES (%s, %s, %s)",
                (req.phone, hashed_password, nickname),
            )
            db.commit()
            user_id = int(cursor.lastrowid)
            user_data = {
                "id": user_id,
                "nickname": nickname,
                "phone": req.phone,
                "avatar": "",
            }
        else:
            password_hash = user.get("password_hash")
            if not password_hash or not verify_password(req.password, str(password_hash)):
                return build_error_response(401, "手机号或密码错误")

            user_id = int(user["id"])
            user_data = {
                "id": user_id,
                "nickname": str(user.get("nickname") or "用户"),
                "phone": str(user.get("phone") or ""),
                "avatar": str(user.get("avatar") or ""),
            }

        return build_success_response(
            {
                "token": create_access_token(user_id),
                "user": user_data,
            },
            "登录成功",
        )
    finally:
        cursor.close()


@router.get("/qrcode")
async def get_login_qrcode(db=Depends(get_db)) -> dict[str, Any]:
    """
    生成微信扫码登录二维码。
    """
    try:
        token = get_wechat_access_token()
    except RuntimeError as exc:
        return build_error_response(500, str(exc))

    scene_str = str(uuid.uuid4())
    qrcode_url = f"https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token={token}"
    payload = {
        "expire_seconds": 600,
        "action_name": "QR_STR_SCENE",
        "action_info": {"scene": {"scene_str": scene_str}},
    }

    response_data = requests.post(qrcode_url, json=payload, timeout=10).json()
    ticket = response_data.get("ticket")
    if not ticket:
        return build_error_response(
            500,
            "生成二维码失败",
            response_data,
        )

    cursor = db.cursor()
    try:
        expire_time = datetime.now() + timedelta(seconds=600)
        cursor.execute(
            "INSERT INTO login_qrcode (scene_str, status, expire_time) VALUES (%s, %s, %s)",
            (scene_str, 0, expire_time),
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        return build_error_response(500, f"保存二维码状态失败：{exc}")
    finally:
        cursor.close()

    return build_success_response(
        {
            "qr_url": f"https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket={ticket}",
            "scene_str": scene_str,
        }
    )


@router.get("/qrcode/status")
async def check_qrcode_status(scene_str: str, db=Depends(get_db)) -> dict[str, Any]:
    """
    轮询二维码登录状态。
    """
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM login_qrcode WHERE scene_str = %s",
            (scene_str,),
        )
        record = cursor.fetchone()
        if not record:
            return build_error_response(404, "二维码不存在")

        if int(record["status"]) != 1:
            return {
                "success": True,
                "code": 201,
                "message": "等待扫码",
                "data": {"status": int(record["status"])},
            }

        openid = str(record.get("openid") or "")
        cursor.execute(
            "SELECT id, nickname, avatar FROM user WHERE openid = %s",
            (openid,),
        )
        user = cursor.fetchone()

        if not user:
            nickname = f"微信用户_{openid[:8]}"
            cursor.execute(
                "INSERT INTO user (openid, nickname) VALUES (%s, %s)",
                (openid, nickname),
            )
            db.commit()
            user_id = int(cursor.lastrowid)
            user_info = {"id": user_id, "nickname": nickname, "avatar": ""}
        else:
            user_id = int(user["id"])
            user_info = {
                "id": user_id,
                "nickname": str(user.get("nickname") or "微信用户"),
                "avatar": str(user.get("avatar") or ""),
            }

        return build_success_response(
            {
                "token": create_access_token(user_id),
                "user": user_info,
            },
            "登录成功",
        )
    finally:
        cursor.close()


@router.post("/wechat/callback")
async def wechat_callback(request: Request, db=Depends(get_db)) -> Response:
    """
    微信服务器扫码回调。
    """
    body = await request.body()
    if not body:
        return Response(content="success", media_type="application/xml")

    data = xmltodict.parse(body).get("xml")
    if not data:
        return Response(content="success", media_type="application/xml")

    event = data.get("Event")
    openid = data.get("FromUserName")
    scene_str: Optional[str] = None

    if event == "SCAN":
        scene_str = data.get("EventKey")
    elif event == "subscribe":
        event_key = str(data.get("EventKey", ""))
        if event_key.startswith("qrscene_"):
            scene_str = event_key.replace("qrscene_", "")

    if scene_str:
        cursor = db.cursor()
        try:
            cursor.execute(
                "UPDATE login_qrcode SET status = 1, openid = %s WHERE scene_str = %s",
                (openid, scene_str),
            )
            db.commit()
        except Exception:
            db.rollback()
        finally:
            cursor.close()

    return Response(content="success", media_type="application/xml")


@router.post("/logout")
async def logout() -> dict[str, Any]:
    """
    退出登录。

    说明：
    - 当前版本以前端清理 Token 为主。
    - 如需服务端强制失效，可后续增加黑名单机制。
    """
    return build_success_response(None, "已退出登录")
