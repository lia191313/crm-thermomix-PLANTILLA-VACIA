import { noProponerLlamar } from "@/lib/marcas";
import type { Contact } from "@/hooks/useContacts";
import type { Reminder } from "@/hooks/useReminders";
import type { Venta } from "@/hooks/useSupabaseVentas";
import type { Demo } from "@/hooks/useDemos";

// Cálculo de la "Agenda de hoy": a quién toca llamar. Lo usan el Dashboard y
// la pantalla "Mi día", para que las dos propongan exactamente a las mismas.

export interface ClienteProximo extends Contact {
  diasSinContacto: number;
  prioridad: number;
  marcadoRellamar: boolean;
}

interface Datos {
  contacts: Contact[];
  rellamarIds: number[];
  reminders: Reminder[];
  ventas: Venta[];
  demos: Demo[];
  getDiasDesdeUltimoContacto: (contactId: number) => number;
  isSnoozed: (contactId: number) => boolean;
}

// Días desde una fecha normalizada al día (ignora horas)
export function diasDesdeFecha(fecha: string | Date | null | undefined): number {
  if (!fecha) return 999;
  const hoy = new Date();
  const hoyNorm = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return 999;
  const dNorm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = hoyNorm.getTime() - dNorm.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// Helpers de normalización para emparejar ventas/demos legacy con contactos
// (los contacto_id pueden estar rotos tras migrar de localStorage a Supabase)
function normPhone(t: string | null | undefined): string {
  if (!t) return "";
  const solo = String(t).replace(/\D/g, "");
  // Quitar prefijo +34 si está, para comparar por los 9 dígitos nacionales
  return solo.startsWith("34") && solo.length > 9 ? solo.slice(-9) : solo;
}

function normName(n: string | null | undefined): string {
  if (!n) return "";
  return String(n)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quitar acentos
    .replace(/\[cedido\]/g, "")
    .replace(/thermomix/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Días desde el último contacto con esta persona: llamada, WhatsApp o
 * difusión, venta, bienvenida o demo (lo más reciente manda). 999 = nunca.
 * Lo usan la Agenda, "Mi día" y la ficha.
 */
export function diasSinContactoDe(
  contact: Contact,
  { ventas, demos, getDiasDesdeUltimoContacto }: Pick<Datos, "ventas" | "demos" | "getDiasDesdeUltimoContacto">
): number {
  const contactTel = normPhone(contact.telefono);
  const contactName = normName(contact.nombre);

  // Un registro "pertenece" a este contacto si:
  //  (a) su id numérico coincide, O
  //  (b) el teléfono normalizado coincide (cubre typos en el nombre), O
  //  (c) el nombre normalizado coincide (fallback final)
  const perteneceAContacto = (
    regId: number | string | null | undefined,
    regTel: string | null | undefined,
    regNombre: string | null | undefined
  ): boolean => {
    if (regId != null && Number(regId) === Number(contact.id)) return true;
    const rTel = normPhone(regTel);
    if (contactTel && rTel && contactTel === rTel) return true;
    const rName = normName(regNombre);
    if (contactName && rName && contactName === rName) return true;
    return false;
  };

  // 1) Días desde última interacción (llamada, whatsapp, difusión)
  const diasInteracciones = getDiasDesdeUltimoContacto(contact.id);

  // 2) Días desde última venta o bienvenida (vender o hacer bienvenida = contacto)
  const diasEventosVenta: number[] = [];
  ventas.forEach(v => {
    if (perteneceAContacto(v.contacto_id, v.contacto_telefono, v.contacto_nombre)) {
      if (v.fecha_venta) diasEventosVenta.push(diasDesdeFecha(v.fecha_venta));
      if (v.bienvenida_realizada && v.fecha_bienvenida) {
        diasEventosVenta.push(diasDesdeFecha(v.fecha_bienvenida));
      }
    }
  });
  const diasVentas = diasEventosVenta.length > 0 ? Math.min(...diasEventosVenta) : 999;

  // 3) Días desde última demo (hacer demo = contacto directo)
  // Demos solo tienen contactoId y contactoNombre (no teléfono)
  const diasDemosArr: number[] = [];
  demos.forEach(d => {
    if (perteneceAContacto(d.contactoId, null, d.contactoNombre) && d.fecha) {
      diasDemosArr.push(diasDesdeFecha(d.fecha));
    }
  });
  const diasDemos = diasDemosArr.length > 0 ? Math.min(...diasDemosArr) : 999;

  // Tomar el mínimo: el contacto más reciente manda
  return Math.min(diasInteracciones, diasVentas, diasDemos);
}

// Los marcados como rellamar SIEMPRE aparecen, más los prioritarios (máx. 20)
export function calcularProximosClientes({
  contacts, rellamarIds, reminders, ventas, demos, getDiasDesdeUltimoContacto, isSnoozed,
}: Datos): ClienteProximo[] {
  if (!contacts || contacts.length === 0) return [];

  // Excluir ⛔ (archivados) y 🤝/🔇 ("solo si me necesita"): no se les propone llamar
  const contactosFiltrados = contacts.filter(c => !noProponerLlamar(c.nombre));

  const todos = contactosFiltrados.map(contact => {
    const diasSinContacto = diasSinContactoDe(contact, { ventas, demos, getDiasDesdeUltimoContacto });

    const reminder = reminders.find(r => r.contactId === contact.id);
    const marcadoRellamar = rellamarIds.includes(contact.id);

    let prioridad = 0;
    if (marcadoRellamar) {
      prioridad = 200;
    } else if (diasSinContacto === 999) {
      // Nunca contactados: aparecen siempre los primeros
      prioridad = 10000;
    } else if (reminder) {
      if (diasSinContacto >= reminder.frequency) prioridad = 100 + (diasSinContacto - reminder.frequency);
    } else if (diasSinContacto >= 30) {
      prioridad = 50 + (diasSinContacto - 30);
    } else {
      // NO mostrar clientes con menos de 30 días sin contacto (ya fueron contactados recientemente)
      prioridad = 0;
    }

    return { ...contact, diasSinContacto, prioridad, marcadoRellamar };
  });

  // Separar los marcados como rellamar (siempre visibles)
  const rellamar = todos.filter(c => c.marcadoRellamar);

  // Limitar los nunca-contactados a 5 para que no se coman toda la agenda
  const nuncaContactados = todos
    .filter(c => !c.marcadoRellamar && c.diasSinContacto === 999)
    .slice(0, 5);

  // El resto (+30 días sin contacto o recordatorio vencido), excluyendo nunca-contactados
  const resto = todos
    .filter(
      c =>
        !c.marcadoRellamar &&
        c.diasSinContacto !== 999 &&
        c.prioridad > 0
    )
    .sort((a, b) => b.prioridad - a.prioridad)
    .slice(0, 15);

  // Combinar sin duplicados: primero rellamar, luego nunca-contactados, luego resto
  const combinado = [...rellamar];
  [...nuncaContactados, ...resto].forEach(c => {
    if (!combinado.find(r => r.id === c.id)) {
      combinado.push(c);
    }
  });

  // Excluir clientes con snooze activo
  const sinAplazados = combinado.filter(c => !isSnoozed(c.id));

  return sinAplazados.sort((a, b) => b.prioridad - a.prioridad).slice(0, 20);
}
