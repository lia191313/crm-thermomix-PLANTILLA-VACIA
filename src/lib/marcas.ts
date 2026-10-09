// Marcas que se pueden poner delante del nombre de un contacto:
//   ⛔        = Archivado: no llamar nunca.
//   🤝 o 🔇   = "Solo si me necesita": gente amable que no quiere invitaciones
//              ni demos. Sigue siendo cliente, pero la app no la propone para
//              llamar ni la mete en difusiones.

export const MARCA_ARCHIVADO = "⛔";
export const MARCAS_SOLO_SI_NECESITA = ["🤝", "🔇"];

export const esArchivado = (nombre: string) => (nombre ?? "").includes(MARCA_ARCHIVADO);

export const esSoloSiNecesita = (nombre: string) =>
  !esArchivado(nombre) && MARCAS_SOLO_SI_NECESITA.some((m) => (nombre ?? "").includes(m));

/** No se le propone llamar (Agenda, Planning) ni entra en difusiones. */
export const noProponerLlamar = (nombre: string) => esArchivado(nombre) || esSoloSiNecesita(nombre);
