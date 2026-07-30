# =============================================================
# DeepXinjie 前端镜像：Vite 构建产物 + nginx 托管 + /api 反向代理
# 构建上下文必须为仓库根目录（COPY 路径以 frontend/ 开头）
# 构建命令：docker build -f frontend/Dockerfile -t deepxinjie-web .
# =============================================================

# ---------- 构建阶段：编译前端静态资源 ----------
# Vite 8 要求 Node 20.19+ / 22.12+，此处使用 Node 22
FROM node:22-alpine AS builder

WORKDIR /app

# 先安装依赖，命中 Docker 层缓存
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# 复制源码并执行构建（tsc -b && vite build），产物位于 /app/dist
COPY frontend/ ./
RUN npm run build

# ---------- 运行阶段：nginx 托管静态资源 ----------
FROM nginx:1.27-alpine

ENV TZ=Asia/Shanghai

# 容器内 nginx 站点配置（含 SPA 回退与 /api 反向代理）
COPY frontend/deploy/nginx.conf /etc/nginx/conf.d/default.conf

# 拷贝构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
