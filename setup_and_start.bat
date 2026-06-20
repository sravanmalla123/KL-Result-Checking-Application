@echo off
echo ===================================================
echo VeriReport AI Setup ^& Starter
echo ===================================================
echo.

echo [1/3] Installing frontend dependencies (npm)...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Error installing frontend dependencies.
    pause
    exit /b %ERRORLEVEL%
)

echo [2/3] Setting up Python Virtual Environment ^& installing backend dependencies...
if not exist venv (
    python -m venv venv
)
call venv\Scripts\python -m pip install --upgrade pip
call venv\Scripts\pip install -r backend/requirements.txt
if %ERRORLEVEL% neq 0 (
    echo Error installing Python dependencies.
    pause
    exit /b %ERRORLEVEL%
)

echo [3/3] Starting backend FastAPI and frontend Vite servers...
start cmd /k "echo Starting FastAPI backend... && venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"
start cmd /k "echo Starting Vite frontend... && npm run dev"

echo.
echo ===================================================
echo Servers are starting up!
echo Frontend: http://localhost:5173/ (or the Network IP displayed in Vite console)
echo Backend: http://127.0.0.1:8000/
echo ===================================================
echo.
pause
