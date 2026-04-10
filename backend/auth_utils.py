import os
from typing import Optional

import jwt
from dotenv import load_dotenv
from fastapi import Header, HTTPException, status
from jwt import ExpiredSignatureError, InvalidTokenError

load_dotenv()


def get_required_env(name: str) -> str:
    """
    获取必填环境变量。
    @param name - 环境变量名称
    @returns 环境变量值
    @throws RuntimeError 当环境变量缺失时抛出异常
    """
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"缺少必填环境变量：{name}")
    return value


JWT_SECRET = get_required_env("JWT_SECRET")
JWT_ALGORITHM = "HS256"


def get_current_user_id(authorization: Optional[str] = Header(default=None)) -> int:
    """
    从请求头中解析当前登录用户 ID。
    @param authorization - Bearer Token 请求头
    @returns 当前登录用户 ID
    @throws HTTPException 当凭证缺失、无效或过期时抛出 401
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录或登录已过期",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的授权信息",
        )

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        ) from exc
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的登录凭证",
        ) from exc

    if payload.get("token_type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的登录凭证",
        )

    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录凭证缺少用户信息",
        )

    try:
        return int(user_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录凭证中的用户信息无效",
        ) from exc
