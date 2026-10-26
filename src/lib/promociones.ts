// Promociones del momento (22/10/2026): de venta y de reclutamiento. Se ordenan
// solas por fechas: en vigor, próximas y anteriores (caducadas).

export type TipoPromo = "venta" | "reclutamiento";

export interface Promocion {
  id: number;
  tipo: TipoPromo;
  titulo: string;
  /** "AAAA-MM-DD"; sin fecha = desde siempre. */
  desde: string | null;
  /** "AAAA-MM-DD", último día incluido; sin fecha = sin final (p. ej. el precio base). */
  hasta: string | null;
  resumen: string | null;
  detalles: string | null;
  whatsapp: string | null;
  imagen: string | null;
}

export type EstadoPromo = "vigente" | "proxima" | "caducada";

/** Fecha de hoy en hora local como "AAAA-MM-DD". */
export function hoyISO(fecha = new Date()): string {
  const d = fecha;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function estadoPromo(p: Pick<Promocion, "desde" | "hasta">, hoy = hoyISO()): EstadoPromo {
  if (p.desde && p.desde > hoy) return "proxima";
  if (p.hasta && p.hasta < hoy) return "caducada";
  return "vigente";
}

/** Días que quedan hasta el último día (0 = acaba hoy). null si no tiene final. */
export function diasParaAcabar(p: Pick<Promocion, "hasta">, hoy = hoyISO()): number | null {
  if (!p.hasta) return null;
  const ms = Date.parse(`${p.hasta}T12:00:00`) - Date.parse(`${hoy}T12:00:00`);
  return Math.round(ms / 86400000);
}

/** "acaba hoy", "acaba mañana", "acaba en 3 días"… solo si queda una semana o menos. */
export function avisoFinal(p: Pick<Promocion, "hasta">, hoy = hoyISO()): string | null {
  const dias = diasParaAcabar(p, hoy);
  if (dias === null || dias < 0 || dias > 7) return null;
  if (dias === 0) return "Acaba hoy";
  if (dias === 1) return "Acaba mañana";
  return `Acaba en ${dias} días`;
}

const corta = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};

/** "13/10 – 26/10", "hasta 31/10", "desde 1/11" o "Siempre". */
export function textoFechas(p: Pick<Promocion, "desde" | "hasta">): string {
  if (p.desde && p.hasta) return `${corta(p.desde)} – ${corta(p.hasta)}`;
  if (p.hasta) return `hasta ${corta(p.hasta)}`;
  if (p.desde) return `desde ${corta(p.desde)}`;
  return "Siempre";
}

/**
 * Reparte y ordena: en vigor primero las que acaban antes (las de sin final,
 * al fondo); próximas por fecha de inicio; anteriores de la más reciente a la más vieja.
 */
export function repartirPromos<T extends Promocion>(promos: T[], hoy = hoyISO()) {
  const vigentes = promos.filter((p) => estadoPromo(p, hoy) === "vigente")
    .sort((a, b) => (a.hasta ?? "9999").localeCompare(b.hasta ?? "9999") || a.titulo.localeCompare(b.titulo));
  const proximas = promos.filter((p) => estadoPromo(p, hoy) === "proxima")
    .sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? ""));
  const anteriores = promos.filter((p) => estadoPromo(p, hoy) === "caducada")
    .sort((a, b) => (b.hasta ?? "").localeCompare(a.hasta ?? ""));
  return { vigentes, proximas, anteriores };
}
