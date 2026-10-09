// Recarga datos cuando se vuelve a la ventana de la app (p. ej. si se han
// cambiado desde fuera). Como mucho una vez cada `minMs` para no repetir cargas.
export function alVolverALaApp(recargar: () => void, minMs = 15000): () => void {
  let ultima = Date.now();
  const quizas = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (Date.now() - ultima < minMs) return;
    ultima = Date.now();
    recargar();
  };
  window.addEventListener("focus", quizas);
  document.addEventListener("visibilitychange", quizas);
  return () => {
    window.removeEventListener("focus", quizas);
    document.removeEventListener("visibilitychange", quizas);
  };
}
