import os

import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_required_env(name: str) -> str:
    """
    获取数据库初始化脚本所需的必填环境变量。
    """
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"缺少必填环境变量：{name}")
    return value


try:
    conn = mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=get_required_env("DB_PASSWORD"),
    )
    cursor = conn.cursor()

    with open("schema.sql", "r", encoding="utf-8") as schema_file:
        schema = schema_file.read()

    # 按语句拆分执行初始化 SQL。
    for statement in schema.split(";"):
        sql = statement.strip()
        if sql:
            cursor.execute(sql)
            print(f"已执行：{sql[:50]}...")

    conn.commit()
    print("数据库初始化完成。")
except mysql.connector.Error as err:
    print(f"数据库初始化失败：{err}")
finally:
    if "cursor" in locals():
        cursor.close()
    if "conn" in locals():
        conn.close()
