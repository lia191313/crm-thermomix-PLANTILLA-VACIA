// Embudo (21/10/2026): en qué paso está cada persona que Rosalía está
// trabajando. Dos caminos:
//   - Venta: Interesada → Demo apuntada → Se lo piensa → Venta.
//   - Recluta: "Interesada en entrar" (ganarse la máquina o trabajar con ella).
//     A partir del alta, el camino de recluta sale solo de Equipo (ver
//     lib/cualificacion.ts): Alta/contrato → Alta activa → Compensada → En su equipo.
// Se guarda en `contacts.estado_lead`; quien tiene otro valor (Nuevo,
// Contactado...) no está en el embudo. "Interesado", "Demo Thermomix" y
// "Agente" ya existían así.

export const ETAPAS_VENTA = [
  { id: "Interesado", label: "Interesada", emoji: "💬", color: "#2E7BC4" },
  { id: "Demo Thermomix", label: "Demo apuntada", emoji: "📅", color: "#F39200" },
  { id: "Se lo piensa", label: "Se lo piensa", emoji: "🤔", color: "#9333EA" },
  { id: "Venta", label: "Venta", emoji: "🛒", color: "#00A650" },
] as const;

/** Primer paso del camino de recluta: lo único que se apunta en la ficha. */
export const ETAPA_QUIERE_ENTRAR = { id: "Agente", label: "Interesada en entrar", emoji: "🙋", color: "#2E7BC4" } as const;

export const ETAPAS_EMBUDO = [...ETAPAS_VENTA, ETAPA_QUIERE_ENTRAR] as const;

export type EtapaEmbudo = (typeof ETAPAS_EMBUDO)[number]["id"];

export const etapaDe = (estadoLead: string | null | undefined) =>
  ETAPAS_EMBUDO.find((e) => e.id === estadoLead) ?? null;

export const enEmbudo = (estadoLead: string | null | undefined) => etapaDe(estadoLead) !== null;

/** Paso anterior o siguiente del camino de venta (null si ya está en el primero o el último). */
export function etapaVecina(estadoLead: string, paso: -1 | 1): EtapaEmbudo | null {
  const i = ETAPAS_VENTA.findIndex((e) => e.id === estadoLead);
  const j = i + paso;
  return i >= 0 && j >= 0 && j < ETAPAS_VENTA.length ? ETAPAS_VENTA[j].id : null;
}

/** Estado que se pone al sacar a alguien del embudo. */
export const FUERA_DEL_EMBUDO = "Contactado";

/**
 * Qué estado poner cuando pasa algo (null = no tocar nada):
 *  - demo apuntada → "Demo apuntada", sin hacer retroceder a nadie que vaya
 *    más adelante en el camino de venta (ni tocar a quien quiere entrar);
 *  - recluta dada de alta en Equipo → sale de "Interesada en entrar", porque
 *    desde ahí su camino lo sigue la pestaña Reclutas con los datos de Equipo.
 */
export function etapaTrasEvento(estadoActual: string | null | undefined, evento: "demo" | "recluta"): string | null {
  if (evento === "recluta") return estadoActual === ETAPA_QUIERE_ENTRAR.id ? FUERA_DEL_EMBUDO : null;
  if (estadoActual === ETAPA_QUIERE_ENTRAR.id) return null;
  const orden = (id: string | null | undefined) => ETAPAS_VENTA.findIndex((e) => e.id === id);
  return orden(estadoActual) >= orden("Demo Thermomix") ? null : "Demo Thermomix";
}
