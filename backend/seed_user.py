import os

import mysql.connector
from dotenv import load_dotenv
from passlib.context import CryptContext

load_dotenv()

from common import get_required_env

# 体验用户配置
DEMO_PHONE = "13113183859"
DEMO_NICKNAME = "演示账号"
DEMO_PASSWORD = "123456"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

try:
    conn = None
    cursor = None
    conn = mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=get_required_env("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "chat_platform"),
    )
    cursor = conn.cursor()

    # 检查体验用户是否已存在
    cursor.execute("SELECT id FROM user WHERE phone = %s", (DEMO_PHONE,))
    user = cursor.fetchone()

    password_hash = pwd_context.hash(DEMO_PASSWORD)

    if user:
        # 已存在则更新密码哈希与昵称
        cursor.execute(
            "UPDATE user SET password_hash = %s, nickname = %s WHERE phone = %s",
            (password_hash, DEMO_NICKNAME, DEMO_PHONE),
        )
        conn.commit()
        print(f"体验用户 {DEMO_PHONE} 密码已更新为 {DEMO_PASSWORD}。")
    else:
        # 不存在则创建新体验用户
        cursor.execute(
            "INSERT INTO user (phone, password_hash, nickname) VALUES (%s, %s, %s)",
            (DEMO_PHONE, password_hash, DEMO_NICKNAME),
        )
        conn.commit()
        print(f"体验用户 {DEMO_PHONE} 已创建，密码为 {DEMO_PASSWORD}。")
except mysql.connector.Error as err:
    print(f"体验用户初始化失败：{err}")
finally:
    if cursor is not None:
        cursor.close()
    if conn is not None:
        conn.close()
