import os
from collections.abc import Generator

import mysql.connector
from dotenv import load_dotenv
from mysql.connector import MySQLConnection, pooling

load_dotenv()

from .common import get_required_env

db_config = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": get_required_env("DB_PASSWORD"),
    "database": os.getenv("DB_NAME", "chat_platform"),
    "pool_name": "chat_pool",
    "pool_size": 5,
}

# 创建数据库连接池，供接口层复用。
connection_pool = pooling.MySQLConnectionPool(**db_config)


def get_db() -> Generator[MySQLConnection, None, None]:
    """
    获取数据库连接。

    返回：
    - 连接池中的一个 MySQL 连接。

    说明：
    - 作为 FastAPI 依赖使用，请求结束时自动归还连接。
    - 业务处理中发生异常时统一执行 rollback，避免残留未提交事务污染连接池。

    异常：
    - 当连接池获取连接失败时，由 mysql-connector 抛出异常。
    """
    conn = None
    try:
        conn = connection_pool.get_connection()
        yield conn
    except Exception:
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if conn is not None:
            conn.close()
