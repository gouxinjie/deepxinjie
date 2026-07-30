import os

import mysql.connector
from dotenv import load_dotenv

load_dotenv()

from common import get_required_env


conn = None
cursor = None
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
    if cursor is not None:
        cursor.close()
    if conn is not None:
        conn.close()
