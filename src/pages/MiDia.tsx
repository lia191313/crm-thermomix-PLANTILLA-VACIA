import { useState, useMemo, useEffect } from "react";
import { addDays, startOfDay } from "date-fns";
import { Phone, MessageCircle, FileText, Clock, CheckCircle2, PartyPopper, MapPin, Check, X, Sun, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useContacts } from "@/hooks/useContacts";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { useReminders, Reminder, loadRemindersFromSupabase } from "@/hooks/useReminders";
import { useRellamar } from "@/hooks/useRellamar";
import { useSupabaseVentas } from "@/hooks/useSupabaseVentas";
import { useDemos } from "@/hooks/useDemos";
import { useDashboardSnooze } from "@/hooks/useDashboardSnooze";
import { calcularProximosClientes, diasDesdeFecha } from "@/lib/proximosClientes";
import { noProponerLlamar, esArchivado, esContactoReal } from "@/lib/marcas";
import { confirmarLlamada } from "@/lib/callDialog";
import { fechaISO } from "@/lib/listados";
import { cargarCitas, marcarCita, catInfo, horaDe, Cita, EstadoCita } from "./Calendario";
import ModalAnotacion from "@/components/ModalAnotacion";
import TarjetasFrases from "@/components/TarjetasFrases";
import TrasLlamadaDialog, { type VolverALlamar } from "@/components/TrasLlamadaDialog";
import { supabase } from "@/lib/supabase";
import RellamarHoyCard from "@/components/RellamarHoyCard";
import ObjetivoMes from "@/components/ObjetivoMes";
import CualificacionTeamLeader from "@/components/CualificacionTeamLeader";
import { fiscalMonthOf, isInFiscalMonth } from "@/utils/fiscalMonth";
import { TMX, TituloSeccion, Recuadro, CabeceraFormacion } from "@/components/EstiloFormacion";
import { BotonPromos } from "@/components/Promociones";

// "Mi día": junta en una sola lista lo que toca hoy, para no tener que mirar
// Dashboard, Recordatorios, Rellamar, Calendario y Listados por separado.
//   1. Citas de hoy (demos, bienvenidas, talleres…), como en el Calendario.
//   2. A quién llamar: recordatorios de hoy y atrasados, rellamar y la Agenda
//      del Dashboard (+30 días sin hablar o nunca contactadas). Cada persona
//      sale una sola vez, con el motivo más importante.
//   3. Personas de los listados para volver a llamar (se llaman desde Listados).
//   4. Bienvenidas pendientes.

type Motivo = "recordatorio" | "rellamar" | "agenda";

interface Tarea {
  contactId: number;
  nombre: string;
  telefono: string;
  ubicacion: string;
  motivo: Motivo;
  detalle: string;
  /** Solo en los recordatorios: para darlo por hecho o pasarlo a otro día. */
  reminder?: Reminder;
  atrasado?: boolean;
}

// Recordatorios con más de un mes de retraso: van al final, plegados, para
// que no tapen lo de hoy. Y como mucho 5 de "Toca hablar" al día (21/10/2026).
const DIAS_ATRASADO_ANTIGUO = 30;
const MAX_TOCA_HABLAR = 5;

const ESTILO_MOTIVO: Record<Motivo, { etiqueta: string; clase: string; borde: string }> = {
  // Regla de colores (21/10/2026): gris; rojo solo si está atrasado.
  recordatorio: { etiqueta: "🔔 Recordatorio", clase: "bg-gray-100 text-gray-700", borde: "border-l-gray-300" },
  rellamar: { etiqueta: "📞 Rellamar", clase: "bg-gray-100 text-gray-700", borde: "border-l-gray-300" },
  agenda: { etiqueta: "💡 Toca hablar", clase: "bg-gray-100 text-gray-700", borde: "border-l-gray-300" },
};

const limpiar = (n: string) => n.replace("[CEDIDO] ", "").replace(" THERMOMIX", "").split(" FIRA")[0];
const primerNombre = (n: string) => limpiar(n).split(" ")[0];
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

interface MiDiaProps {
  onViewContact?: (id: number) => void;
  onNavigate?: (section: string) => void;
}

export default function MiDia({ onViewContact, onNavigate }: MiDiaProps) {
  const { contacts, loading, updateContact } = useContacts();
  const { contactos, addContacto, getDiasDesdeUltimoContacto } = useLlamadasGlobales();
  const { reminders, getPendingReminders, getOverdueReminders, completeReminder, snoozeReminder } = useReminders();
  const { rellamarIds, rellamarData, quitarRellamar, toggleRellamar } = useRellamar();
  const { ventas, updateVenta } = useSupabaseVentas();
  const { demos, stats: statsDemos } = useDemos();
  const { isSnoozed, snooze } = useDashboardSnooze();

  const [citas, setCitas] = useState<Cita[] | null>(null);
  const [aplazarAbierto, setAplazarAbierto] = useState<number | null>(null);
  const [comoFueAbierto, setComoFueAbierto] = useState<number | null>(null);
  const [verAntiguos, setVerAntiguos] = useState(false);
  const [anotar, setAnotar] = useState<{ id: number; nombre: string } | null>(null);
  // Persona a la que se acaba de llamar: sale la ventana "¿Cómo ha ido?".
  const [trasLlamada, setTrasLlamada] = useState<Tarea | null>(null);

  // Citas de hoy. Los seguimientos y rellamar no van aquí: salen en "A quién llamar".
  const recargarCitas = () => {
    const hoy = startOfDay(new Date());
    return cargarCitas(hoy, addDays(hoy, 1))
      .then((todas) => setCitas(todas.filter((c) => c.categoria !== "seguimiento" && c.categoria !== "rellamar")))
      .catch((e) => {
        console.error("Error cargando las citas de hoy:", e);
        setCitas((antes) => antes ?? []);
      });
  };
  useEffect(() => {
    recargarCitas();
  }, []);

  const contactsMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const { tareas, atrasadosAntiguos } = useMemo(() => {
    const lista: Tarea[] = [];
    const antiguos: Tarea[] = [];
    const yaEsta = new Set<number>();

    // 1) Recordatorios: primero los atrasados, luego los de hoy por hora.
    const atrasados = [...getOverdueReminders()].sort((a, b) => a.nextReminder.localeCompare(b.nextReminder));
    const deHoy = [...getPendingReminders()].sort((a, b) => a.nextReminder.localeCompare(b.nextReminder));
    [...atrasados, ...deHoy].forEach((r) => {
      if (noProponerLlamar(r.contactName ?? "") || yaEsta.has(r.contactId)) return;
      const c = contactsMap.get(r.contactId);
      const atrasado = atrasados.includes(r);
      const cuando = atrasado
        ? `de hace ${diasDesdeFecha(r.nextReminder)} ${diasDesdeFecha(r.nextReminder) === 1 ? "día" : "días"}`
        : hora(r.nextReminder) === "00:00" ? "hoy" : `a las ${hora(r.nextReminder)}`;
      yaEsta.add(r.contactId);
      (atrasado && diasDesdeFecha(r.nextReminder) > DIAS_ATRASADO_ANTIGUO ? antiguos : lista).push({
        contactId: r.contactId,
        nombre: c?.nombre ?? r.contactName,
        telefono: c?.telefono ?? "",
        ubicacion: c?.ubicacion ?? "",
        motivo: "recordatorio",
        detalle: `${cuando}${r.notes ? ` · ${r.notes}` : ""}`,
        reminder: r,
        atrasado,
      });
    });

    // 2) y 3) Rellamar y Agenda: el mismo cálculo que el Dashboard.
    const fechaRellamar = new Map(rellamarData.map((r) => [r.contact_id, r.fecha_rellamada]));
    const hoyISO = fechaISO();
    let tocaHablar = 0;
    calcularProximosClientes({ contacts, rellamarIds, reminders, ventas, demos, getDiasDesdeUltimoContacto, isSnoozed })
      .forEach((c) => {
        if (yaEsta.has(c.id)) return;
        if (c.marcadoRellamar) {
          // Los que tienen fecha para más adelante salen ese día, no hoy.
          const fecha = fechaRellamar.get(c.id);
          if (fecha && fecha.slice(0, 10) > hoyISO) return;
        } else if (++tocaHablar > MAX_TOCA_HABLAR) {
          return;
        }
        yaEsta.add(c.id);
        lista.push({
          contactId: c.id,
          nombre: c.nombre,
          telefono: c.telefono,
          ubicacion: c.ubicacion,
          motivo: c.marcadoRellamar ? "rellamar" : "agenda",
          detalle: c.marcadoRellamar
            ? "la última vez no te pudo atender"
            : c.diasSinContacto === 999
            ? "nueva: todavía no habéis hablado"
            : `hace ${c.diasSinContacto} días que no habláis`,
        });
      });

    const orden: Record<Motivo, number> = { recordatorio: 0, rellamar: 1, agenda: 2 };
    return { tareas: lista.sort((a, b) => orden[a.motivo] - orden[b.motivo]), atrasadosAntiguos: antiguos };
  }, [contacts, contactsMap, reminders, getOverdueReminders, getPendingReminders, rellamarIds, rellamarData, ventas, demos, getDiasDesdeUltimoContacto, isSnoozed]);

  // Con quién ha hablado ya hoy: llamada, WhatsApp o difusión (no notas), sin los ⛔.
  const hechasHoy = useMemo(() => {
    const hoy = new Date().toDateString();
    const ids = new Set<number>();
    contactos.forEach((c) => {
      if (new Date(c.fecha).toDateString() !== hoy || !esContactoReal(c.tipo)) return;
      const contacto = contactsMap.get(c.contactoId);
      if (contacto && !esArchivado(contacto.nombre)) ids.add(c.contactoId);
    });
    return [...ids].map((id) => contactsMap.get(id)!);
  }, [contactos, contactsMap]);

  const bienvenidasPendientes = useMemo(
    () => ventas.filter((v) => !v.bienvenida_realizada).sort((a, b) => a.fecha_venta.localeCompare(b.fecha_venta)),
    [ventas]
  );

  // ---------- Acciones ----------
  // `yaHecho`: el check "¿Cómo fue?". Ya habló con ella desde el móvil, así que
  // no se abre ni el diálogo de llamar ni WhatsApp: solo se apunta.
  const registrar = async (t: Tarea, tipo: "llamada" | "whatsapp", yaHecho = false, nota = "", volver: VolverALlamar | null = null) => {
    setComoFueAbierto(null);
    try {
      const phone = t.telefono.replace(/\D/g, "");
      if (!yaHecho && tipo === "llamada" && phone) {
        const metodo = await confirmarLlamada(phone);
        if (metodo === "cancelado") return;
      }
      if (!yaHecho && tipo === "whatsapp") {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent("Hola, ¿cómo estás?")}`, "_blank");
      }
      const desde =
        tipo === "llamada"
          ? (yaHecho ? "Llamada hecha (marcada en Mi día)" : "Llamada realizada desde Mi día")
          : (yaHecho ? "WhatsApp enviado (marcado en Mi día)" : "WhatsApp enviado desde Mi día");
      const base = t.reminder
        ? `Recordatorio completado${t.reminder.notes ? `: ${t.reminder.notes}` : ""} (${desde.toLowerCase()})`
        : desde;
      const descripcion = nota ? `${base} — ${nota}` : base;
      await addContacto(t.contactId, tipo, descripcion);
      if (t.reminder) await completeReminder(t.reminder.id, t.reminder.frequency);
      if (volver) {
        const { error } = await supabase.from("recordatorios").insert([{
          contacto_id: t.contactId,
          contacto_nombre: t.nombre,
          descripcion: nota ? `Volver a llamar — ${nota}` : "Volver a llamar",
          // Sin tipo, el aviso al móvil (get_due_reminders) no lo enviaría.
          tipo: "seguimiento",
          fecha: `${volver.fecha}T${volver.hora || "10:00"}:00`,
          completado: false,
        }]);
        if (error) throw error;
        await loadRemindersFromSupabase();
      }
      await quitarRellamar(t.contactId);
      const c = contactsMap.get(t.contactId);
      if (c?.sinContactar) updateContact({ ...c, sinContactar: false });
      toast.success(`${tipo === "llamada" ? "Llamada apuntada" : "WhatsApp apuntado"} para ${primerNombre(t.nombre)} ✔${volver ? " · recordatorio puesto" : ""}`);
    } catch (error: any) {
      console.error("Error registrando desde Mi día:", error);
      toast.error(`No se pudo apuntar: ${error?.message || error}`);
    }
  };

  // "No contesta": no cuenta como hablada (la interacción es de tipo "rellamar",
  // que el Dashboard y el Reporte no cuentan) y vuelve a salir mañana.
  const noContesta = async (t: Tarea, nota = "") => {
    setComoFueAbierto(null);
    try {
      await addContacto(t.contactId, "rellamar", `No contesta (marcado en Mi día)${nota ? ` — ${nota}` : ""}`);
      if (t.reminder) {
        const original = new Date(t.reminder.nextReminder);
        const manana = addDays(startOfDay(new Date()), 1);
        manana.setHours(original.getHours(), original.getMinutes(), 0, 0);
        await snoozeReminder(t.reminder.id, manana);
      } else {
        // toggleRellamar quita la marca si ya estaba: se quita y se vuelve a poner con la fecha de mañana.
        await quitarRellamar(t.contactId);
        await toggleRellamar(t.contactId, fechaISO(addDays(new Date(), 1)));
      }
      toast.warning(`${primerNombre(t.nombre)} no contesta: vuelve a salir mañana 📞`);
    } catch (error: any) {
      console.error("Error apuntando 'no contesta':", error);
      toast.error(`No se pudo apuntar: ${error?.message || error}`);
    }
  };

  // "Llamar": primero se llama y, al volver, la ventana "¿Cómo ha ido?" apunta el resultado.
  const llamar = async (t: Tarea) => {
    setComoFueAbierto(null);
    const metodo = await confirmarLlamada(t.telefono.replace(/\D/g, ""));
    if (metodo !== "cancelado") setTrasLlamada(t);
  };

  const aplazar = async (t: Tarea, dias: number) => {
    setAplazarAbierto(null);
    try {
      if (t.reminder) {
        // El recordatorio se mueve a ese día, a la misma hora.
        const original = new Date(t.reminder.nextReminder);
        const nueva = addDays(startOfDay(new Date()), dias);
        nueva.setHours(original.getHours(), original.getMinutes(), 0, 0);
        await snoozeReminder(t.reminder.id, nueva);
      } else {
        await snooze(t.contactId, dias);
      }
      toast.success(`${primerNombre(t.nombre)}: ${dias === 1 ? "mañana" : `dentro de ${dias} días`} 🕐`);
    } catch {
      toast.error("No se pudo pasar a otro día");
    }
  };

  // Check de las citas: tocar otra vez lo deja como estaba.
  const marcar = async (c: Cita, estado: EstadoCita) => {
    const actual: EstadoCita | null = c.anulada ? "anulado" : c.hecho ? "hecho" : null;
    const nuevo = actual === estado ? null : estado;
    try {
      if (c.ventaId) await updateVenta(c.ventaId, { bienvenida_realizada: nuevo === "hecho" });
      else await marcarCita(c, nuevo);
      await recargarCitas();
      toast.success(nuevo === "hecho" ? "Marcada como hecha ✔" : nuevo === "anulado" ? "Marcada como anulada" : "Quitada la marca");
    } catch (e) {
      console.error("Error marcando la cita:", e);
      toast.error("No se pudo guardar la marca de la cita");
    }
  };

  // Tarjeta de cada persona de "A quién llamar".
  const tarjeta = (t: Tarea) => {
    const estilo = ESTILO_MOTIVO[t.motivo];
    return (
      <Card key={t.contactId} className={`p-3 border-l-4 bg-white ${t.atrasado ? "border-l-red-400" : estilo.borde} space-y-2`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            onClick={() => {
              setAplazarAbierto(null);
              setComoFueAbierto(comoFueAbierto === t.contactId ? null : t.contactId);
            }}
            title="Ya la he llamado (por ejemplo, desde el móvil)"
            className={`h-7 w-7 shrink-0 rounded-full border-2 flex items-center justify-center hover:border-green-500 hover:text-green-500 hover:bg-green-50 ${
              comoFueAbierto === t.contactId ? "border-green-500 text-green-500 bg-green-50" : "border-gray-300 text-transparent"
            }`}
          >
            <Check size={16} strokeWidth={3} />
          </button>
          <button
            className="font-bold text-left hover:text-blue-600 hover:underline"
            onClick={() => onViewContact?.(t.contactId)}
          >
            {limpiar(t.nombre)}
          </button>
          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase whitespace-nowrap ${t.atrasado ? "bg-red-100 text-red-700" : estilo.clase}`}>
            {estilo.etiqueta}
          </span>
          {t.ubicacion && <span className="text-xs text-muted-foreground">{t.ubicacion}</span>}
          <span className="text-sm text-gray-700 tabular-nums whitespace-nowrap">{t.telefono ? `📞 ${t.telefono}` : "sin teléfono"}</span>
        </div>
        <p className="text-sm text-muted-foreground first-letter:uppercase">{t.detalle}</p>

        {comoFueAbierto === t.contactId ? (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">¿Cómo fue?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <Button size="sm" className="h-9 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => registrar(t, "llamada", true)}>
                <Phone size={14} /> Hablamos
              </Button>
              <Button size="sm" className="h-9 gap-1 bg-white border border-green-300 text-green-700 hover:bg-green-50" onClick={() => registrar(t, "whatsapp", true)}>
                <MessageCircle size={14} /> WhatsApp
              </Button>
              <Button size="sm" className="h-9 gap-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => noContesta(t)}>
                📞 No contesta
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-full text-slate-500" onClick={() => setComoFueAbierto(null)}>
              Cancelar
            </Button>
          </div>
        ) : aplazarAbierto === t.contactId ? (
          <div className="flex gap-1.5">
            {([[1, "Mañana"], [7, "En 1 semana"], [30, "En 1 mes"]] as const).map(([dias, texto]) => (
              <Button key={dias} variant="outline" size="sm" className="flex-1 h-9" onClick={() => aplazar(t, dias)}>
                {texto}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setAplazarAbierto(null)}>✕</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <Button
              variant="outline" size="sm"
              className="h-9 gap-1 border-green-200 hover:bg-green-50 text-green-700"
              disabled={!t.telefono}
              onClick={() => llamar(t)}
            >
              <Phone size={14} /> Llamar
            </Button>
            <Button
              variant="outline" size="sm"
              className="h-9 gap-1 border-green-200 hover:bg-green-50 text-green-700"
              disabled={!t.telefono}
              onClick={() => registrar(t, "whatsapp")}
            >
              <MessageCircle size={14} /> WhatsApp
            </Button>
            <Button
              variant="ghost" size="sm" className="h-9 gap-1 text-gray-600"
              onClick={() => setAnotar({ id: t.contactId, nombre: t.nombre })}
            >
              <FileText size={14} /> Anotar
            </Button>
            <Button
              variant="ghost" size="sm" className="h-9 gap-1 text-slate-500"
              onClick={() => setAplazarAbierto(t.contactId)}
            >
              <Clock size={14} /> Otro día
            </Button>
          </div>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const total = tareas.length + hechasHoy.length;
  const porcentaje = total === 0 ? 100 : Math.round((hechasHoy.length / total) * 100);

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-4xl mx-auto">
      {/* Cabecera y progreso */}
      <CabeceraFormacion
        icono={Sun}
        titulo="Mi día"
        subtitulo={new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
      >
        <BotonPromos className="shrink-0" />
      </CabeceraFormacion>

      <Recuadro color={TMX.verde} className="space-y-2 !p-3 sm:!p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-medium text-gray-700">
            {tareas.length === 0 ? (
              "¡No te queda nadie pendiente hoy!"
            ) : (
              <>
                Te {tareas.length === 1 ? "queda" : "quedan"}{" "}
                <span className="font-semibold" style={{ color: TMX.verde }}>
                  {tareas.length} {tareas.length === 1 ? "persona" : "personas"}
                </span>{" "}
                por contactar
              </>
            )}
          </p>
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {hechasHoy.length} {hechasHoy.length === 1 ? "hecha" : "hechas"} hoy
          </p>
        </div>
        <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${porcentaje}%`, backgroundColor: TMX.verde }} />
        </div>
      </Recuadro>

      <ObjetivoMes
        ventasMes={ventas.filter((v) => v.fecha_venta && isInFiscalMonth(new Date(v.fecha_venta), fiscalMonthOf(new Date()))).length}
        demosMes={statsDemos.demosMes}
      />
      <CualificacionTeamLeader resumen onAbrir={() => onNavigate?.("rendimiento")} />

      {/* 1. Citas de hoy: lista sencilla, como una agenda (21/10/2026: el marco
          naranja y las cajas de colores le parecían demasiado). */}
      <section className="space-y-3">
        <TituloSeccion color={TMX.naranja} icono={CalendarDays}>Citas de hoy</TituloSeccion>
        {citas === null ? (
          <p className="text-sm text-muted-foreground">Cargando citas…</p>
        ) : citas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hoy no tienes demos, bienvenidas ni otras citas apuntadas.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {citas.map((c) => {
              const info = catInfo(c.categoria);
              // Anular solo las citas del calendario; las demos y bienvenidas se cambian en su apartado.
              const sePuedeAnular = !!c.evento;
              const apagada = c.hecho || c.anulada;
              return (
                <div key={c.key} className="px-3 py-2 flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => marcar(c, "hecho")}
                    title={c.hecho ? "Quitar el check" : "Marcar como hecha"}
                    className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      c.hecho ? "bg-green-500 border-green-500 text-white" : c.anulada ? "border-gray-400 text-gray-500" : "border-gray-300 hover:border-green-500"
                    }`}
                  >
                    {c.hecho && <Check size={12} strokeWidth={3} />}
                    {c.anulada && <X size={12} strokeWidth={3} />}
                  </button>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${info.punto}`} title={info.label} />
                  <span className={`text-sm w-11 shrink-0 tabular-nums ${c.anulada ? "text-gray-500 line-through" : c.hecho ? "text-gray-400" : "text-gray-700 font-medium"}`}>
                    {c.todoElDia ? "Día" : horaDe(c.inicio)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      className={`text-sm text-left hover:underline disabled:no-underline ${c.anulada ? "text-gray-500 line-through" : c.hecho ? "text-gray-400 line-through" : "text-gray-800"}`}
                      disabled={!c.contactoId}
                      onClick={() => c.contactoId && onViewContact?.(c.contactoId)}
                    >
                      {c.titulo}
                    </button>
                    {c.anulada && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">Anulada</span>}
                    {c.lugar && !apagada && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><MapPin size={11} /> {c.lugar}</p>
                    )}
                  </div>
                  {sePuedeAnular && !c.hecho && (
                    <button
                      className="text-xs text-gray-400 hover:text-gray-700 hover:underline shrink-0"
                      onClick={() => marcar(c, "anulado")}
                    >
                      {c.anulada ? "Deshacer" : "Anular"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Ideas de frases para las llamadas, en tarjetas que van cambiando */}
      <TarjetasFrases />

      {/* 2. A quién llamar */}
      <section className="space-y-3">
        <TituloSeccion color={TMX.azul} icono={Phone}>A quién llamar hoy</TituloSeccion>
        <Recuadro color={TMX.azul} className="space-y-2">
        {tareas.length === 0 ? (
          <Card className="p-8 text-center bg-gray-50 border-dashed">
            <CheckCircle2 className="mx-auto text-green-500 mb-2" size={40} />
            <p className="font-medium">Todo al día</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {tareas.map(tarjeta)}
          </div>
        )}

        {/* Atrasados de hace más de un mes: plegados al final */}
        {atrasadosAntiguos.length > 0 && (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-between h-10 text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => setVerAntiguos(!verAntiguos)}
            >
              <span>⏳ Atrasados antiguos (más de un mes): {atrasadosAntiguos.length}</span>
              <span>{verAntiguos ? "Ocultar ▲" : "Ver ▼"}</span>
            </Button>
            {verAntiguos && atrasadosAntiguos.map(tarjeta)}
          </div>
        )}
        </Recuadro>
      </section>

      {/* 3. Listados */}
      <RellamarHoyCard onAbrir={() => onNavigate?.("listados")} />

      {/* 4. Bienvenidas pendientes */}
      {bienvenidasPendientes.length > 0 && (
        <section className="space-y-3">
          <TituloSeccion color={TMX.naranja} icono={PartyPopper}>Bienvenidas pendientes ({bienvenidasPendientes.length})</TituloSeccion>
          <Recuadro color={TMX.naranja} className="divide-y !p-0">
            {bienvenidasPendientes.slice(0, 5).map((v) => (
              <div key={v.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                <button
                  className="font-semibold text-left hover:underline disabled:no-underline"
                  disabled={!v.contacto_id}
                  onClick={() => v.contacto_id && onViewContact?.(v.contacto_id)}
                >
                  {limpiar(v.contacto_nombre ?? "")} {v.modelo && <span className="font-normal text-muted-foreground">({v.modelo})</span>}
                </button>
                <span className="text-muted-foreground whitespace-nowrap">
                  {v.fecha_bienvenida
                    ? `bienvenida el ${new Date(v.fecha_bienvenida.slice(0, 10) + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
                    : `vendida hace ${diasDesdeFecha(v.fecha_venta)} días`}
                </span>
              </div>
            ))}
            <div className="p-2 text-right">
              <Button variant="link" size="sm" onClick={() => onNavigate?.("ventas")}>Ver todas en Ventas</Button>
            </div>
          </Recuadro>
        </section>
      )}

      {/* 5. Ya hechas hoy */}
      {hechasHoy.length > 0 && (
        <section className="space-y-2">
          <TituloSeccion color={TMX.verde} icono={CheckCircle2}>Ya has hablado hoy con</TituloSeccion>
          <div className="flex flex-wrap gap-2">
            {hechasHoy.map((c) => (
              <button
                key={c.id}
                onClick={() => onViewContact?.(c.id)}
                className="px-2.5 py-1 rounded-full bg-green-50 text-green-800 text-sm line-through decoration-green-400 hover:no-underline"
              >
                {limpiar(c.nombre)}
              </button>
            ))}
          </div>
        </section>
      )}

      {trasLlamada && (
        <TrasLlamadaDialog
          nombre={primerNombre(trasLlamada.nombre)}
          telefono={trasLlamada.telefono}
          onHablamos={(nota, volver) => {
            const t = trasLlamada;
            setTrasLlamada(null);
            registrar(t, "llamada", true, nota, volver);
          }}
          onNoContesta={(nota) => {
            const t = trasLlamada;
            setTrasLlamada(null);
            noContesta(t, nota);
          }}
          onCerrar={() => setTrasLlamada(null)}
        />
      )}

      {anotar && (
        <ModalAnotacion contactoId={anotar.id} contactoNombre={anotar.nombre} onClose={() => setAnotar(null)} />
      )}
    </div>
  );
}
