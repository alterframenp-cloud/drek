# Validación de Drek 1.0.1

Reconstrucción y comprobación del 10 de noviembre de 2026. La máquina actual no
conservaba el proyecto ni el ZIP del 22 de octubre; el remoto de Git seguía vacío.
Esta entrega es una copia reconstruida desde el código y los requisitos del hilo,
con nuevas comprobaciones. No se presenta como el ZIP original recuperado.

Entorno: Linux, Python 3.12.14, Node 24.19.0, FFmpeg/FFprobe 7.1.5 y Chromium.
Se utilizaron videos sintéticos generados localmente, sin archivos personales.

| Comprobación | Resultado actual |
| --- | --- |
| `npm run build` | TypeScript y Vite compilan correctamente |
| `python -m pytest backend/tests -q` | **12 aprobadas**, ninguna omitida |
| `npm test` | **4 aprobadas** |
| `DREK_CHROMIUM=/usr/bin/chromium npm run test:e2e` | **3 aprobadas** |
| `python scripts/prepare.py`, dos ejecuciones | Correcto; segundo inicio reutiliza lo instalado |
| `python scripts/launch.py --no-browser` | API y aplicación disponibles en el servidor local |

Los 19 tests comprueban:

- MP4/H.264, MOV/MPEG-4, MKV/FFV1 y WebM/VP9; archivos inválidos, vacíos y nombres
  con caracteres especiales. Proxy de reproducción con solicitudes de rango.
- Gaussian, Pixelate y efecto desactivado en archivos MP4 reales. Se decodifican
  varios fotogramas para verificar efecto, nitidez de las capas y contacto con el borde.
- MP4 H.264 con audio, resolución y FPS correctos. Comienzo de audio/video con
  diferencia inferior a 80 ms en el caso de prueba. En el video de FPS variables
  se conservan cantidad de fotogramas y timestamps con diferencia inferior a 1 ms.
- Videos verticales, cuadrados y horizontales, rotación por metadatos, píxeles no
  cuadrados, video sin audio, salidas reales 720p/1080p y ausencia de ampliación.
- Cancelación de exportación, rechazo de descargas canceladas, limpieza al cambiar
  de video, validación de capas PNG y rechazo de hosts/orígenes externos.
- Flujo de navegador: importar, reproducir, pausar, buscar fotogramas, cambiar
  Gaussian, textos, fondo, padding, radio y márgenes, exportar y guardar el archivo.
- Presets: crear, renombrar, actualizar, cargar, predeterminado, persistencia tras
  recargar y eliminación. Quick Export usa el guardado y Export Video los controles
  actuales; los cambios temporales no alteran el preset.
- Fondo blanco con texto negro automático y márgenes cero: el último píxel inferior
  derecho del MP4 pertenece al fondo, sin margen invisible.
- Texto diagonal largo dentro del encuadre vertical y cuadrado, tanto en Canvas
  como en los MP4 exportados. Interfaz de 390 px sin desbordamiento horizontal.

Las capturas y resultados del desarrollo están en `frontend/test-results`, fuera
del ZIP. Este incluye fuentes con licencia y la interfaz compilada en `frontend/dist`.

Límites:

- **No se ejecutó Windows nativo en esta máquina.** `start.bat` debe comprobarse
  en la PC del usuario; sus componentes Python/FFmpeg se ejecutaron en Linux.
- No se midió rendimiento con grabaciones largas o 4K de tamaño real. No se
  aplica un límite artificial de duración; la capacidad depende del equipo.
- Gaussian de Canvas y FFmpeg usan el mismo sigma proporcional, pero son
  implementaciones diferentes. Pueden diferir en detalles finos. H.264/YUV420
  introduce pequeñas variaciones de color. Las capas de texto sí usan el mismo PNG.
- La cobertura de fuentes no incluye necesariamente todos los idiomas o emojis.
- El primer inicio necesita Internet para instalar paquetes Python. El ZIP incluye
  la interfaz compilada, por lo que Node.js no es requisito para usarlo.
- La imagen de referencia mencionada en el pedido no estaba adjunta. Se siguieron
  las dos especificaciones de texto disponibles en el hilo.
- Pytest mostró una advertencia de deprecación Starlette/AnyIO; no causó fallos.

Los resultados anteriores corresponden a esta copia actual; no dependen de los
resultados de la sesión de octubre ni prueban publicación/restauración del entorno.
