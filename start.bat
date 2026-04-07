@echo off
echo ==========================================
echo   my-deepseek 一键启动
echo ==========================================

echo [1/2] 启动后端服务...
start cmd /k "cd /d D:\MyProjects\deepxinjie\backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo [2/2] 启动前端服务...
start cmd /k "cd /d D:\MyProjects\deepxinjie\frontend && npm run dev -- --host 127.0.0.1 --port 5173"

echo ==========================================
echo   启动命令已发送
echo   后端: http://127.0.0.1:8000
echo   前端: http://127.0.0.1:5173
echo ==========================================
pause
