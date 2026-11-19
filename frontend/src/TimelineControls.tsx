import { Clock3, Crosshair, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import type { Edit, LayerId, LayerTiming, Settings, VideoAsset } from "./model";
import { emptyEdit } from "./model";
import { keptRanges, ramp } from "./timeline";

export const layerNames: Record<LayerId, string> = {
  blur: "Blur",
  diagonal: "Texto diagonal",
  watermark: "Marca de agua",
};
export function TimingControls({
  value,
  onChange,
  name,
  current,
  duration,
}: {
  value: LayerTiming;
  onChange: (v: LayerTiming) => void;
  name: string;
  current: number;
  duration?: number;
}) {
  const patch = (v: Partial<LayerTiming>) => onChange({ ...value, ...v });
  const start = (v: number) =>
    patch({
      start: v,
      end: value.end !== null && value.end <= v ? null : value.end,
    });
  return (
    <div className="timing-controls">
      <h3>
        <Clock3 size={13} />
        Aparición en el video
      </h3>
      <div className="time-fields">
        <label className="field">
          Desde (s)
          <input
            type="number"
            aria-label={`Inicio ${name}`}
            min={0}
            step={0.1}
            value={value.start}
            onChange={(e) => start(e.target.valueAsNumber || 0)}
          />
          <button
            className="time-cursor"
            disabled={duration === undefined}
            onClick={() => start(Number(current.toFixed(2)))}
          >
            <Crosshair size={11} />
            Usar posición actual
          </button>
        </label>
        <label className="field">
          Hasta (s)
          <input
            type="number"
            aria-label={`Fin ${name}`}
            min={0}
            step={0.1}
            placeholder="Fin del video"
            value={value.end ?? ""}
            onChange={(e) =>
              patch({
                end: e.target.value === "" ? null : e.target.valueAsNumber,
              })
            }
          />
          <button
            className="time-cursor"
            disabled={duration === undefined || current <= value.start}
            onClick={() => patch({ end: Number(current.toFixed(2)) })}
          >
            <Crosshair size={11} />
            Usar posición actual
          </button>
        </label>
      </div>
      <label className="field">
        Transición de entrada
        <select
          aria-label={`Transición ${name}`}
          value={value.transition}
          onChange={(e) =>
            patch({ transition: e.target.value as LayerTiming["transition"] })
          }
        >
          <option value="radial">Desenfoque radial suave</option>
          <option value="fade">Fundido suave</option>
          <option value="none">Sin transición</option>
        </select>
      </label>
      {value.transition !== "none" && (
        <label className="field">
          Duración de transición (s)
          <input
            type="number"
            aria-label={`Duración transición ${name}`}
            min={0}
            max={5}
            step={0.1}
            value={value.duration}
            onChange={(e) =>
              patch({
                duration: Math.min(5, Math.max(0, e.target.valueAsNumber || 0)),
              })
            }
          />
        </label>
      )}
      {value.end !== null && value.end <= value.start && (
        <p className="hint warning">
          La salida debe ser posterior a la entrada.
        </p>
      )}
      {duration !== undefined && value.start >= duration && (
        <p className="hint warning">
          Esta capa empieza después del final del video y no se verá.
        </p>
      )}
      <p className="hint">
        Hasta vacío: permanece hasta el final. La misma duración de transición
        se usa para salir.
      </p>
    </div>
  );
}

export default function TimelineControls({
  asset,
  settings,
  edit,
  onEdit,
  current,
  onSeek,
}: {
  asset: VideoAsset;
  settings: Settings;
  edit: Edit;
  onEdit: (v: Edit) => void;
  current: number;
  onSeek: (t: number) => void;
}) {
  let ranges: [number, number][] = [],
    error = "";
  try {
    ranges = keptRanges(asset.duration, edit);
  } catch (e) {
    error = (e as Error).message;
  }
  const outDuration = ranges.reduce((sum, [a, b]) => sum + b - a, 0);
  const percent = (t: number) =>
    `${Math.max(0, Math.min(100, (t / asset.duration) * 100))}%`;
  const seek = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(
      Math.max(
        0,
        Math.min(
          asset.duration,
          ((e.clientX - r.left) / r.width) * asset.duration,
        ),
      ),
    );
  };
  return (
    <section className="timeline-panel">
      <div className="timeline-heading">
        <Clock3 size={17} />
        <h2>Tiempos y recortes</h2>
        <span>
          Posición: <b>{current.toFixed(2)} s</b> · Resultado:{" "}
          <b>{outDuration.toFixed(2)} s</b>
        </span>
      </div>
      <p className="hint">
        Todos los tiempos se refieren al video original. Los efectos siguen al
        contenido al recortar.
      </p>
      <div className="timeline-tracks">
        <div className="track-row">
          <span>Video conservado</span>
          <button
            className="track video-track"
            aria-label="Buscar en la línea de tiempo"
            onClick={seek}
          >
            {ranges.map(([a, b], i) => (
              <i
                className="kept"
                key={i}
                style={{ left: percent(a), width: percent(b - a) }}
              />
            ))}
            <i className="playhead" style={{ left: percent(current) }} />
          </button>
        </div>
        {(["blur", "diagonal", "watermark"] as LayerId[]).map((id) => {
          const t = settings.timing[id],
            end = Math.min(asset.duration, t.end ?? asset.duration),
            start = Math.min(asset.duration, t.start),
            active = settings[id].enabled;
          return (
            <div key={id} className={`track-row ${active ? "" : "disabled"}`}>
              <span>{layerNames[id]}</span>
              <button
                className={`track effect-track ${id}`}
                aria-label={`Buscar en pista ${layerNames[id]}`}
                onClick={seek}
              >
                {active && end > start && (
                  <i
                    className="effect-span"
                    style={{
                      left: percent(start),
                      width: percent(end - start),
                    }}
                  >
                    <i
                      className="entrance"
                      style={{
                        width: `${t.transition === "none" ? 0 : Math.min(100, (ramp(t, asset.duration) / (end - start)) * 100)}%`,
                      }}
                    />
                  </i>
                )}
                <i className="playhead" style={{ left: percent(current) }} />
              </button>
            </div>
          );
        })}
        <div className="timeline-scale">
          <span>0 s</span>
          <span>{(asset.duration / 2).toFixed(1)} s</span>
          <span>{asset.duration.toFixed(1)} s</span>
        </div>
      </div>
      <details className="cut-controls" open>
        <summary>Recortar inicio, final y tramos intermedios</summary>
        <div className="time-fields">
          <label className="field">
            Conservar desde (s)
            <input
              aria-label="Conservar desde"
              type="number"
              min={0}
              max={asset.duration}
              step={0.1}
              value={edit.start}
              onChange={(e) =>
                onEdit({ ...edit, start: e.target.valueAsNumber || 0 })
              }
            />
            <button
              className="time-cursor"
              onClick={() =>
                onEdit({ ...edit, start: Number(current.toFixed(2)) })
              }
            >
              <Crosshair size={11} />
              Usar posición actual
            </button>
          </label>
          <label className="field">
            Conservar hasta (s)
            <input
              aria-label="Conservar hasta"
              type="number"
              min={0}
              max={asset.duration}
              step={0.1}
              placeholder={asset.duration.toFixed(2)}
              value={edit.end ?? ""}
              onChange={(e) =>
                onEdit({
                  ...edit,
                  end: e.target.value === "" ? null : e.target.valueAsNumber,
                })
              }
            />
            <button
              className="time-cursor"
              onClick={() =>
                onEdit({ ...edit, end: Number(current.toFixed(2)) })
              }
            >
              <Crosshair size={11} />
              Usar posición actual
            </button>
          </label>
        </div>
        <div className="cut-list">
          {edit.cuts.map((c, i) => (
            <div className="cut-row" key={i}>
              <span>Quitar {i + 1}</span>
              <label className="field">
                Desde (s)
                <input
                  type="number"
                  aria-label={`Inicio corte ${i + 1}`}
                  min={0}
                  max={asset.duration}
                  step={0.1}
                  value={c.start}
                  onChange={(e) =>
                    onEdit({
                      ...edit,
                      cuts: edit.cuts.map((v, j) =>
                        j === i
                          ? { ...v, start: e.target.valueAsNumber || 0 }
                          : v,
                      ),
                    })
                  }
                />
                <button
                  className="time-cursor"
                  onClick={() =>
                    onEdit({
                      ...edit,
                      cuts: edit.cuts.map((v, j) =>
                        j === i
                          ? { ...v, start: Number(current.toFixed(2)) }
                          : v,
                      ),
                    })
                  }
                >
                  Posición actual
                </button>
              </label>
              <label className="field">
                Hasta (s)
                <input
                  type="number"
                  aria-label={`Fin corte ${i + 1}`}
                  min={0}
                  max={asset.duration}
                  step={0.1}
                  value={c.end}
                  onChange={(e) =>
                    onEdit({
                      ...edit,
                      cuts: edit.cuts.map((v, j) =>
                        j === i
                          ? { ...v, end: e.target.valueAsNumber || 0 }
                          : v,
                      ),
                    })
                  }
                />
                <button
                  className="time-cursor"
                  onClick={() =>
                    onEdit({
                      ...edit,
                      cuts: edit.cuts.map((v, j) =>
                        j === i ? { ...v, end: Number(current.toFixed(2)) } : v,
                      ),
                    })
                  }
                >
                  Posición actual
                </button>
              </label>
              <button
                className="icon-button"
                aria-label={`Eliminar corte ${i + 1}`}
                onClick={() =>
                  onEdit({ ...edit, cuts: edit.cuts.filter((_, j) => j !== i) })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="row cut-actions">
          <button
            className="button small"
            onClick={() => {
              const start = Math.max(
                0,
                Math.min(current, asset.duration - 0.01),
              );
              onEdit({
                ...edit,
                cuts: [
                  ...edit.cuts,
                  {
                    start: Number(start.toFixed(3)),
                    end: Math.min(
                      asset.duration,
                      start + Math.min(2, asset.duration / 4),
                    ),
                  },
                ],
              });
            }}
          >
            <Plus size={13} />
            Agregar tramo a quitar
          </button>
          <button className="button small" onClick={() => onEdit(emptyEdit())}>
            <RotateCcw size={13} />
            Restablecer recortes
          </button>
        </div>
        {error && (
          <p className="hint warning" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          Las zonas rojas se eliminan junto con su audio. Los recortes son de
          este video; no modifican tu preset.
        </p>
      </details>
    </section>
  );
}
