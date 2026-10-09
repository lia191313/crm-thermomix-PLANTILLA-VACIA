// Aviso de versión nueva: cada vez que se publica la app cambia el nombre
// del archivo principal (/assets/index-XXXX.js). Si la ventana abierta sigue
// con el antiguo, se ofrece recargar. Así no se queda nadie con una versión
// vieja en una ventana que lleva días abierta (típico en la app instalada).
import { toast } from "sonner";

const PATRON = /\/assets\/index-[\w-]+\.js/;
const CADA_MS = 5 * 60 * 1000;

export function scriptActual(doc: Document = document): string | null {
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>("script[src]"));
  for (const s of scripts) {
    const m = s.getAttribute("src")?.match(PATRON);
    if (m) return m[0];
  }
  return null;
}

export function scriptPublicado(html: string): string | null {
  return html.match(PATRON)?.[0] ?? null;
}

let avisado = false;

async function comprobar(actual: string) {
  if (avisado) return;
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const publicado = scriptPublicado(await res.text());
    if (publicado && publicado !== actual) {
      avisado = true;
      toast.info("Hay una versión nueva de la app", {
        description: "Pulsa Actualizar cuando termines lo que estés haciendo.",
        duration: Infinity,
        action: { label: "Actualizar", onClick: () => window.location.reload() },
      });
    }
  } catch {
    // sin conexión: ya se comprobará en la próxima vuelta
  }
}

/** Empieza a vigilar si se publica una versión nueva (solo en la web publicada). */
export function vigilarNuevaVersion() {
  const actual = scriptActual();
  if (!actual) return; // en desarrollo no hay /assets/index-*.js
  setInterval(() => comprobar(actual), CADA_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") comprobar(actual);
  });
}

/**
 * Si una pantalla no se puede descargar (porque se publicó una versión nueva
 * y la antigua ya no existe), recarga una vez en vez de quedarse en blanco.
 */
export function cargarConReintento<T>(importar: () => Promise<T>): () => Promise<T> {
  return () =>
    importar().then((modulo) => {
      marcarCargaCorrecta(); // ha funcionado: se permite otro reintento en el futuro
      return modulo;
    }).catch((err) => {
      const CLAVE = "thermomix_recarga_por_version";
      let yaRecargado = false;
      try {
        yaRecargado = sessionStorage.getItem(CLAVE) === "1";
        if (!yaRecargado) sessionStorage.setItem(CLAVE, "1");
      } catch {
        yaRecargado = true;
      }
      if (!yaRecargado) window.location.reload();
      throw err;
    });
}

/** Tras cargar bien, se permite otro reintento en el futuro. */
export function marcarCargaCorrecta() {
  try {
    sessionStorage.removeItem("thermomix_recarga_por_version");
  } catch {
    // nada
  }
}
