import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Settings, VideoAsset } from "./model";
import { blurSigma, pixelSize, renderOverlay } from "./render";
export function timeLabel(seconds: number) {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export default function Preview({
  asset,
  settings,
  fontsReady,
  onError,
}: {
  asset: VideoAsset;
  settings: Settings;
  fontsReady: boolean;
  onError: (s: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  const overlay = useRef(document.createElement("canvas")),
    small = useRef(document.createElement("canvas"));
  const latest = useRef(settings);
  latest.current = settings;
  const [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(false),
    [time, setTime] = useState(0),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (fontsReady)
      renderOverlay(overlay.current, asset.width, asset.height, settings);
  }, [settings, asset, fontsReady]);
  useEffect(() => {
    let raf = 0,
      lastTime = -1,
      lastSettings: Settings | null = null;
    const draw = () => {
      const v = video.current,
        c = canvas.current;
      if (
        v &&
        c &&
        v.readyState >= 2 &&
        (v.currentTime !== lastTime || latest.current !== lastSettings)
      ) {
        const ratio = Math.min(1, 1280 / Math.max(asset.width, asset.height));
        const w = Math.max(2, Math.round(asset.width * ratio)),
          h = Math.max(2, Math.round(asset.height * ratio));
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const ctx = c.getContext("2d")!,
          b = latest.current.blur,
          value = b[b.mode];
        ctx.clearRect(0, 0, w, h);
        ctx.filter = "none";
        ctx.imageSmoothingEnabled = true;
        if (b.enabled && value > 0 && b.mode === "pixelate") {
          const [pw, ph] = pixelSize(asset.width, asset.height, value),
            tile = small.current;
          if (tile.width !== pw || tile.height !== ph) {
            tile.width = pw;
            tile.height = ph;
          }
          const tx = tile.getContext("2d")!;
          tx.imageSmoothingEnabled = false;
          tx.drawImage(v, 0, 0, pw, ph);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tile, 0, 0, w, h);
        } else if (b.enabled && value > 0) {
          const sigma = blurSigma(asset.width, asset.height, value) * ratio,
            pad = Math.ceil(sigma * 3),
            tile = small.current;
          if (tile.width !== w + pad * 2 || tile.height !== h + pad * 2) {
            tile.width = w + pad * 2;
            tile.height = h + pad * 2;
          }
          const tx = tile.getContext("2d")!;
          tx.imageSmoothingEnabled = true;
          tx.drawImage(v, pad, pad, w, h);
          tx.drawImage(v, 0, 0, 1, v.videoHeight, 0, pad, pad, h);
          tx.drawImage(
            v,
            v.videoWidth - 1,
            0,
            1,
            v.videoHeight,
            w + pad,
            pad,
            pad,
            h,
          );
          tx.drawImage(tile, 0, pad, tile.width, 1, 0, 0, tile.width, pad);
          tx.drawImage(
            tile,
            0,
            pad + h - 1,
            tile.width,
            1,
            0,
            pad + h,
            tile.width,
            pad,
          );
          ctx.filter = `blur(${sigma}px)`;
          ctx.drawImage(tile, -pad, -pad);
          ctx.filter = "none";
        } else ctx.drawImage(v, 0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        if (fontsReady) ctx.drawImage(overlay.current, 0, 0, w, h);
        lastTime = v.currentTime;
        lastSettings = latest.current;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [asset, fontsReady]);
  const toggle = () => {
    const v = video.current!;
    if (v.paused)
      v.play().catch(() =>
        onError(
          "No se pudo reproducir el video. Intenta importarlo nuevamente.",
        ),
      );
    else v.pause();
  };
  return (
    <div className="player" ref={container}>
      <div className="video-stage">
        <video
          ref={video}
          src={`/api/videos/${asset.id}/preview`}
          preload="auto"
          playsInline
          onLoadedData={() => setLoaded(true)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={() => setTime(video.current!.currentTime)}
          onError={() =>
            onError(
              "No se pudo leer la vista previa. Vuelve a importar el archivo.",
            )
          }
        />
        <canvas
          ref={canvas}
          aria-label="Vista previa del video con efectos"
          onClick={toggle}
        />
        {!loaded && <div className="loading">Cargando vista previa…</div>}
      </div>
      <div className="playback">
        <button
          className="icon-button accent"
          onClick={toggle}
          aria-label={playing ? "Pausar" : "Reproducir"}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          className="icon-button"
          aria-label="Volver al inicio"
          onClick={() => {
            video.current!.currentTime = 0;
            setTime(0);
          }}
        >
          <RotateCcw size={15} />
        </button>
        <span>{timeLabel(time)}</span>
        <input
          type="range"
          aria-label="Posición de reproducción"
          min="0"
          max={asset.duration}
          step="0.01"
          value={Math.min(time, asset.duration)}
          onChange={(e) => {
            video.current!.currentTime = +e.target.value;
            setTime(+e.target.value);
          }}
        />
        <span>{timeLabel(asset.duration)}</span>
        <button
          className="icon-button"
          disabled={!asset.has_audio}
          aria-label={muted ? "Activar audio" : "Silenciar audio"}
          onClick={() => {
            video.current!.muted = !muted;
            setMuted(!muted);
          }}
        >
          {muted || !asset.has_audio ? (
            <VolumeX size={17} />
          ) : (
            <Volume2 size={17} />
          )}
        </button>
        <button
          className="icon-button"
          aria-label="Pantalla completa"
          onClick={() =>
            container.current
              ?.requestFullscreen()
              .catch(() =>
                onError("El navegador no permite pantalla completa."),
              )
          }
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
}
