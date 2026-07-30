# =============================================================
# DeepXinjie 后端镜像：FastAPI + Uvicorn
# 构建上下文必须为仓库根目录（COPY 路径以 backend/ 开头）
# 构建命令：docker build -f backend/Dockerfile -t deepxinjie-api .
# =============================================================
FROM python:3.11-slim

# PYTHONPATH 指向仓库根，保持与本地 start.bat 一致的模块导入方式
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Asia/Shanghai

WORKDIR /app

# 依赖单独成层，源码变动时可复用缓存，加快构建
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# 复制后端源码（含 schema.sql / init_db.py / seed_user.py）
COPY backend/ /app/backend/

WORKDIR /app/backend
EXPOSE 3601

# 容器内必须监听 0.0.0.0；proxy-headers 使后端能取到 nginx 透传的真实客户端 IP
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "3601", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
