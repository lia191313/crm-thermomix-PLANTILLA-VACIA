import type { Agente, NotaEquipo } from "@/hooks/useSupabaseEquipo";
import { fiscalMonthBounds, type FiscalMonth } from "@/utils/fiscalMonth";

// Cualificación de team leader (21/10/2026). Vorwerk pide 1 venta y 1 alta
// activa al mes (revisado por trimestre). Alta activa = recluta del Equipo con
// al menos una venta apuntada (equipo_notas tipo "venta"); compensada = recluta
// con sus 4 ventas. Ahora le faltan 2 altas activas hasta el cierre de
// noviembre. Cuando cambie el objetivo, se cambia aquí.
export const META_TEAM_LEADER = {
  altasActivas: 2,
  hasta: { year: 2026, month: 11 } as FiscalMonth,
};

/** Reclutas dadas de alta hace más de esto (y sin caducar) ya son de su equipo. */
const DIAS_RECLUTA = 120;

export interface EstadoRecluta {
  agente: Agente;
  ventas: number;
  altaActiva: boolean;
  compensada: boolean;
  /** Ya está en su equipo desde hace tiempo (agente comercial). */
  deEquipo: boolean;
}

export function cierreDe(fm: FiscalMonth): Date {
  return new Date(fiscalMonthBounds(fm).endExclusive.getTime() - 86400000);
}

export function calcularCualificacion(agentes: Agente[], notas: NotaEquipo[], hoy = new Date()) {
  const ventasDe = (id: number) => notas.filter((n) => n.agente_id === id && n.tipo === "venta").length;
  const reclutas: EstadoRecluta[] = agentes
    .filter((a) => a.estado !== "caducada")
    .map((a) => {
      const ventas = ventasDe(a.id);
      const dias = a.fecha_alta ? (hoy.getTime() - new Date(a.fecha_alta + "T00:00:00").getTime()) / 86400000 : 0;
      return { agente: a, ventas, altaActiva: ventas >= 1, compensada: ventas >= 4, deEquipo: dias > DIAS_RECLUTA };
    });
  const cierre = cierreDe(META_TEAM_LEADER.hasta);
  // Días de calendario (sin horas, para que el cambio de hora no sume uno de más).
  const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return {
    reclutas,
    altasActivas: reclutas.filter((r) => r.altaActiva && !r.deEquipo).length,
    compensadas: reclutas.filter((r) => r.compensada && !r.deEquipo).length,
    cierre,
    diasRestantes: Math.max(0, Math.round((dia(cierre) - dia(hoy)) / 86400000)),
  };
}

/** Altas activas de un mes fiscal: reclutas cuya PRIMERA venta cae en ese mes. */
export function altasActivasDelMes(notas: NotaEquipo[], fm: FiscalMonth): number {
  const { start, endExclusive } = fiscalMonthBounds(fm);
  const primeraVenta = new Map<number, Date>();
  for (const n of notas) {
    if (n.tipo !== "venta") continue;
    const f = new Date(n.fecha);
    const antes = primeraVenta.get(n.agente_id);
    if (!antes || f < antes) primeraVenta.set(n.agente_id, f);
  }
  return [...primeraVenta.values()].filter((f) => f >= start && f < endExclusive).length;
}
