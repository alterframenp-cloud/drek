# Drek — Video Blur & Watermark Editor

Editor local de video para Windows con desenfoque/pixelado, marca de agua inferior,
texto diagonal y presets completos. Interfaz React + TypeScript + Vite; motor
Python + FastAPI + FFmpeg. No requiere cuentas, servicios pagos ni APIs externas.

Esta copia **1.0.1** se reconstruyó el 10 de noviembre de 2026 a partir del código
del hilo original, porque la máquina actual no conservaba aquellos archivos.
La validación de esta copia se documenta por separado en `VALIDATION.md`.

## Empezar en Windows

1. **Extrae todo el ZIP** (clic derecho → Extraer todo) en una carpeta como `C:\Drek`.
   No ejecutes la aplicación dentro del ZIP.
2. Instala **Python 3.11 o superior**, preferiblemente 3.12, desde
   <https://www.python.org/downloads/windows/>. Activa **Add Python to PATH**.
3. Instala **FFmpeg**, que debe incluir `ffmpeg.exe`, `ffprobe.exe` y `libx264`.
   Con PowerShell y winget:

   ```powershell
   winget install --id Gyan.FFmpeg --exact
   ```

   Alternativa: usa los enlaces de compilaciones Windows de
   <https://ffmpeg.org/download.html>, extrae el paquete y agrega su carpeta `bin`
   a tu `PATH`. Abre una nueva terminal y verifica:

   ```powershell
   ffmpeg -version
   ffprobe -version
   ```

4. Haz doble clic en **`start.bat`** en la carpeta extraída. El primer inicio
   instala los paquetes Python y necesita Internet. El navegador se abre cuando
   el servidor local está listo. **Mantén abierta la ventana de Drek.**

**El ZIP incluye `frontend/dist`, la interfaz compilada. No necesitas instalar
Node.js para usar esa distribución.** Node 22.12+ solo es necesario para compilar
desde el código fuente o modificar la interfaz.

El instalador crea un entorno Python `.venv` y usa cachés dentro de `.local`.
Comprueba los requisitos por hash: los siguientes inicios reutilizan lo instalado
y pueden funcionar sin Internet. No hay un `.exe` autónomo.

Si FFmpeg está fuera del PATH, se admiten `FFMPEG_BINARY` y `FFPROBE_BINARY` con
las rutas completas a cada ejecutable. No incluyas comillas dentro de sus valores.
El arranque comprueba ambos ejecutables y detecta un puerto 8765 ocupado.

## Primer video

1. Pulsa **Seleccionar video** o arrastra un MP4, MOV, MKV o WEBM.
2. Espera a que termine de prepararse la copia de reproducción. Se detectan
   duración, resolución, orientación, FPS y audio. No se modifica el original.
3. Elige **AnimationLover Default** o ajusta las tres secciones de la barra lateral:
   - **Blur / Pixelate:** encendido, modo e intensidades independientes. Cero
     conserva el video; cien aplica un efecto muy fuerte.
   - **Watermark:** texto, esquina, tamaño, tipografía, negrita, color, opacidad,
     fondo transparente/negro/blanco, contraste automático, opacidad de fondo,
     padding, radio, márgenes horizontal/inferior, contorno y sombra.
   - **Diagonal Text:** texto, tamaño, tipografía, negrita, color, opacidad,
     contorno, sombra, ángulo automático/manual, ajuste al encuadre y posición.
     **Restaurar diagonal** recupera centro, ángulo y ajuste automáticos.
   Las opciones adicionales están dentro de los desplegables de cada sección.
4. Reproduce, pausa o busca cualquier fotograma. Los controles actualizan los
   efectos inmediatamente sin volver a procesar el video completo.
5. Elige calidad y resolución y pulsa **Export Video**. Se captura una copia de
   los ajustes actuales. Puedes seguir editando sin alterar ese render.
6. Pulsa **Guardar MP4** para guardar el resultado. Durante el render puedes
   cancelar. Los fallos se muestran y permiten reintentar.

El icono de audio solo silencia la reproducción; no elimina el audio del MP4.
No se agrega una marca propia de Drek ni hay límites artificiales de duración.
La capacidad práctica depende de CPU, RAM y disco. Reserva espacio para la copia
del original, el proxy de reproducción y el resultado.

## Presets y exportación rápida

Se incluye **AnimationLover Default**, con `REQUEST YOURS` y `@AnimationLover_`.

- **Save New:** guarda todos los controles, incluidas resolución y calidad.
- **Update:** sobrescribe explícitamente el preset seleccionado.
- **Load Preset** (flecha circular) o el selector: aplica su versión guardada.
- **Renombrar / Eliminar:** gestionan presets; la eliminación se confirma.
- **Set as Default:** aplica el preset al abrir el editor y al cargar otro video.
  Pulsar **Predeterminado** de nuevo desactiva esa aplicación automática.
- **Quick Export:** aplica y exporta el **preset guardado seleccionado**,
  incluidas sus opciones de salida. Reemplaza las ediciones temporales del panel.
- **Export Video:** exporta los controles actuales, incluidas ediciones temporales.

Editar controles no cambia el preset hasta pulsar Update. Se guardan en
`localStorage` (`drek.presets.v1`) del navegador. Usa el mismo navegador y dirección
local; borrar sus datos o usar navegación privada puede eliminarlos.

## Geometría y fidelidad

Los tamaños de fuente, padding y radio usan porcentajes del lado menor del video.
Los márgenes y posiciones usan porcentajes del eje correspondiente. Así, los
presets se adaptan a videos horizontales, verticales, cuadrados y de otra resolución.

La marca usa el rectángulo completo de glifos, padding y fondo. Con márgenes cero
y radio cero el fondo llega al borde sin margen invisible. Un radio mayor deja
transparentes las esquinas. Los textos demasiado largos se reducen para entrar.

La diagonal automática usa `-atan2(alto, ancho)`. El ajuste considera los límites
del texto ya rotado alrededor de la posición elegida. Si desactivas el ajuste al
encuadre, se permite deliberadamente que un texto grande salga del video.

Las fuentes incluidas son sans, serif y monoespaciada, en regular y negrita, con
su licencia. No se descargan tipografías de terceros durante el uso.

**El mismo Canvas genera la capa PNG RGBA a resolución original para preview y
FFmpeg.** Las dos capas se superponen después del desenfoque. No se usa `drawtext`
para rotar texto ni se depende de métricas distintas entre navegador y Python.

La reproducción usa un proxy con hasta 1280 px en el lado mayor. Gaussian Canvas
y FFmpeg `gblur` comparten sigma normalizado, pero son implementaciones distintas;
pueden existir pequeñas diferencias visuales. Pixelate usa vecino más cercano.
La compresión H.264/YUV420 también produce pequeñas variaciones de color.

El MP4 final usa H.264, CRF 18 en alta calidad o 23 en estándar, y audio AAC
192 kb/s cuando existe. Conserva el tiempo de los fotogramas, incluidos FPS
variables; no fuerza 30 FPS. Los tests verifican sincronización y duración.

Original es la resolución predeterminada. 720p y 1080p reducen el **lado menor**
manteniendo orientación y proporción, sin ampliar videos pequeños. Las dimensiones
se redondean al par superior, como requiere H.264/YUV420 (hasta 1 px por eje).
Se normalizan la rotación y píxeles no cuadrados. No se agregan barras negras
al archivo exportado; el reproductor sí puede mostrar espacio alrededor del video.

## Archivos y privacidad

El servicio escucha solo en `127.0.0.1:8765` y rechaza hosts y orígenes externos.
No hay telemetría ni servicios remotos. Los videos se procesan en la computadora
que ejecuta `start.bat`; para mantener los personales en tu PC, úsala allí.
Las pruebas del entorno de desarrollo se procesan en la máquina de la nube.

Los temporales se guardan en `%TEMP%\drek-editor\session-*`. Puedes cambiar el
disco con `DREK_CACHE_DIR`. Cambiar de video elimina el anterior y sus resultados.
**Guarda los MP4 antes de cambiar de video o cerrar.** Ctrl+C en la ventana de
Drek detiene el servicio y limpia la sesión. Tras un cierre abrupto, las sesiones
con más de siete días se limpian durante el siguiente inicio.

Los nombres de archivo y textos no se ejecutan como comandos de shell. Los errores
de FFmpeg aparecen en la interfaz y la consola. Si falta espacio o el archivo está
dañado, corrige la causa e importa o exporta nuevamente.

## Desarrollo

```text
backend/app.py          API, trabajos asíncronos, cancelación y temporales
backend/media.py        detección, FFmpeg y FFprobe
backend/tests/          pruebas reales de procesamiento
frontend/src/App.tsx    pantalla, controles y presets
frontend/src/Preview.tsx reproductor y efectos en vivo
frontend/src/render.ts  capas transparentes compartidas con la exportación
frontend/src/model.ts   modelo normalizado y validación
frontend/e2e/           recorridos de navegador y MP4 descargados
frontend/dist/          interfaz compilada, incluida en el ZIP
scripts/prepare.py      preparación incremental
scripts/launch.py       arranque y apertura del navegador
start.bat               lanzador Windows
```

Para compilar se requieren Python 3.11+, Node 22.12+ y FFmpeg con libx264.
En Linux/macOS, desde la raíz:

```sh
bash scripts/setup.sh
.venv/bin/python scripts/launch.py
```

Desarrollo con recarga (dos terminales):

```sh
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765 --reload
cd frontend
npm run dev
```

En Windows cambia `.venv/bin/python` por `.venv\Scripts\python.exe`.
Vite en 5173 usa proxy al backend en 8765. Después de editar la interfaz, ejecuta
`npm run build` dentro de `frontend` para actualizar la versión de uso diario.

Pruebas desde la raíz:

```sh
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest backend/tests -q
cd frontend
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Si ya hay Chromium instalado, define `DREK_CHROMIUM` con su ruta en lugar de
descargar otro. El entorno de nube usa `/usr/bin/chromium`. La suite puede iniciar
el servicio automáticamente. Los videos de prueba se generan en `.local/e2e` y
sus resultados en `frontend/test-results`; no se incluyen videos personales.

Windows nativo no está disponible en la máquina de validación: el BAT se entrega
para ejecutarlo en tu PC y no se presenta como probado allí. Lee `VALIDATION.md`
para los resultados actuales y las limitaciones concretas.
