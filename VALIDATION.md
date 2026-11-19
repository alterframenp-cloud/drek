# Validación de Drek

## Versión 1.1.0 — tiempos, transiciones y recortes (19 de noviembre de 2026)

Resultados de esta versión:

| Comprobación | Resultado |
| --- | --- |
| `npm run build` | TypeScript y Vite correctos, interfaz compilada incluida |
| `python -m pytest backend/tests -q` | **28 aprobadas**, sin pruebas omitidas |
| `npm test` | **9 aprobadas** |
| `DREK_CHROMIUM=/usr/bin/chromium npm run test:e2e` | **4 aprobadas** |

Se probaron tiempos de entrada y salida por capa, ninguna transición/fundido/radial,
el ejemplo de blur en 4 s, diagonal en 10 s y marca desde 0 s, y su presencia en
fotogramas reales de los MP4. Se comparó también una fase intermedia de la entrada
radial del preview con el MP4 después de quitar contenido, con tolerancia para
muestreo temporal y compresión.

Las comprobaciones de recortes incluyen principio, final, varios segmentos
conservados, cortes intermedios, superpuestos y adyacentes, selección inválida y
selección que elimina todo. Se verificaron contenido, duración y audio sincronizado
en resultados con audio y sin él. Las capas temporizadas no alteraron la cantidad
de fotogramas ni sus timestamps en la prueba de FPS variables sin recortes.

En el navegador se comprobó la búsqueda de fotogramas, las entradas visibles,
salidas, el salto de tramos al reproducir, Export Video y Quick Export sobre la
misma selección, persistencia de tiempos en presets y restablecimiento de recortes
al importar otro archivo. Los presets anteriores se migran sin perder estilos ni
su visibilidad constante. Se conserva la validación previa de formatos, geometría,
fuentes, márgenes y reparación del entorno Python.

El render usa las mismas imágenes transparentes de cada capa y su entrada radial
en preview y FFmpeg. Las imágenes se decodifican una vez y se repiten en el motor;
la máscara radial del video se calcula solo durante los intervalos de transición.
Al iniciar otra exportación, se retira la descarga del resultado anterior para
que el botón Guardar MP4 corresponda al render que se acaba de terminar.

Entorno de comprobación: Linux, Python 3.12, Node 24, FFmpeg 7.1 y Chromium.
**Windows nativo no está disponible en esta máquina**; el lanzador y la instalación
concreta del usuario deben comprobarse allí. Las transiciones se muestrean en
fotogramas; Gaussian y H.264 mantienen las diferencias finas ya descritas abajo.

## Historial de la versión 1.0.1

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

## Corrección de arranque — 19 de noviembre de 2026

El usuario informó que un `.venv` existente apuntaba a un Python 3.14 eliminado.
La existencia de `python.exe` no garantizaba que pudiera ejecutarse; además el BAT
presentaba su fallo como un problema de FFmpeg. Ahora `scripts/bootstrap.py`,
ejecutado con un Python instalado, comprueba el intérprete del entorno y pip.
Conserva los entornos inutilizables en `.local/venv-backups` y crea uno nuevo.
`start.bat` detiene el arranque si falla esta preparación, sin atribuirla a FFmpeg.

Se ejecutó `python -m pytest backend/tests/test_bootstrap.py -q`: **5 aprobadas**.
Incluyen creación y reutilización real en una ruta con espacios, reparación de un
ejecutable existente pero inválido con conservación de sus archivos y del estado
de instalación, rechazo de un intérprete ausente o global, salida 103 como la del
fallo de Windows y timeout de un intérprete que no responde. Las comprobaciones
de creación/reparación se ejecutaron en Linux. El BAT y la instalación concreta
del usuario siguen necesitando confirmación en Windows.
