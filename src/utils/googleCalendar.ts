/**
 * Utilidad para generar URLs de "Añadir a Google Calendar".
 * No requiere API key ni OAuth — abre Google Calendar en el navegador
 * con el evento ya rellenado para que el usuario lo confirme.
 */

export type TipoEvento = "demo" | "bienvenida" | "clase" | "seguimiento" | "general";

export interface GoogleCalendarEventParams {
  tipo: TipoEvento;
  contactoNombre: string;
  /** Fecha ISO: "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM:SS" */
  fecha: string;
  /** Hora inicio "HH:MM". Si no se pasa se usa 10:00 */
  horaInicio?: string;
  /** Duración en minutos. Por defecto: 60 */
  duracionMinutos?: number;
  /** Notas adicionales para la descripción del evento */
  notas?: string;
}

const EMOJIS: Record<TipoEvento, string> = {
  demo: "📱",
  bienvenida: "👋",
  clase: "🎓",
  seguimiento: "📞",
  general: "📅",
};

const TITULOS: Record<TipoEvento, string> = {
  demo: "Demo Thermomix",
  bienvenida: "Bienvenida Thermomix",
  clase: "Clase Thermomix",
  seguimiento: "Seguimiento Thermomix",
  general: "Recordatorio Thermomix",
};

/** Convierte "YYYY-MM-DD" + "HH:MM" a formato Google Calendar "YYYYMMDDTHHMMSS" */
function toGCalDate(fechaIso: string, hora = "10:00"): string {
  // Si ya viene con hora (contiene "T"), extraemos partes
  let datePart = fechaIso;
  let timePart = hora;

  if (fechaIso.includes("T")) {
    [datePart, timePart] = fechaIso.split("T");
    // Normalizamos HH:MM:SS → HH:MM
    timePart = timePart.substring(0, 5);
  }

  const dateClean = datePart.replace(/-/g, "");
  const timeClean = timePart.replace(/:/g, "") + "00"; // HH:MM → HHMMSS
  return `${dateClean}T${timeClean}`;
}

/** Suma minutos a un timestamp GCal "YYYYMMDDTHHMMSS" */
function addMinutesToGCalDate(gcalDate: string, minutes: number): string {
  const year = parseInt(gcalDate.substring(0, 4));
  const month = parseInt(gcalDate.substring(4, 6)) - 1;
  const day = parseInt(gcalDate.substring(6, 8));
  const hour = parseInt(gcalDate.substring(9, 11));
  const min = parseInt(gcalDate.substring(11, 13));

  const d = new Date(year, month, day, hour, min);
  d.setMinutes(d.getMinutes() + minutes);

  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

/**
 * Genera la URL para añadir un evento a Google Calendar.
 * Abre directamente el formulario de creación con todos los datos rellenos.
 */
export function buildGoogleCalendarUrl(params: GoogleCalendarEventParams): string {
  const {
    tipo,
    contactoNombre,
    fecha,
    horaInicio = "10:00",
    duracionMinutos = 60,
    notas,
  } = params;

  const emoji = EMOJIS[tipo];
  const titulo = TITULOS[tipo];
  const title = `${emoji} ${titulo} - ${contactoNombre}`;

  const start = toGCalDate(fecha, horaInicio);
  const end = addMinutesToGCalDate(start, duracionMinutos);

  const lines = [`Thermomix CRM · ${titulo} con ${contactoNombre}`];
  if (notas) lines.push(`\nNotas: ${notas}`);
  lines.push("\n📌 Añadido desde tu app CRM Thermomix");
  const details = lines.join("\n");

  const params_ = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details,
  });

  return `https://calendar.google.com/calendar/render?${params_.toString()}`;
}

/**
 * Abre Google Calendar en una nueva pestaña con el evento prellenado.
 */
export function abrirEnGoogleCalendar(params: GoogleCalendarEventParams): void {
  const url = buildGoogleCalendarUrl(params);
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Versión libre para las citas del Calendario (ferias, entregas, reuniones...):
 * el título, el sitio y las horas los pone ella, no hace falta una clienta.
 */
export function abrirCitaEnGoogleCalendar(cita: {
  titulo: string;
  inicio: Date;
  fin?: Date | null;
  todoElDia?: boolean;
  lugar?: string | null;
  notas?: string | null;
}): void {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const dia = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hora = (d: Date) => `${dia(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  let dates: string;
  if (cita.todoElDia) {
    const siguiente = new Date(cita.inicio);
    siguiente.setDate(siguiente.getDate() + 1);
    dates = `${dia(cita.inicio)}/${dia(siguiente)}`;
  } else {
    const fin = cita.fin ?? new Date(cita.inicio.getTime() + 60 * 60000);
    dates = `${hora(cita.inicio)}/${hora(fin)}`;
  }

  const lines: string[] = [];
  if (cita.notas) lines.push(cita.notas, "");
  lines.push("📌 Añadido desde tu app CRM Thermomix");

  const params = new URLSearchParams({ action: "TEMPLATE", text: cita.titulo, dates, details: lines.join("\n") });
  if (cita.lugar) params.set("location", cita.lugar);
  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
}
