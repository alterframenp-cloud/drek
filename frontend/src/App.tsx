import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  Copy,
  Film,
  Grid2X2,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Star,
  Trash2,
  Type,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { api, upload } from "./api";
import { clone, defaults, initialStore, readStore, STORE_KEY } from "./model";
import type {
  Diagonal,
  Font,
  Job,
  PresetStore,
  Settings,
  TextStyle,
  VideoAsset,
  Watermark,
} from "./model";
import { diagonalAngle, overlayBlob, renderOverlay } from "./render";
import Preview, { timeLabel } from "./Preview";

const fonts: Font[] = ["Studio Sans", "Studio Serif", "Studio Mono"];
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado.";
const sleep = (n: number) => new Promise<void>((r) => setTimeout(r, n));
function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = "%",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <output>
          {Number(value.toFixed(1))}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
    </label>
  );
}
function Section({
  title,
  icon,
  enabled,
  toggle,
  children,
}: {
  title: string;
  icon: ReactNode;
  enabled: boolean;
  toggle: (b: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details className="tool-section" open>
      <summary>
        {icon}
        <span>{title}</span>
        <b className={enabled ? "dot active" : "dot"} />
        <ChevronDown size={14} />
      </summary>
      <div className="section-body">
        <Toggle label="Activar efecto" checked={enabled} onChange={toggle} />
        <fieldset disabled={!enabled}>{children}</fieldset>
      </div>
    </details>
  );
}
function TextControls({
  value,
  update,
  prefix,
}: {
  value: TextStyle;
  update: (p: Partial<TextStyle>) => void;
  prefix: string;
}) {
  return (
    <>
      <label className="field">
        Tipografía
        <select
          aria-label={`Tipografía ${prefix}`}
          value={value.font}
          onChange={(e) => update({ font: e.target.value as Font })}
        >
          {fonts.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <Toggle
        label={`Negrita ${prefix}`}
        checked={value.bold}
        onChange={(bold) => update({ bold })}
      />
      <label className="color-field">
        <input
          type="color"
          aria-label={`Color ${prefix}`}
          value={value.color}
          onChange={(e) => update({ color: e.target.value })}
        />
        <span>{value.color.toUpperCase()}</span>
      </label>
      <Range
        label={`Opacidad ${prefix}`}
        value={value.opacity}
        onChange={(opacity) => update({ opacity })}
      />
      <div className="row">
        <Toggle
          label="Contorno"
          checked={value.outline}
          onChange={(outline) => update({ outline })}
        />
        <Toggle
          label="Sombra"
          checked={value.shadow}
          onChange={(shadow) => update({ shadow })}
        />
      </div>
    </>
  );
}
export default function App() {
  const [boot] = useState(() => {
    try {
      return { store: readStore(), error: "" };
    } catch (e) {
      return { store: initialStore(), error: message(e) };
    }
  });
  const [store, setStore] = useState<PresetStore>(boot.store);
  const [selected, setSelected] = useState(
    boot.store.defaultId || boot.store.presets[0]?.id || "",
  );
  const [settings, setSettings] = useState<Settings>(() =>
    clone(
      boot.store.presets.find(
        (p) => p.id === (boot.store.defaultId || boot.store.presets[0]?.id),
      )?.settings || defaults,
    ),
  );
  const [asset, setAsset] = useState<VideoAsset | null>(null),
    [job, setJob] = useState<Job | null>(null);
  const [importing, setImporting] = useState(false),
    [stage, setStage] = useState(""),
    [progress, setProgress] = useState(0),
    [starting, setStarting] = useState(false);
  const [error, setError] = useState(boot.error),
    [toast, setToast] = useState(""),
    [health, setHealth] = useState(false),
    [fontsReady, setFontsReady] = useState(false),
    [dragging, setDragging] = useState(false);
  const [dialog, setDialog] = useState<"save" | "rename" | "delete" | null>(
      null,
    ),
    [presetName, setPresetName] = useState(""),
    [dialogError, setDialogError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    importId = useRef<string | null>(null);
  const selectedPreset = store.presets.find((p) => p.id === selected);
  const dirty =
    selectedPreset &&
    JSON.stringify(settings) !== JSON.stringify(selectedPreset.settings);
  const busy =
    starting || job?.status === "queued" || job?.status === "processing";
  const showError = useCallback((s: string) => setError(s), []);
  useEffect(() => {
    api("/api/health")
      .then(() => setHealth(true))
      .catch((e) => setError(message(e)));
    Promise.all(
      fonts.flatMap((f) =>
        [400, 700].map((w) => document.fonts.load(`${w} 16px "${f}"`)),
      ),
    )
      .then(() => setFontsReady(true))
      .catch(() =>
        setError("No se pudieron cargar las tipografías. Recarga el editor."),
      );
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (importing || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [importing, busy]);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    let disposed = false;
    const id = setInterval(() => {
      api<Job>(`/api/exports/${job.id}`)
        .then((next) => {
          if (!disposed) {
            setJob(next);
            if (next.status === "error")
              setError(
                next.error || "Falló la exportación. Puedes reintentar.",
              );
          }
        })
        .catch((e) => {
          if (!disposed) setError(message(e));
        });
    }, 700);
    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [job?.id, job?.status]);
  const water = (v: Partial<Watermark>) =>
    setSettings((s) => ({ ...s, watermark: { ...s.watermark, ...v } }));
  const diagonal = (v: Partial<Diagonal>) =>
    setSettings((s) => ({ ...s, diagonal: { ...s.diagonal, ...v } }));
  const blur = (v: Partial<Settings["blur"]>) =>
    setSettings((s) => ({ ...s, blur: { ...s.blur, ...v } }));
  const persist = (next: PresetStore) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      setStore(next);
      return true;
    } catch {
      setError(
        "No se pudieron guardar los presets. Habilita el almacenamiento del navegador.",
      );
      return false;
    }
  };
  const loadPreset = (id: string) => {
    setSelected(id);
    const p = store.presets.find((p) => p.id === id);
    if (p) {
      setSettings(clone(p.settings));
      setToast(`Preset aplicado: ${p.name}`);
    }
  };
  const openDialog = (mode: "save" | "rename" | "delete") => {
    setDialog(mode);
    setPresetName(mode === "save" ? "" : selectedPreset?.name || "");
    setDialogError("");
  };
  const submitDialog = () => {
    if (dialog === "delete") {
      const presets = store.presets.filter((p) => p.id !== selected);
      if (
        persist({
          ...store,
          presets,
          defaultId: store.defaultId === selected ? null : store.defaultId,
        })
      ) {
        setSelected(presets[0]?.id || "");
        if (presets[0]) setSettings(clone(presets[0].settings));
        setDialog(null);
        setToast("Preset eliminado");
      }
      return;
    }
    const name = presetName.trim();
    if (!name) {
      setDialogError("Escribe un nombre.");
      return;
    }
    if (
      store.presets.some(
        (p) =>
          p.name.toLowerCase() === name.toLowerCase() &&
          (dialog === "save" || p.id !== selected),
      )
    ) {
      setDialogError("Ya existe un preset con ese nombre.");
      return;
    }
    const id = dialog === "save" ? crypto.randomUUID() : selected;
    const presets =
      dialog === "save"
        ? [...store.presets, { id, name, settings: clone(settings) }]
        : store.presets.map((p) => (p.id === selected ? { ...p, name } : p));
    if (persist({ ...store, presets })) {
      setSelected(id);
      setDialog(null);
      setToast("Preset guardado en esta PC");
    }
  };
  const importVideo = async (file: File) => {
    if (busy || importing) return;
    if (!/\.(mp4|mov|mkv|webm)$/i.test(file.name)) {
      setError("Elige un archivo MP4, MOV, MKV o WEBM.");
      return;
    }
    setImporting(true);
    setStage("Copiando al editor local");
    setProgress(0);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    importId.current = null;
    try {
      const previous = asset,
        created = await upload(file, setProgress, abort.signal);
      importId.current = created.id;
      while (!abort.signal.aborted) {
        const next = await api<VideoAsset>(`/api/videos/${created.id}`);
        if (next.status === "error")
          throw new Error(next.error || "No se pudo importar el video.");
        if (next.status === "cancelled") break;
        if (next.status === "ready") {
          setAsset(next);
          setJob(null);
          const p = store.presets.find((p) => p.id === store.defaultId);
          if (p) {
            setSettings(clone(p.settings));
            setSelected(p.id);
          }
          if (previous)
            api(`/api/videos/${previous.id}`, { method: "DELETE" }).catch((e) =>
              setError(message(e)),
            );
          setToast("Video listo. El original se conserva.");
          break;
        }
        setStage(
          next.status === "queued"
            ? "Esperando turno"
            : "Preparando vista previa",
        );
        setProgress(next.progress || 0);
        await sleep(500);
      }
    } catch (e) {
      if (!abort.signal.aborted) setError(message(e));
    } finally {
      setImporting(false);
      controller.current = null;
      importId.current = null;
    }
  };
  const cancelImport = async () => {
    controller.current?.abort();
    if (importId.current) {
      try {
        await api(`/api/videos/${importId.current}`, { method: "DELETE" });
      } catch (e) {
        setError(message(e));
      }
    }
  };
  const exportVideo = async (quick = false) => {
    if (!asset || busy || !fontsReady) return;
    const snapshot = clone(
      quick && selectedPreset ? selectedPreset.settings : settings,
    );
    if (quick) setSettings(clone(snapshot));
    setStarting(true);
    setError("");
    try {
      await document.fonts.ready;
      const layer = renderOverlay(
        document.createElement("canvas"),
        asset.width,
        asset.height,
        snapshot,
      );
      const form = new FormData();
      form.append("video_id", asset.id);
      form.append("overlay", await overlayBlob(layer), "overlay.png");
      form.append(
        "settings",
        JSON.stringify({
          blur: snapshot.blur,
          resolution: snapshot.resolution,
          quality: snapshot.quality,
        }),
      );
      setJob(await api<Job>("/api/exports", { method: "POST", body: form }));
    } catch (e) {
      setError(message(e));
    } finally {
      setStarting(false);
    }
  };
  const w = settings.watermark,
    d = settings.diagonal;
  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy && !importing) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files[0]) void importVideo(e.dataTransfer.files[0]);
      }}
    >
      <header className="topbar">
        <span className="brand">
          <i>
            <Layers3 size={23} />
          </i>
          drek<span>.</span>
        </span>
        <span className="product-name">Video Blur & Watermark Editor</span>
        <span className="local-badge">
          <b className={health ? "dot active" : "dot"} />
          {health ? "Editor local" : "Conectando…"}
        </span>
        <span className="privacy">
          <LockKeyhole size={13} />
          Tus videos se quedan en tu PC
        </span>
      </header>
      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-title">
            <SlidersHorizontal size={17} />
            Tu estilo, en cada video
          </div>
          <section className="preset-section">
            <div className="eyebrow">
              PRESET <span>REUTILIZABLE</span>
            </div>
            <select
              className="preset-select"
              aria-label="Preset"
              value={selected}
              onChange={(e) => loadPreset(e.target.value)}
            >
              {!store.presets.length && (
                <option value="">Sin presets guardados</option>
              )}
              {store.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === store.defaultId ? " ★" : ""}
                </option>
              ))}
            </select>
            <p className={dirty ? "preset-note modified" : "preset-note"}>
              {dirty
                ? "● Cambios sin guardar en el preset"
                : "Todos tus ajustes, en un clic"}
            </p>
            <div className="row">
              <button
                className="button small"
                onClick={() => openDialog("save")}
              >
                <Plus size={13} />
                Save New
              </button>
              <button
                className="button small"
                disabled={!selectedPreset}
                onClick={() => {
                  if (
                    persist({
                      ...store,
                      presets: store.presets.map((p) =>
                        p.id === selected
                          ? { ...p, settings: clone(settings) }
                          : p,
                      ),
                    })
                  )
                    setToast("Preset actualizado");
                }}
              >
                <Save size={13} />
                Update
              </button>
              <button
                className="icon-button bordered"
                disabled={!selectedPreset}
                aria-label="Load Preset"
                title="Recargar preset guardado"
                onClick={() => loadPreset(selected)}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <div className="preset-secondary">
              <button
                className={store.defaultId === selected ? "accent" : ""}
                disabled={!selectedPreset}
                onClick={() =>
                  persist({
                    ...store,
                    defaultId: store.defaultId === selected ? null : selected,
                  })
                }
              >
                <Star size={12} />
                {store.defaultId === selected
                  ? "Predeterminado"
                  : "Set as Default"}
              </button>
              <button
                disabled={!selectedPreset}
                onClick={() => openDialog("rename")}
              >
                Renombrar
              </button>
              <button
                disabled={!selectedPreset}
                aria-label="Eliminar preset"
                onClick={() => openDialog("delete")}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </section>
          <div className="tools-heading">
            CAPAS Y EFECTOS <span>03</span>
          </div>
          <Section
            title="Blur / Pixelate"
            icon={<Grid2X2 size={17} />}
            enabled={settings.blur.enabled}
            toggle={(enabled) => blur({ enabled })}
          >
            <div className="segmented">
              {(["gaussian", "pixelate"] as const).map((mode) => (
                <button
                  className={settings.blur.mode === mode ? "selected" : ""}
                  key={mode}
                  onClick={() => blur({ mode })}
                >
                  {mode === "gaussian" ? "Gaussian" : "Pixelate"}
                </button>
              ))}
            </div>
            <Range
              label="Intensidad"
              value={settings.blur[settings.blur.mode]}
              onChange={(v) => blur({ [settings.blur.mode]: v })}
            />
            <p className="hint">
              Solo el video se desenfoca. Los textos quedan nítidos.
            </p>
          </Section>
          <Section
            title="Watermark"
            icon={<Copy size={17} />}
            enabled={w.enabled}
            toggle={(enabled) => water({ enabled })}
          >
            <label className="field">
              Texto de la marca
              <input
                aria-label="Texto de la marca"
                maxLength={500}
                value={w.text}
                onChange={(e) => water({ text: e.target.value })}
              />
            </label>
            <div className="segmented">
              <button
                className={w.position === "left" ? "selected" : ""}
                onClick={() => water({ position: "left" })}
              >
                ↙ Bottom Left
              </button>
              <button
                className={w.position === "right" ? "selected" : ""}
                onClick={() => water({ position: "right" })}
              >
                Bottom Right ↘
              </button>
            </div>
            <label className="field">
              Background
              <select
                aria-label="Background"
                value={w.background}
                onChange={(e) =>
                  water({
                    background: e.target.value as Watermark["background"],
                  })
                }
              >
                <option value="transparent">Transparent</option>
                <option value="black">Black Background</option>
                <option value="white">White Background</option>
              </select>
            </label>
            {w.background !== "transparent" && (
              <>
                <Range
                  label="Opacidad del fondo"
                  value={w.backgroundOpacity}
                  onChange={(backgroundOpacity) => water({ backgroundOpacity })}
                />
                <Toggle
                  label="Auto Text Contrast"
                  checked={w.autoContrast}
                  onChange={(autoContrast) => water({ autoContrast })}
                />
              </>
            )}
            <Range
              label="Tamaño de marca"
              value={w.size}
              min={0.5}
              max={20}
              step={0.1}
              onChange={(size) => water({ size })}
            />
            <details className="advanced">
              <summary>
                Tipografía, color y espaciado
                <ChevronDown size={13} />
              </summary>
              <TextControls value={w} prefix="marca" update={water} />
              {w.autoContrast && w.background !== "transparent" && (
                <p className="hint">
                  Color automático:{" "}
                  {w.background === "white" ? "negro" : "blanco"}. Desactiva
                  Auto Text Contrast para elegirlo.
                </p>
              )}
              <Range
                label="Padding horizontal"
                value={w.paddingX}
                max={10}
                step={0.1}
                onChange={(paddingX) => water({ paddingX })}
              />
              <Range
                label="Padding vertical"
                value={w.paddingY}
                max={10}
                step={0.1}
                onChange={(paddingY) => water({ paddingY })}
              />
              <Range
                label="Esquinas redondeadas"
                value={w.radius}
                max={10}
                step={0.1}
                onChange={(radius) => water({ radius })}
              />
            </details>
            <Range
              label="Margen horizontal"
              value={w.marginX}
              max={45}
              step={0.1}
              onChange={(marginX) => water({ marginX })}
            />
            <Range
              label="Margen inferior"
              value={w.marginY}
              max={45}
              step={0.1}
              onChange={(marginY) => water({ marginY })}
            />
          </Section>
          <Section
            title="Diagonal Text"
            icon={<Type size={17} />}
            enabled={d.enabled}
            toggle={(enabled) => diagonal({ enabled })}
          >
            <label className="field">
              Texto diagonal
              <input
                aria-label="Texto diagonal"
                maxLength={500}
                value={d.text}
                onChange={(e) => diagonal({ text: e.target.value })}
              />
            </label>
            <Range
              label="Tamaño diagonal"
              value={d.size}
              min={0.5}
              max={40}
              step={0.1}
              onChange={(size) => diagonal({ size })}
            />
            <Toggle
              label="Ajustar texto al encuadre"
              checked={d.autoFit}
              onChange={(autoFit) => diagonal({ autoFit })}
            />
            {!d.autoFit && (
              <p className="hint warning">
                Los textos grandes pueden salir del encuadre.
              </p>
            )}
            <Toggle
              label="Diagonal automática"
              checked={d.autoAngle}
              onChange={(autoAngle) => diagonal({ autoAngle })}
            />
            {d.autoAngle ? (
              <p className="hint">
                Ángulo del video:{" "}
                {diagonalAngle(
                  asset?.width || 1920,
                  asset?.height || 1080,
                ).toFixed(1)}
                °
              </p>
            ) : (
              <Range
                label="Ángulo"
                value={d.angle}
                min={-180}
                max={180}
                unit="°"
                onChange={(angle) => diagonal({ angle })}
              />
            )}
            <details className="advanced">
              <summary>
                Tipografía, color y posición
                <ChevronDown size={13} />
              </summary>
              <TextControls value={d} prefix="diagonal" update={diagonal} />
              <Range
                label="Posición horizontal"
                value={d.x}
                onChange={(x) => diagonal({ x })}
              />
              <Range
                label="Posición vertical"
                value={d.y}
                onChange={(y) => diagonal({ y })}
              />
              <button
                className="button small full-width"
                onClick={() =>
                  diagonal({ x: 50, y: 50, autoAngle: true, autoFit: true })
                }
              >
                <RotateCcw size={13} />
                Restaurar diagonal
              </button>
            </details>
          </Section>
          <p className="sidebar-foot">Presets guardados en este navegador</p>
        </aside>
        <section className="editor">
          <div className="editor-heading">
            <div>
              <div className="eyebrow">TU VIDEO. TU IDENTIDAD.</div>
              <h1>
                Hazlo tuyo<span>.</span>
              </h1>
              <p>Desenfoca el video. Deja tu marca.</p>
            </div>
            <button
              className="button"
              disabled={busy || importing}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={15} />
              {asset ? "Cambiar video" : "Importar video"}
            </button>
          </div>
          <input
            className="visually-hidden"
            ref={fileInput}
            type="file"
            accept=".mp4,.mov,.mkv,.webm"
            aria-label="Importar archivo de video"
            onChange={(e) => {
              if (e.target.files?.[0]) void importVideo(e.target.files[0]);
              e.target.value = "";
            }}
          />
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Cerrar error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="preview-panel">
            <div className="panel-bar">
              <span>
                <b className="dot active" />
                VIDEO PREVIEW
              </span>
              <span>
                {asset
                  ? `${asset.width} × ${asset.height}`
                  : "Todo listo para empezar"}
              </span>
            </div>
            {importing ? (
              <div className="empty-preview">
                <div className="upload-emblem">
                  <LoaderCircle className="spin" size={32} />
                </div>
                <h2>{stage}</h2>
                <p>
                  La preparación se realiza en esta PC. El original se conserva.
                </p>
                <progress max={100} value={progress} />
                <p>{progress}%</p>
                <button
                  className="button small"
                  onClick={() => void cancelImport()}
                >
                  Cancelar importación
                </button>
              </div>
            ) : asset ? (
              <Preview
                key={asset.id}
                asset={asset}
                settings={settings}
                fontsReady={fontsReady}
                onError={showError}
              />
            ) : (
              <div className="empty-preview">
                <div className="empty-grid" />
                <div className="upload-emblem">
                  <Film size={34} />
                </div>
                <h2>Un video. Tu sello personal.</h2>
                <p>Arrastra tu video aquí y dale un estilo que se reconozca.</p>
                <button
                  className="button primary"
                  onClick={() => fileInput.current?.click()}
                >
                  <Plus size={16} />
                  Seleccionar video
                </button>
                <span className="file-formats">MP4 · MOV · MKV · WEBM</span>
                <p className="local-note">
                  <LockKeyhole size={12} />
                  Sin subidas a la nube ni límites artificiales de duración.
                </p>
              </div>
            )}
          </div>
          {asset ? (
            <div className="asset-info">
              <span>
                <Film size={14} />
                <strong title={asset.name}>{asset.name}</strong>
              </span>
              <span>
                {asset.width} × {asset.height}
              </span>
              <span>{asset.fps.toFixed(2)} FPS</span>
              <span>{timeLabel(asset.duration)}</span>
              <span>{asset.has_audio ? "Audio original" : "Sin audio"}</span>
              <span>{(asset.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          ) : (
            <div className="workflow-hints">
              {[
                [
                  "01",
                  "Importa tu video",
                  "Cualquier orientación o proporción",
                ],
                ["02", "Aplica tu preset", "Una identidad visual consistente"],
                ["03", "Exporta y comparte", "Un MP4 listo para usar"],
              ].map(([n, t, s]) => (
                <div key={n}>
                  <i>{n}</i>
                  <div>
                    <strong>{t}</strong>
                    <small>{s}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
          <section className="export-panel">
            <div className="export-title">
              <ArrowDownToLine size={21} />
              <div>
                <h2>Listo para salir</h2>
                <p>Tu video, con todos los detalles.</p>
              </div>
              <span>MP4 / H.264</span>
            </div>
            <div className="export-options">
              <label className="field">
                Resolución
                <select
                  aria-label="Resolución de exportación"
                  value={settings.resolution}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      resolution: e.target.value as Settings["resolution"],
                    }))
                  }
                >
                  <option value="original">Original</option>
                  <option value="720">720p · sin ampliar</option>
                  <option value="1080">1080p · sin ampliar</option>
                </select>
              </label>
              <label className="field">
                Calidad
                <select
                  aria-label="Calidad de exportación"
                  value={settings.quality}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      quality: e.target.value as Settings["quality"],
                    }))
                  }
                >
                  <option value="high">Alta calidad</option>
                  <option value="standard">
                    Estándar · archivo más ligero
                  </option>
                </select>
              </label>
              <div className="export-buttons">
                <button
                  className="button quick"
                  disabled={
                    !asset ||
                    !selectedPreset ||
                    busy ||
                    importing ||
                    !fontsReady
                  }
                  title="Exporta el preset guardado seleccionado"
                  onClick={() => void exportVideo(true)}
                >
                  <Zap size={15} />
                  Quick Export
                </button>
                <button
                  className="button primary"
                  disabled={!asset || busy || importing || !fontsReady}
                  onClick={() => void exportVideo()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <ArrowDownToLine size={15} />
                  )}
                  {busy ? "Exportando…" : "Export Video"}
                </button>
              </div>
            </div>
            <div className="export-foot">
              <span>Audio sincronizado · Sin marca de agua de la app</span>
              <span>Quick Export usa el preset guardado</span>
            </div>
            {job && (
              <div className={`job-panel ${job.status}`} aria-live="polite">
                <div>
                  <CheckCircle2 size={17} />
                  <div>
                    <strong>
                      {job.status === "ready"
                        ? "Tu video está listo"
                        : job.status === "cancelled"
                          ? "Exportación cancelada"
                          : job.status === "error"
                            ? "No se pudo exportar. Puedes reintentar."
                            : `Renderizando · ${job.progress}%`}
                    </strong>
                    <small>Ajustes capturados al iniciar la exportación.</small>
                  </div>
                  {job.status === "ready" ? (
                    <a
                      className="button primary small"
                      href={`/api/exports/${job.id}/download`}
                      download
                    >
                      <ArrowDownToLine size={14} />
                      Guardar MP4
                    </a>
                  ) : busy ? (
                    <button
                      className="button small"
                      onClick={() =>
                        api<Job>(`/api/exports/${job.id}`, { method: "DELETE" })
                          .then(setJob)
                          .catch((e) => setError(message(e)))
                      }
                    >
                      Cancelar
                    </button>
                  ) : (
                    <button
                      className="icon-button"
                      aria-label="Cerrar estado"
                      onClick={() => setJob(null)}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                {busy && <progress max={100} value={job.progress} />}
              </div>
            )}
          </section>
          <footer>
            <LockKeyhole size={12} />
            100% local. Sin cuentas. Sin suscripciones.
          </footer>
        </section>
      </main>
      {dragging && (
        <div className="drop-overlay">
          <Upload size={44} />
          <h2>Suelta tu próximo video</h2>
          <p>MP4, MOV, MKV o WEBM</p>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              submitDialog();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDialog(null);
            }}
          >
            <div className="modal-title">
              <Layers3 size={20} />
              <h2 id="dialog-title">
                {dialog === "delete"
                  ? "Eliminar preset"
                  : dialog === "rename"
                    ? "Renombrar preset"
                    : "Save New Preset"}
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar diálogo"
                onClick={() => setDialog(null)}
              >
                <X size={17} />
              </button>
            </div>
            {dialog === "delete" ? (
              <p>¿Eliminar “{selectedPreset?.name}”? No se puede deshacer.</p>
            ) : (
              <>
                <p>Guarda todos los efectos y opciones de exportación.</p>
                <label className="field">
                  Nombre del preset
                  <input
                    autoFocus
                    maxLength={80}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                </label>
              </>
            )}
            {dialogError && (
              <p role="alert" className="warning">
                {dialogError}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button"
                type="button"
                onClick={() => setDialog(null)}
              >
                Cancelar
              </button>
              <button className="button primary" type="submit">
                {dialog === "delete" ? "Eliminar" : "Guardar preset"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
