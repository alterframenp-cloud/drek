export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    throw new Error(
      "No se pudo conectar con Drek. Comprueba que start.bat siga abierto.",
    );
  }
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : `Error del servidor (${r.status}).`,
    );
  }
  return r.json();
}
export function upload(
  file: File,
  progress: (n: number) => void,
  signal: AbortSignal,
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.detail || "No se pudo importar."));
      } catch {
        reject(new Error("El servidor devolvió una respuesta inválida."));
      }
    };
    xhr.onerror = () =>
      reject(new Error("No se pudo conectar con el editor local."));
    xhr.onabort = () =>
      reject(new DOMException("Importación cancelada", "AbortError"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
