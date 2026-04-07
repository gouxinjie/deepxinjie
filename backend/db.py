import os
from typing import Generator

import mysql.connector
from dotenv import load_dotenv
from mysql.connector import pooling

load_dotenv()


def get_required_env(name: str) -> str:
    """
    获取数据库必填环境变量。

    说明：
    - 数据库密码属于敏感信息，禁止在代码中提供默认值。
    - 若未配置则在启动阶段直接报错，避免误连到错误环境。
    """
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"缺少必填环境变量：{name}")
    return value


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


def get_db() -> Generator[mysql.connector.MySQLConnection, None, None]:
    """
    获取数据库连接。

    返回：
    - 连接池中的一个 MySQL 连接。

    异常：
    - 当连接池获取连接失败时，由 mysql-connector 抛出异常。
    """
    conn = connection_pool.get_connection()
    try:
        yield conn
    finally:
        conn.close()
