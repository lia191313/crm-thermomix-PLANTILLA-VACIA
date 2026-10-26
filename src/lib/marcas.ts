// Marcas que se pueden poner delante del nombre de un contacto:
//   ⛔        = Archivado: no llamar nunca.
//   🤝 o 🔇   = "Solo si me necesita": gente amable que no quiere invitaciones
//              ni demos. Sigue siendo clienta, pero la app no la propone para
//              llamar ni la mete en difusiones.
//   🚫        = "No invitar": no se le mandan invitaciones a clases ni talleres
//              (ni presenciales ni online), pero sí se le puede llamar. Más suave
//              que ⛔ (20/10/2026).
//   🖥️        = "Solo online": solo clases online; no entra en las invitaciones
//              presenciales (20/10/2026).

export const MARCA_ARCHIVADO = "⛔";
export const MARCAS_SOLO_SI_NECESITA = ["🤝", "🔇"];
export const MARCA_NO_INVITAR = "🚫";
export const MARCA_SOLO_ONLINE = "🖥"; // sin el selector de variante, para que coincida con 🖥 y 🖥️

export const esArchivado = (nombre: string) => (nombre ?? "").includes(MARCA_ARCHIVADO);

export const esSoloSiNecesita = (nombre: string) =>
  !esArchivado(nombre) && MARCAS_SOLO_SI_NECESITA.some((m) => (nombre ?? "").includes(m));

/** No se le propone llamar (Agenda, Planning) ni entra en difusiones. */
export const noProponerLlamar = (nombre: string) => esArchivado(nombre) || esSoloSiNecesita(nombre);

/** No entra en las difusiones de clases y talleres (⛔, 🤝/🔇 o 🚫). */
export const noInvitar = (nombre: string) => noProponerLlamar(nombre) || (nombre ?? "").includes(MARCA_NO_INVITAR);

/** Solo clases online (🖥️): fuera de las invitaciones presenciales. */
export const soloOnline = (nombre: string) => (nombre ?? "").includes(MARCA_SOLO_ONLINE);

/** Buscador de nombres: sin tildes y por el principio de cada palabra ("ana" encuentra "Ana Isabel", no "Diana"). */
export function coincideNombre(nombre: string, busqueda: string): boolean {
  const limpio = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const palabras = limpio(nombre).split(/[^a-z0-9ñ]+/).filter(Boolean);
  const buscadas = limpio(busqueda).trim().split(/\s+/).filter(Boolean);
  return buscadas.length > 0 && buscadas.every((b) => palabras.some((p) => p.startsWith(b)));
}

/**
 * Qué cuenta como haber hablado con alguien (Mi día, Panel de control, Reporte
 * diario, días sin contacto): llamada, WhatsApp o difusión. Una nota o una
 * marca de "rellamar" no (21/10/2026).
 */
export const esContactoReal = (tipo: string) => tipo === "llamada" || tipo === "whatsapp" || tipo === "difusion";
