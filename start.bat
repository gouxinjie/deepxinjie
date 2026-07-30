@echo off
setlocal
echo ==========================================
echo   DeepXinjie Startup
echo ==========================================

REM Kill previously started windows by title to free ports 3600/3601
echo Cleaning up old DeepXinjie windows...
taskkill /F /FI "WINDOWTITLE eq DeepXinjie-Backend" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq DeepXinjie-Frontend" >nul 2>&1
REM Also free any process still holding 3600/3601 (best effort)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /r ":360[01] " ^| findstr "LISTENING"') do taskkill /PID %%a /F /T >nul 2>&1
REM Wait for the OS to release the ports
timeout /t 2 /nobreak >nul

echo [1/2] Starting backend...
start "DeepXinjie-Backend" cmd /k "cd /d D:\MyProjects\deepxinjie\backend && set PYTHONPATH=D:\MyProjects\deepxinjie && python -m uvicorn main:app --host 127.0.0.1 --port 3601"

echo [2/2] Starting frontend...
start "DeepXinjie-Frontend" cmd /k "cd /d D:\MyProjects\deepxinjie\frontend && npm run dev -- --host 127.0.0.1 --port 3600"

REM Poll up to 15s to confirm the backend is actually listening on 3601
echo Waiting for backend (up to 15s)...
set tries=0
:wait
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3601); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :ok
set /a tries+=1
if %tries% lss 15 goto :wait
echo [WARN] Backend not listening on 3601 within 15s. Check the backend window for errors.
goto :done
:ok
echo [OK] Backend is listening on 3601.
:done
echo ==========================================
echo   Frontend: http://127.0.0.1:3600
echo   Backend:  http://127.0.0.1:3601
echo   Keep both command windows open!
echo ==========================================
pause
