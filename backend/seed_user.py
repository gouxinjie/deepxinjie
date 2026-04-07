import os

import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_required_env(name: str) -> str:
    """
    获取种子脚本依赖的必填环境变量。
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
        database=os.getenv("DB_NAME", "chat_platform"),
    )
    cursor = conn.cursor()

    # 检查固定演示用户是否已存在。
    cursor.execute("SELECT id FROM user WHERE id = %s", (1,))
    user = cursor.fetchone()

    if not user:
        cursor.execute(
            "INSERT INTO user (id, phone, password_hash, nickname) VALUES (%s, %s, %s, %s)",
            (1, "13800000000", "hash", "新节"),
        )
        conn.commit()
        print("默认演示用户已创建。")
    else:
        print("默认演示用户已存在。")
except mysql.connector.Error as err:
    print(f"种子用户初始化失败：{err}")
finally:
    if "cursor" in locals():
        cursor.close()
    if "conn" in locals():
        conn.close()
