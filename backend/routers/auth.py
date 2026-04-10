import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Any, Optional

import jwt
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from passlib.context import CryptContext
from pydantic import BaseModel

from auth_utils import JWT_ALGORITHM, JWT_SECRET, get_current_user_id
from db import connection_pool, get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"
REFRESH_TOKEN_COOKIE_PATH = "/api/auth"
CSRF_TOKEN_COOKIE_NAME = "csrf_token"
CSRF_TOKEN_COOKIE_PATH = "/"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").lower()

PHONE_PATTERN = re.compile(r"^1\d{10}$")
NICKNAME_MIN_LENGTH = 2
NICKNAME_MAX_LENGTH = 50
PASSWORD_MIN_LENGTH = 6
PASSWORD_MAX_LENGTH = 32

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LoginRequest(BaseModel):
    """
    账号密码登录请求体。
    """

    phone: str
    password: str


class RegisterRequest(BaseModel):
    """
    注册请求体。
    """

    phone: str
    nickname: str
    password: str


def build_success_response(data: Any, message: str = "操作成功") -> dict[str, Any]:
    """
    构造统一成功响应。
    @param data - 响应数据
    @param message - 响应消息
    @returns 统一成功响应结构
    """
    return {
        "success": True,
        "code": 200,
        "message": message,
        "data": data,
    }


def build_error_response(code: int | str, message: str, data: Any = None) -> dict[str, Any]:
    """
    构造统一错误响应。
    @param code - 业务状态码
    @param message - 错误消息
    @param data - 错误附加数据
    @returns 统一错误响应结构
    """
    return {
        "success": False,
        "code": code,
        "message": message,
        "data": data,
    }


def normalize_cookie_samesite() -> str:
    """
    规范化 Cookie SameSite 配置。
    @returns 合法的 SameSite 值
    """
    if COOKIE_SAMESITE in {"lax", "strict", "none"}:
        return COOKIE_SAMESITE
    return "lax"


def normalize_phone(phone: str) -> str:
    """
    规范化手机号。
    @param phone - 原始手机号
    @returns 清洗后的手机号
    @throws HTTPException 当手机号格式非法时抛出 400
    """
    normalized_phone = "".join(phone.split())
    if not PHONE_PATTERN.fullmatch(normalized_phone):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请输入正确的 11 位手机号",
        )
    return normalized_phone


def normalize_nickname(nickname: str) -> str:
    """
    规范化用户名。
    @param nickname - 原始用户名
    @returns 清洗后的用户名
    @throws HTTPException 当用户名为空或长度超限时抛出 400
    """
    normalized_nickname = nickname.strip()
    nickname_length = len(normalized_nickname)
    if nickname_length < NICKNAME_MIN_LENGTH or nickname_length > NICKNAME_MAX_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"用户名长度需在 {NICKNAME_MIN_LENGTH}-{NICKNAME_MAX_LENGTH} 个字符之间",
        )
    return normalized_nickname


def normalize_register_password(password: str) -> str:
    """
    校验注册密码。
    @param password - 原始密码
    @returns 原样返回密码
    @throws HTTPException 当密码长度不符合要求时抛出 400
    """
    password_length = len(password)
    if password_length < PASSWORD_MIN_LENGTH or password_length > PASSWORD_MAX_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"密码长度需在 {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} 位之间",
        )
    return password


def normalize_login_password(password: str) -> str:
    """
    校验登录密码是否为空。
    @param password - 原始密码
    @returns 原样返回密码
    @throws HTTPException 当密码为空时抛出 400
    """
    if not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请输入密码",
        )
    return password


def create_access_token(user_id: int) -> str:
    """
    生成短效 Access Token。
    @param user_id - 用户 ID
    @returns Access Token
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
    @param password - 明文密码
    @returns 密码哈希
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    校验密码是否匹配。
    @param plain_password - 明文密码
    @param hashed_password - 哈希密码
    @returns 是否匹配
    """
    return pwd_context.verify(plain_password, hashed_password)


def build_user_data(user_row: dict[str, Any]) -> dict[str, Any]:
    """
    构造前端用户数据。
    @param user_row - 数据库用户记录
    @returns 用户响应数据
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
    @param request - 当前请求对象
    @returns 请求 IP
    """
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    if request.client and request.client.host:
        return request.client.host

    return ""


def hash_token(token: str) -> str:
    """
    对令牌进行哈希处理。
    @param token - 原始令牌
    @returns 令牌哈希
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_refresh_token() -> str:
    """
    生成 Refresh Token。
    @returns Refresh Token
    """
    return secrets.token_urlsafe(48)


def generate_csrf_token() -> str:
    """
    生成 CSRF Token。
    @returns CSRF Token
    """
    return secrets.token_urlsafe(32)


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """
    写入 Refresh Token Cookie。
    @param response - 响应对象
    @param refresh_token - Refresh Token
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
    写入 CSRF Token Cookie。
    @param response - 响应对象
    @param csrf_token - CSRF Token
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
    清理认证相关 Cookie。
    @param response - 响应对象
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
    初始化认证相关表结构。
    说明：
    - 只补齐 user_session 表与缺失字段
    - 不删除任何历史用户和会话数据
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
    将已过期会话标记为失效。
    @param db - 数据库连接
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
    @returns 用户信息
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


def load_user_by_phone(phone: str, db: Any) -> Optional[dict[str, Any]]:
    """
    根据手机号查询用户信息。
    @param phone - 手机号
    @param db - 数据库连接
    @returns 用户记录或空值
    """
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, phone, password_hash, nickname, avatar FROM user WHERE phone = %s LIMIT 1",
            (phone,),
        )
        return cursor.fetchone()
    finally:
        cursor.close()


def create_user_with_password(phone: str, nickname: str, password: str, db: Any) -> int:
    """
    创建账号密码用户。
    @param phone - 手机号
    @param nickname - 用户名
    @param password - 明文密码
    @param db - 数据库连接
    @returns 新用户 ID
    """
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO user (phone, password_hash, nickname) VALUES (%s, %s, %s)",
            (phone, get_password_hash(password), nickname),
        )
        db.commit()
        return int(cursor.lastrowid)
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()


def create_user_session(
    user_id: int,
    request: Request,
    response: Response,
    db: Any,
) -> dict[str, Any]:
    """
    创建登录会话并写入 Cookie。
    @param user_id - 用户 ID
    @param request - 当前请求对象
    @param response - 当前响应对象
    @param db - 数据库连接
    @returns 前端认证会话数据
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
    根据 Refresh Token 查询有效会话。
    @param refresh_token - Refresh Token
    @param db - 数据库连接
    @returns 会话记录或空值
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
    校验 CSRF Token。
    @param session_row - 会话记录
    @param csrf_token - 请求头中的 CSRF Token
    @throws HTTPException 当 Token 缺失或不匹配时抛出 403
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
    轮换会话令牌并返回新的 Access Token。
    @param session_id - 会话 ID
    @param user_id - 用户 ID
    @param request - 当前请求对象
    @param response - 当前响应对象
    @param db - 数据库连接
    @returns 新会话数据
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
    将 Refresh Token 对应会话置为失效。
    @param refresh_token - Refresh Token
    @param db - 数据库连接
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


@router.post("/register")
async def register(
    req: RegisterRequest,
    request: Request,
    response: Response,
    db=Depends(get_db),
) -> dict[str, Any]:
    """
    注册新账号并创建登录会话。
    @param req - 注册请求体
    @param request - 当前请求对象
    @param response - 当前响应对象
    @param db - 数据库连接
    @returns 注册后的会话信息
    """
    try:
        phone = normalize_phone(req.phone)
        nickname = normalize_nickname(req.nickname)
        password = normalize_register_password(req.password)
    except HTTPException as exc:
        return build_error_response(exc.status_code, str(exc.detail))

    existing_user = load_user_by_phone(phone, db)
    if existing_user:
        return build_error_response(409, "该账号已注册")

    try:
        user_id = create_user_with_password(phone, nickname, password, db)
    except Exception:
        return build_error_response(500, "注册失败，请稍后重试")

    session_data = create_user_session(
        user_id=user_id,
        request=request,
        response=response,
        db=db,
    )
    return build_success_response(session_data, "注册成功")


@router.post("/login")
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db=Depends(get_db),
) -> dict[str, Any]:
    """
    使用账号密码登录。
    @param req - 登录请求体
    @param request - 当前请求对象
    @param response - 当前响应对象
    @param db - 数据库连接
    @returns 登录后的会话信息
    """
    try:
        phone = normalize_phone(req.phone)
        password = normalize_login_password(req.password)
    except HTTPException as exc:
        return build_error_response(exc.status_code, str(exc.detail))

    user = load_user_by_phone(phone, db)
    if not user:
        return build_error_response(401, "账号或密码错误")

    password_hash = str(user.get("password_hash") or "")
    if not password_hash or not verify_password(password, password_hash):
        return build_error_response(401, "账号或密码错误")

    session_data = create_user_session(
        user_id=int(user["id"]),
        request=request,
        response=response,
        db=db,
    )
    return build_success_response(session_data, "登录成功")


@router.post("/refresh")
async def refresh_access_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=REFRESH_TOKEN_COOKIE_NAME),
    x_csrf_token: Optional[str] = Header(default=None),
    db=Depends(get_db),
) -> dict[str, Any]:
    """
    刷新 Access Token。
    @param request - 当前请求对象
    @param response - 当前响应对象
    @param refresh_token - Cookie 中的 Refresh Token
    @param x_csrf_token - 请求头中的 CSRF Token
    @param db - 数据库连接
    @returns 新的会话数据
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
    @param user_id - 当前登录用户 ID
    @param db - 数据库连接
    @returns 用户信息
    """
    user_data = load_user_by_id(user_id, db)
    return build_success_response({"user": user_data}, "获取成功")


@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=REFRESH_TOKEN_COOKIE_NAME),
    x_csrf_token: Optional[str] = Header(default=None),
    db=Depends(get_db),
) -> dict[str, Any]:
    """
    退出当前设备登录。
    @param response - 当前响应对象
    @param refresh_token - Cookie 中的 Refresh Token
    @param x_csrf_token - 请求头中的 CSRF Token
    @param db - 数据库连接
    @returns 退出结果
    """
    if refresh_token:
        session_row = get_session_by_refresh_token(refresh_token, db)
        if session_row:
            validate_csrf_token(session_row, x_csrf_token)
            invalidate_session_by_refresh_token(refresh_token, db)

    clear_auth_cookies(response)
    return build_success_response(None, "已退出登录")
