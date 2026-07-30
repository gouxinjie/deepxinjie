import os
from collections.abc import Generator

import mysql.connector.pooling
from dotenv import load_dotenv
from mysql.connector.pooling import PooledMySQLConnection

# 根据当前文件路径定位 .env，避免 --reload 模式下工作目录变化导致找不到
_ = load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from .common import get_required_env

# 创建数据库连接池，供接口层复用。
connection_pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_size=5,
    pool_name="chat_pool",
    host=os.getenv("DB_HOST", "localhost"),
    user=os.getenv("DB_USER", "root"),
    password=get_required_env("DB_PASSWORD"),
    database=os.getenv("DB_NAME", "chat_platform"),
)


def get_db() -> Generator[PooledMySQLConnection, None, None]:
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
