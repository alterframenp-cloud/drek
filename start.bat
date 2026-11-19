@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
echo.
echo DREK - Video Blur ^& Watermark Editor
echo ----------------------------------
set "DREK_PYTHON=py -3"
py -3 -c "import sys; assert sys.version_info >= (3, 11)" >nul 2>nul
if not errorlevel 1 goto python_ready
set "DREK_PYTHON=python"
python -c "import sys; assert sys.version_info >= (3, 11)" >nul 2>nul
if errorlevel 1 goto missing_python
:python_ready
%DREK_PYTHON% scripts\bootstrap.py
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -c "from backend.media import executable; executable('ffmpeg'); executable('ffprobe')"
if errorlevel 1 goto failed
echo Preparando el editor local...
".venv\Scripts\python.exe" scripts\prepare.py
if errorlevel 1 goto failed
".venv\Scripts\python.exe" scripts\launch.py
if errorlevel 1 goto failed
exit /b 0
:missing_python
echo Instala Python 3.11 o superior desde python.org. Activa Add Python to PATH.
goto failed
:failed
echo.
echo No se pudo iniciar Drek. Revisa el mensaje anterior y LEEME-PRIMERO.txt.
pause
exit /b 1
