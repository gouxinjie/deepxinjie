import hashlib
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

import jwt
import requests
import xmltodict
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from passlib.context import CryptContext
from pydantic import BaseModel

from auth_utils import JWT_ALGORITHM, JWT_SECRET, get_current_user_id
from db import connection_pool, get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

WECHAT_APPID = os.getenv("WECHAT_APPID")
WECHAT_SECRET = os.getenv("WECHAT_SECRET")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"
REFRESH_TOKEN_COOKIE_PATH = "/api/auth"
CSRF_TOKEN_COOKIE_NAME = "csrf_token"
CSRF_TOKEN_COOKIE_PATH = "/"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").lower()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 微信 access_token 的轻量缓存。
_access_token_cache: dict[str, Any] = {
    "token": None,
    "expire_at": 0,
}


class LoginRequest(BaseModel):
    """
    手机号登录请求体。
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


def normalize_cookie_samesite() -> str:
    """
    规范化 Cookie 的 SameSite 配置。
    """
    if COOKIE_SAMESITE in {"lax", "strict", "none"}:
        return COOKIE_SAMESITE
    return "lax"


def create_access_token(user_id: int) -> str:
    """
    生成短效 Access Token。
    """
    now = datetime.utcnow()
    return jwt.encode(
        {
            "user_id": user_id,
            "token_type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
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


def build_user_data(user_row: dict[str, Any]) -> dict[str, Any]:
    """
    将数据库用户记录转换为响应结构。
    """
    return {
        "id": int(user_row["id"]),
        "nickname": str(user_row.get("nickname") or "用户"),
        "phone": str(user_row.get("phone") or ""),
        "avatar": str(user_row.get("avatar") or ""),
    }


def get_request_ip(request: Request) -> str:
    """
    获取请求来源 IP。
    """
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    if request.client and request.client.host:
        return request.client.host

    return ""


def hash_token(token: str) -> str:
    """
    计算令牌哈希值，避免明文入库。
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_refresh_token() -> str:
    """
    生成新的 Refresh Token。
    """
    return secrets.token_urlsafe(48)


def generate_csrf_token() -> str:
    """
    生成新的 CSRF Token。
    """
    return secrets.token_urlsafe(32)


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """
    将 Refresh Token 写入 HttpOnly Cookie。
    """
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=normalize_cookie_samesite(),
        path=REFRESH_TOKEN_COOKIE_PATH,
    )


def set_csrf_cookie(response: Response, csrf_token: str) -> None:
    """
    将 CSRF Token 写入浏览器可读 Cookie，供前端回填请求头。
    """
    response.set_cookie(
        key=CSRF_TOKEN_COOKIE_NAME,
        value=csrf_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite=normalize_cookie_samesite(),
        path=CSRF_TOKEN_COOKIE_PATH,
    )


def clear_auth_cookies(response: Response) -> None:
    """
    统一清理认证相关 Cookie。
    """
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        path=REFRESH_TOKEN_COOKIE_PATH,
    )
    response.delete_cookie(
        key=CSRF_TOKEN_COOKIE_NAME,
        path=CSRF_TOKEN_COOKIE_PATH,
    )


def initialize_auth_schema() -> None:
    """
    在服务启动时初始化认证所需数据表结构。
    说明：
    - 该逻辑只在启动阶段执行一次。
    - 运行期请求路径不再承担建表职责。
    """
    db = connection_pool.get_connection()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS user_session (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT NOT NULL,
                refresh_token_hash VARCHAR(64) NOT NULL UNIQUE,
                csrf_token_hash VARCHAR(64) NOT NULL DEFAULT '',
                status TINYINT DEFAULT 1,
                expire_time DATETIME NOT NULL,
                ip_address VARCHAR(64) DEFAULT '',
                user_agent VARCHAR(255) DEFAULT '',
                last_active_time DATETIME DEFAULT NOW(),
                create_time DATETIME DEFAULT NOW(),
                update_time DATETIME DEFAULT NOW() ON UPDATE NOW(),
                FOREIGN KEY (user_id) REFERENCES user(id)
            )
            """
        )
        cursor.execute("SHOW COLUMNS FROM user_session LIKE 'csrf_token_hash'")
        column = cursor.fetchone()
        if not column:
            cursor.execute(
                """
                ALTER TABLE user_session
                ADD COLUMN csrf_token_hash VARCHAR(64) NOT NULL DEFAULT ''
                AFTER refresh_token_hash
                """
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()
        db.close()


def cleanup_expired_sessions(db: Any) -> None:
    """
    清理已过期的会话记录，避免无效会话长期保留。
    """
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            UPDATE user_session
            SET status = 0
            WHERE status = 1 AND expire_time <= NOW()
            """
        )
        db.commit()
    finally:
        cursor.close()


def load_user_by_id(user_id: int, db: Any) -> dict[str, Any]:
    """
    根据用户 ID 查询用户信息。
    @param user_id - 用户 ID
    @param db - 数据库连接
    @returns 用户响应结构
    @throws HTTPException 当用户不存在时抛出 404
    """
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, phone, nickname, avatar FROM user WHERE id = %s",
            (user_id,),
        )
        user_row = cursor.fetchone()
    finally:
        cursor.close()

    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    return build_user_data(user_row)


def create_user_session(
    user_id: int,
    request: Request,
    response: Response,
    db: Any,
) -> dict[str, Any]:
    """
    创建新的登录会话并写入 Cookie。
    @param user_id - 用户 ID
    @param request - 当前请求对象
    @param response - 当前响应对象
    @param db - 数据库连接
    @returns 前端可直接使用的认证响应数据
    """
    cleanup_expired_sessions(db)

    refresh_token = generate_refresh_token()
    csrf_token = generate_csrf_token()
    expire_time = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    user_agent = request.headers.get("user-agent", "")[:255]
    ip_address = get_request_ip(request)[:64]

    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO user_session (
                user_id,
                refresh_token_hash,
                csrf_token_hash,
                status,
                expire_time,
                ip_address,
                user_agent,
                last_active_time
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            """,
            (
                user_id,
                hash_token(refresh_token),
                hash_token(csrf_token),
                1,
                expire_time,
                ip_address,
                user_agent,
            ),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()

    set_refresh_cookie(response, refresh_token)
    set_csrf_cookie(response, csrf_token)
    return {
        "accessToken": create_access_token(user_id),
        "expiresIn": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": load_user_by_id(user_id, db),
    }


def get_session_by_refresh_token(refresh_token: str, db: Any) -> Optional[dict[str, Any]]:
    """
    根据 Refresh Token 查询当前有效会话。
    """
    cleanup_expired_sessions(db)

    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, user_id, csrf_token_hash, expire_time
            FROM user_session
            WHERE refresh_token_hash = %s AND status = 1
            LIMIT 1
            """,
            (hash_token(refresh_token),),
        )
        session_row = cursor.fetchone()
    finally:
        cursor.close()

    if not session_row:
        return None

    expire_time = session_row.get("expire_time")
    if isinstance(expire_time, datetime) and expire_time <= datetime.utcnow():
        return None

    return session_row


def validate_csrf_token(session_row: dict[str, Any], csrf_token: Optional[str]) -> None:
    """
    校验双重提交 CSRF Token。
    @param session_row - 当前会话记录
    @param csrf_token - 请求头中的 CSRF Token
    @throws HTTPException 当 CSRF Token 缺失或不匹配时抛出 403
    """
    if not csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF 校验失败",
        )

    csrf_hash = str(session_row.get("csrf_token_hash") or "")
    if not csrf_hash or csrf_hash != hash_token(csrf_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF 校验失败",
        )


def rotate_user_session(
    session_id: int,
    user_id: int,
    request: Request,
    response: Response,
    db: Any,
) -> dict[str, Any]:
    """
    轮换 Refresh Token 和 CSRF Token，并签发新的 Access Token。
    """
    refresh_token = generate_refresh_token()
    csrf_token = generate_csrf_token()
    expire_time = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    user_agent = request.headers.get("user-agent", "")[:255]
    ip_address = get_request_ip(request)[:64]

    cursor = db.cursor()
    try:
        cursor.execute(
            """
            UPDATE user_session
            SET refresh_token_hash = %s,
                csrf_token_hash = %s,
                expire_time = %s,
                ip_address = %s,
                user_agent = %s,
                last_active_time = NOW(),
                status = 1
            WHERE id = %s AND user_id = %s
            """,
            (
                hash_token(refresh_token),
                hash_token(csrf_token),
                expire_time,
                ip_address,
                user_agent,
                session_id,
                user_id,
            ),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()

    set_refresh_cookie(response, refresh_token)
    set_csrf_cookie(response, csrf_token)
    return {
        "accessToken": create_access_token(user_id),
        "expiresIn": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": load_user_by_id(user_id, db),
    }


def invalidate_session_by_refresh_token(refresh_token: str, db: Any) -> None:
    """
    将指定 Refresh Token 对应的会话置为失效。
    """
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            UPDATE user_session
            SET status = 0, last_active_time = NOW()
            WHERE refresh_token_hash = %s AND status = 1
            """,
            (hash_token(refresh_token),),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()


def get_wechat_access_token() -> str:
    """
    获取微信 Access Token。
    @throws RuntimeError 当微信配置缺失或接口返回异常时抛出错误
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
        raise RuntimeError(
            f"获取微信 Access Token 失败：{resp.get('errmsg', '未知错误')}"
        )

    _access_token_cache["token"] = access_token
    _access_token_cache["expire_at"] = now + int(resp.get("expires_in", 7200)) - 60
    return str(access_token)


@router.post("/login")
async def login_by_phone(
    req: LoginRequest,
    request: Request,
    response: Response,
    db=Depends(get_db),
) -> dict[str, Any]:
    """
    手机号密码登录。
    行为：
    - 用户不存在时自动注册
    - 用户存在时校验密码
    - 登录成功后签发短效 Access Token 和长效 Refresh Token
    """
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, phone, password_hash, nickname, avatar FROM user WHERE phone = %s",
            (req.phone,),
        )
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
        else:
            password_hash = user.get("password_hash")
            if not password_hash or not verify_password(req.password, str(password_hash)):
                return build_error_response(401, "手机号或密码错误")

            user_id = int(user["id"])

        session_data = create_user_session(
            user_id=user_id,
            request=request,
            response=response,
            db=db,
        )
        return build_success_response(session_data, "登录成功")
    finally:
        cursor.close()


@router.post("/refresh")
async def refresh_access_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=REFRESH_TOKEN_COOKIE_NAME),
    x_csrf_token: Optional[str] = Header(default=None),
    db=Depends(get_db),
) -> dict[str, Any]:
    """
    使用 Refresh Token 自动续签新的 Access Token。
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录或登录已过期",
        )

    session_row = get_session_by_refresh_token(refresh_token, db)
    if not session_row:
        clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        )

    validate_csrf_token(session_row, x_csrf_token)
    session_data = rotate_user_session(
        session_id=int(session_row["id"]),
        user_id=int(session_row["user_id"]),
        request=request,
        response=response,
        db=db,
    )
    return build_success_response(session_data, "刷新成功")


@router.get("/me")
async def get_me(
    user_id: int = Depends(get_current_user_id),
    db=Depends(get_db),
) -> dict[str, Any]:
    """
    获取当前登录用户信息。
    """
    user_data = load_user_by_id(user_id, db)
    return build_success_response({"user": user_data}, "获取成功")


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
        return build_error_response(500, "生成二维码失败", response_data)

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
async def check_qrcode_status(
    scene_str: str,
    request: Request,
    response: Response,
    db=Depends(get_db),
) -> dict[str, Any]:
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
            "SELECT id, phone, nickname, avatar FROM user WHERE openid = %s",
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
        else:
            user_id = int(user["id"])

        session_data = create_user_session(
            user_id=user_id,
            request=request,
            response=response,
            db=db,
        )
        return build_success_response(session_data, "登录成功")
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
async def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=REFRESH_TOKEN_COOKIE_NAME),
    x_csrf_token: Optional[str] = Header(default=None),
    db=Depends(get_db),
) -> dict[str, Any]:
    """
    退出当前设备登录。
    """
    if refresh_token:
        session_row = get_session_by_refresh_token(refresh_token, db)
        if session_row:
            validate_csrf_token(session_row, x_csrf_token)
            invalidate_session_by_refresh_token(refresh_token, db)

    clear_auth_cookies(response)
    return build_success_response(None, "已退出登录")
