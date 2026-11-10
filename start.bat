@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
echo.
echo DREK - Video Blur ^& Watermark Editor
echo ----------------------------------
set "DREK_PYTHON=py -3"
py -3 --version >nul 2>nul
if errorlevel 1 set "DREK_PYTHON=python"
%DREK_PYTHON% -c "import sys; assert sys.version_info >= (3, 11)" >nul 2>nul
if errorlevel 1 goto missing_python
if not exist ".venv\Scripts\python.exe" (
  %DREK_PYTHON% -m venv .venv
  if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -c "from backend.media import executable; executable('ffmpeg'); executable('ffprobe')"
if errorlevel 1 goto missing_ffmpeg
echo Preparando el editor local...
".venv\Scripts\python.exe" scripts\prepare.py
if errorlevel 1 goto failed
".venv\Scripts\python.exe" scripts\launch.py
if errorlevel 1 goto failed
exit /b 0
:missing_python
echo Instala Python 3.11 o superior desde python.org. Activa Add Python to PATH.
goto failed
:missing_ffmpeg
echo Instala FFmpeg y agrega su carpeta bin al PATH. Consulta LEEME-PRIMERO.txt.
goto failed
:failed
echo.
echo No se pudo iniciar Drek. Revisa el mensaje anterior y LEEME-PRIMERO.txt.
pause
exit /b 1
