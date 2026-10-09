// Pestañas "Mañanas" / "Tardes" de Recordatorios: a qué parte del día toca
// cada recordatorio, para sentarse a llamar y tenerlas todas juntas.

export type FranjaDia = "manana" | "tarde" | "cualquiera";

/** A partir de esta hora, un recordatorio cuenta como "de tarde". */
export const HORA_TARDE = 15;

const sinAcentos = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lo que diga la nota manda ("llamar por la tarde", "por la mañana");
 * si no dice nada, se mira la hora. Los que no tienen hora (00:00)
 * sirven para cualquier momento.
 * Ojo: "mañana" a secas suele querer decir "el día siguiente", por eso
 * solo cuenta "por la mañana" / "de mañana" / "mañanas".
 */
export function franjaRecordatorio(fecha: string, notas?: string | null): FranjaDia {
  const n = sinAcentos(notas ?? "");
  if (/\btardes?\b/.test(n)) return "tarde";
  if (/(por|de) la manana|\bmananas\b/.test(n)) return "manana";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "cualquiera";
  if (d.getHours() === 0 && d.getMinutes() === 0) return "cualquiera";
  return d.getHours() >= HORA_TARDE ? "tarde" : "manana";
}

/** ¿Sale en la pestaña de esa franja? Los de "cualquiera" salen en las dos. */
export function vaEnFranja(franja: "manana" | "tarde", fecha: string, notas?: string | null): boolean {
  const f = franjaRecordatorio(fecha, notas);
  return f === franja || f === "cualquiera";
}

/** Minutos desde medianoche, para ordenar por hora del día. */
export function minutoDelDia(fecha: string): number {
  const d = new Date(fecha);
  return isNaN(d.getTime()) ? 0 : d.getHours() * 60 + d.getMinutes();
}

const pad = (n: number) => n.toString().padStart(2, "0");
const fechaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Fecha y hora que propone "Posponer → Otra hora…".
 * - Si el recordatorio aún no ha llegado: su propia fecha y hora.
 * - Si ya pasó (vencido): HOY, a su misma hora si todavía no ha pasado hoy;
 *   si no, a la siguiente hora en punto. Sin hora (00:00) → 10:00.
 */
export function propuestaPosponer(actualIso: string, ahora: Date = new Date()): { date: string; time: string } {
  const d = new Date(actualIso);
  if (!isNaN(d.getTime()) && d > ahora) {
    return { date: fechaLocal(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  const sinHora = isNaN(d.getTime()) || (d.getHours() === 0 && d.getMinutes() === 0);
  const hoy = new Date(ahora);
  hoy.setHours(sinHora ? 10 : d.getHours(), sinHora ? 0 : d.getMinutes(), 0, 0);
  if (hoy <= ahora) {
    hoy.setTime(ahora.getTime());
    hoy.setHours(ahora.getHours() + 1, 0, 0, 0);
  }
  return { date: fechaLocal(hoy), time: `${pad(hoy.getHours())}:${pad(hoy.getMinutes())}` };
}

/** "AAAA-MM-DD" del día local (sin pasar por UTC, que en España resta un día a medianoche). */
export const diaLocal = (iso: string) => fechaLocal(new Date(iso));

/**
 * Al programar una rellamada para alguien, los recordatorios suyos que ya
 * tocaban (vencidos o de hoy) quedan sustituidos por el nuevo: hay que cerrarlos
 * para que no se queden en "Vencidos" para siempre.
 */
export function recordatoriosSustituidos<T extends { contactId: number; nextReminder: string; status: string }>(
  recordatorios: T[],
  contactId: number,
  ahora: Date = new Date()
): T[] {
  const finDeHoy = new Date(ahora);
  finDeHoy.setHours(23, 59, 59, 999);
  return recordatorios.filter(
    (r) => r.contactId === contactId && r.status === "pending" && new Date(r.nextReminder) <= finDeHoy
  );
}

const ETIQUETA_TIPO: Record<string, string> = { llamada: "Llamada", whatsapp: "WhatsApp", nota: "Nota" };

/**
 * Lo último que pasó con una persona, para enseñarlo en su recordatorio
 * ("Última vez: lun 5/10 17:27 · Llamada · CONTESTADOR"). No cuenta las
 * difusiones y quita el texto automático "Recordatorio (…) completado: …".
 */
export function ultimaActividad(
  interacciones: { contactoId: number; tipo: string; descripcion: string | null; fecha: string }[],
  contactId: number
): { cuando: string; tipo: string; texto: string } | null {
  const suyas = interacciones
    .filter((i) => i.contactoId === contactId && i.tipo in ETIQUETA_TIPO)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  const u = suyas[0];
  if (!u) return null;
  const lineas = (u.descripcion ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^Recordatorio \(.*\) completado/i.test(l) && !/^Llamada realizada a /i.test(l));
  const texto = lineas.join(" · ").replace(/^Llamada realizada\s*\/?\s*/i, "").trim();
  const d = new Date(u.fecha);
  const cuando = `${d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "numeric" })} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { cuando, tipo: ETIQUETA_TIPO[u.tipo], texto: texto || "sin nota" };
}
