import argparse
from pathlib import Path
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description="Drek: editor local")
    parser.add_argument("--no-browser", action="store_true")
    options = parser.parse_args()
    from backend.media import executable
    executable("ffmpeg")
    executable("ffprobe")
    if not (ROOT / "frontend" / "dist" / "index.html").is_file():
        raise RuntimeError("Falta la interfaz. Extrae el ZIP completo y vuelve a ejecutar start.bat.")
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", 8765)) == 0:
            raise RuntimeError("El puerto 8765 está ocupado. Cierra la otra instancia de Drek antes de continuar.")

    def open_browser():
        for _ in range(100):
            try:
                with urllib.request.urlopen("http://127.0.0.1:8765/api/health", timeout=1) as response:
                    if response.status == 200:
                        webbrowser.open("http://127.0.0.1:8765")
                        return
            except OSError:
                time.sleep(.2)

    if not options.no_browser:
        threading.Thread(target=open_browser, daemon=True).start()
    print("Drek está iniciando. Mantén esta ventana abierta. Ctrl+C cierra el editor.", flush=True)
    import uvicorn
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8765)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
