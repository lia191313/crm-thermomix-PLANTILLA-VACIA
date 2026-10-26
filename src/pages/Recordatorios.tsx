import { useState, useMemo, useEffect } from "react";
import { vaEnFranja, minutoDelDia, propuestaPosponer, diaLocal, ultimaActividad } from "@/lib/franjaRecordatorio";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, MessageCircle, CheckCircle, Trash2, AlertCircle, Clock, ExternalLink, Bell, BellOff, AlarmClock, CalendarPlus } from "lucide-react";
import { Clock as IconoCabecera } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import { abrirEnGoogleCalendar, type TipoEvento } from "@/utils/googleCalendar";
import { useSupabaseRecordatorios } from "@/hooks/useSupabaseRecordatorios";
import { useReminders } from "@/hooks/useReminders";
import { useRellamar } from "@/hooks/useRellamar";
import { useContacts } from "@/hooks/useContacts";
import { noProponerLlamar } from "@/lib/marcas";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import ModalDemo from "@/components/ModalDemo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { confirmarLlamada } from "@/lib/callDialog";

interface RecordatoriosProps {
  onViewContact?: (id: number) => void;
}

export default function Recordatorios({ onViewContact }: RecordatoriosProps) {
  const { reminders, completeReminder, snoozeReminder, deleteReminder, getOverdueReminders, getPendingReminders, getUpcomingReminders, getLaterReminders } = useReminders();
  const { rellamarIds, rellamarData, quitarRellamar, loading } = useRellamar();
  const { contacts } = useContacts();
  // Si un recordatorio se guardó sin nombre, se muestra el del contacto.
  const nombreDe = (r: { contactName: string; contactId: number }) =>
    r.contactName?.trim() || contacts.find((c) => c.id === r.contactId)?.nombre || "Sin nombre";
  const { addContacto, contactos: interacciones } = useLlamadasGlobales();
  const {
    permission: pushPermission,
    subscribed: pushSubscribed,
    loading: pushLoading,
    error: pushError,
    subscribe: pushSubscribe,
    unsubscribe: pushUnsubscribe,
  } = usePushSubscription();

  // Rellamadas con fecha concreta para mostrar en pestañas de recordatorios
  const rellamadasConFecha = useMemo(() => {
    return rellamarData
      .filter(r => r.fecha_rellamada)
      .map(r => {
        const contact = contacts.find(c => c.id === r.contact_id);
        // ⛔ / 🤝 / 🔇 no se proponen para llamar aunque sigan marcados.
        return contact && !noProponerLlamar(contact.nombre) ? { ...r, contact } : null;
      })
      .filter(Boolean) as Array<{ contact_id: number; fecha_rellamada: string; contact: typeof contacts[0] }>;
  }, [rellamarData, contacts]);

  // "Para rellamar" sin fecha: nunca a nadie archivado (⛔) ni "Solo si me necesita" (🤝/🔇).
  const paraRellamar = useMemo(
    () =>
      contacts.filter(
        (c) => rellamarIds.includes(c.id) && !noProponerLlamar(c.nombre) && !rellamadasConFecha.find((r) => r.contact_id === c.id)
      ),
    [contacts, rellamarIds, rellamadasConFecha]
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const sevenDaysAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Filtros alineados con getOverdueReminders / getPendingReminders del hook:
  //   - Vencidas: cualquier día anterior a hoy.
  //   - Hoy: solo el día calendario actual.
  //   - Próximas: entre mañana y los próximos 7 días.
  // Antes tenía una ventana de "los últimos 7 días" mezclados con hoy y eso
  // metía rellamadas viejas en la pestaña "Para Hoy". (Ver issue señalado tras #29.)
  const rellamadasVencidas = rellamadasConFecha.filter(r => {
    const fecha = new Date(r.fecha_rellamada + 'T00:00:00');
    return fecha < today;
  });
  const rellamadasHoy = rellamadasConFecha.filter(r => {
    const fecha = new Date(r.fecha_rellamada + 'T00:00:00');
    return fecha >= today && fecha < tomorrow;
  });
  const rellamadasProximas = rellamadasConFecha.filter(r => {
    const fecha = new Date(r.fecha_rellamada + 'T00:00:00');
    return fecha >= tomorrow && fecha <= sevenDaysAhead;
  });
  // Rellamadas con fecha > 7 días vista (caen en la pestaña "Más adelante").
  // Tope práctico: 90 días, igual que getLaterReminders().
  const ninetyDaysAhead = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  ninetyDaysAhead.setHours(23, 59, 59, 999);
  const rellamadasLejanas = rellamadasConFecha.filter(r => {
    const fecha = new Date(r.fecha_rellamada + 'T00:00:00');
    return fecha > sevenDaysAhead && fecha <= ninetyDaysAhead;
  });
  const [activeTab, setActiveTab] = useState<"overdue" | "pending" | "upcoming" | "later" | "rellamadas" | "mananas" | "tardes">("overdue");

  // Estado para completar un recordatorio de tipo DEMO abriendo ModalDemo.
  // Guardamos los datos del recordatorio para poder marcarlo como completado tras guardar.
  const [demoPendingComplete, setDemoPendingComplete] = useState<{
    reminderId: string;
    frequency: number;
    contactId: number;
    contactName: string;
    reminderType?: string;
    reminderNotes?: string;
  } | null>(null);

  // Estado para el dialog "Otra hora..." del snooze.
  // Guardamos el ID del recordatorio + valores iniciales del input
  // (fecha y hora prerellenados con la hora actual del recordatorio).
  const [customSnooze, setCustomSnooze] = useState<{
    reminderId: string;
    contactName: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
  } | null>(null);

  const overdueReminders = getOverdueReminders();
  const pendingReminders = getPendingReminders();
  const upcomingReminders = getUpcomingReminders(7);
  // Día 8 → día 90 desde hoy, todo lo que está fuera de "Próximos 7 días"
  // pero todavía dentro de un horizonte razonable.
  const laterReminders = getLaterReminders(8, 90);

  // Pestañas "Mañanas" / "Tardes": lo que ya toca llamar (vencidos + hoy),
  // separado por parte del día y ordenado por hora. Lo que no tiene hora sale en las dos.
  const porFranja = (franja: "manana" | "tarde") =>
    [...overdueReminders, ...pendingReminders]
      .filter((r) => vaEnFranja(franja, r.nextReminder, r.notes))
      .sort((a, b) => minutoDelDia(a.nextReminder) - minutoDelDia(b.nextReminder));
  const remMananas = porFranja("manana");
  const remTardes = porFranja("tarde");
  const rellamadasYaToca = [...rellamadasVencidas, ...rellamadasHoy];

  useEffect(() => {
    console.log('[Recordatorios] rellamarIds:', rellamarIds, '| length:', rellamarIds.length, '| tipos:', rellamarIds.map(id => typeof id));
    console.log('[Recordatorios] contacts IDs:', contacts.map(c => c.id), '| tipos:', contacts.slice(0,3).map(c => typeof c.id));
    const matches = contacts.filter(c => rellamarIds.includes(c.id));
    console.log('[Recordatorios] contactos que coinciden:', matches.length);
  }, [rellamarIds, contacts]);

  const handleComplete = async (
    reminderId: string,
    frequency: number,
    contactId?: number,
    contactName?: string,
    reminderType?: string,
    reminderNotes?: string
  ) => {
    // 1) Marcar el recordatorio como completado (estado local en localStorage)
    completeReminder(reminderId, frequency);

    // 2) Registrar la interacción en Supabase para que cuente en el Reporte Diario
    //    y resetee el contador de días sin contacto del dashboard.
    if (contactId != null) {
      try {
        const tipoLabel =
          reminderType === "demo" ? "demo"
          : reminderType === "bienvenida" ? "bienvenida"
          : reminderType === "clase" ? "clase"
          : reminderType === "reparacion" ? "reparación"
          : reminderType === "seguimiento" ? "seguimiento"
          : reminderType === "promocion" ? "promoción"
          : reminderType === "otro" ? "recordatorio"
          : "recordatorio";
        const descripcion = `Recordatorio (${tipoLabel}) completado${reminderNotes ? `: ${reminderNotes}` : ""}`;
        await addContacto(contactId, "llamada", descripcion);
      } catch (e) {
        console.error("Error registrando interacción del recordatorio:", e);
      }
    }

    toast.success(
      contactName
        ? `Recordatorio de ${contactName} completado y registrado`
        : "Recordatorio completado"
    );
  };

  const handleDelete = (reminderId: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar este recordatorio?")) {
      deleteReminder(reminderId);
      toast.success("Recordatorio eliminado");
    }
  };

  // ---------- Snooze ----------
  // Pequeño helper para formatear fecha legible en el toast de confirmación.
  const formatSnoozeDate = (d: Date) => {
    const fecha = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${fecha} · ${hora}`;
  };

  const handleSnooze = async (
    reminderId: string,
    contactName: string,
    newDate: Date
  ) => {
    try {
      await snoozeReminder(reminderId, newDate);
      toast.success(`Pospuesto a ${formatSnoozeDate(newDate)} (${contactName})`);
    } catch (e) {
      toast.error("No se pudo posponer el recordatorio");
    }
  };

  // 4 opciones rápidas. Las 2 primeras son relativas a "ahora" (útil si te suena
  // y necesitas unos minutos más). Las 2 últimas son para "mañana", una manteniendo
  // la hora original del recordatorio y otra a las 9:00 (fija).
  const buildQuickSnoozeDate = (
    option: "15min" | "1h" | "tomorrowSameTime" | "tomorrow9",
    originalReminderIso: string
  ): Date => {
    const now = new Date();
    if (option === "15min") {
      return new Date(now.getTime() + 15 * 60 * 1000);
    }
    if (option === "1h") {
      return new Date(now.getTime() + 60 * 60 * 1000);
    }
    if (option === "tomorrowSameTime") {
      const original = new Date(originalReminderIso);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(original.getHours(), original.getMinutes(), 0, 0);
      // Si la hora original era 00:00 (recordatorio sin hora explícita),
      // ponemos las 9:00 por defecto en lugar de medianoche.
      if (original.getHours() === 0 && original.getMinutes() === 0) {
        tomorrow.setHours(9, 0, 0, 0);
      }
      return tomorrow;
    }
    // tomorrow9
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  };

  // Abre el dialog "Otra hora...". Si el recordatorio ya venció, propone HOY
  // (no el día viejo del recordatorio); si aún no ha llegado, su propia fecha y hora.
  const openCustomSnooze = (reminderId: string, contactName: string, currentIso: string) => {
    setCustomSnooze({ reminderId, contactName, ...propuestaPosponer(currentIso) });
  };

  const confirmCustomSnooze = async () => {
    if (!customSnooze) return;
    const { reminderId, contactName, date, time } = customSnooze;
    if (!date || !time) {
      toast.error("Indica fecha y hora");
      return;
    }
    // Construimos la fecha como local (sin Z) — el hook ya la guarda como naive local.
    const newDate = new Date(`${date}T${time}:00`);
    if (isNaN(newDate.getTime())) {
      toast.error("Fecha u hora no válidas");
      return;
    }
    setCustomSnooze(null);
    await handleSnooze(reminderId, contactName, newDate);
  };

  const handleRellamadaCompletada = async (contactId: number, contactName: string) => {
    await quitarRellamar(contactId);
    toast.success(`Rellamada completada para ${contactName}`);
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    const fecha = d.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    // Solo añadimos la hora si NO es medianoche (los recordatorios viejos sin
    // hora explícita se guardan como 00:00 y se siguen mostrando solo como fecha).
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    if (!hasTime) return fecha;
    const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${fecha} · ${hora}`;
  };

  const daysUntil = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const renderRellamadaConFecha = (contact: typeof contacts[0], fechaRellamada: string) => (
    <Card key={`rellamada-${contact.id}`} className="p-4 border-l-4 border-l-gray-300 bg-white hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button
              onClick={() => onViewContact?.(contact.id)}
              className="text-left hover:text-blue-600 transition-colors flex items-center gap-1 group-hover:underline"
            >
              <h3 className="font-display font-bold text-lg text-foreground">{contact.nombre}</h3>
              <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
            <Badge className="bg-gray-100 text-gray-700 font-semibold hover:bg-gray-100">📞 Rellamada</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div className="bg-white/50 p-3 rounded border border-gray-200">
              <p className="text-xs text-muted-foreground font-semibold">Fecha programada</p>
              <p className="font-bold text-foreground mt-1">
                {new Date(fechaRellamada + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <div className="bg-white/50 p-3 rounded border border-gray-200">
              <p className="text-xs text-muted-foreground font-semibold">Teléfono</p>
              <p className="font-bold text-foreground mt-1">{contact.telefono}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const phone = contact.telefono.replace(/\D/g, "");
                const message = `¡Hola ${contact.nombre.split(' ')[0]}! Te rellamaba desde Thermomix. ¿Cómo estás?`;
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
              }}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </Button>
            <Button
              onClick={() => confirmarLlamada(contact.telefono)}
              className="gap-2 bg-white border border-green-300 text-green-700 hover:bg-green-50"
              size="sm"
            >
              <Phone className="w-4 h-4" />
              Llamar
            </Button>
            <Button
              onClick={() => handleRellamadaCompletada(contact.id, contact.nombre)}
              className="gap-2 bg-gray-600 hover:bg-gray-700 text-white"
              size="sm"
            >
              <CheckCircle className="w-4 h-4" />
              ✓ Completada
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );

  const renderReminders = (reminders: typeof overdueReminders, showDays = true) => {
    if (reminders.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No hay recordatorios en esta categoría</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {reminders.map((reminder) => (
          <Card key={reminder.id} className={`p-4 hover:shadow-md transition-shadow border-l-4 group bg-white ${
            (() => { const d = new Date(reminder.nextReminder); d.setHours(0, 0, 0, 0); return d < today; })()
              ? "border-l-red-500" : "border-l-gray-300"
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <button
                    onClick={() => onViewContact?.(reminder.contactId)}
                    className="text-left hover:text-blue-600 transition-colors flex items-center gap-1 group-hover:underline"
                  >
                    <h3 className="font-display font-bold text-lg text-foreground">{nombreDe(reminder)}</h3>
                    <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </button>
                  {(() => {
                    // La etiqueta sale de la fecha de cada uno (en Mañanas/Tardes se mezclan).
                    const dia = new Date(reminder.nextReminder);
                    dia.setHours(0, 0, 0, 0);
                    const cuando = dia < today ? "vencido" : dia.getTime() === today.getTime() ? "hoy" : "proximo";
                    return (
                      <Badge variant={cuando === "vencido" ? "destructive" : cuando === "hoy" ? "default" : "secondary"}>
                        {cuando === "vencido" ? "Vencido" : cuando === "hoy" ? "Hoy" : "Próximo"}
                      </Badge>
                    );
                  })()}
                  {reminder.type === "demo" && (
                    <Badge className="bg-gray-100 text-gray-700 font-semibold hover:bg-gray-100">📱 DEMO</Badge>
                  )}
                  {reminder.type === "bienvenida" && (
                    <Badge className="bg-gray-100 text-gray-700 font-semibold hover:bg-gray-100">👋 Bienvenida</Badge>
                  )}
                  {reminder.type === "clase" && (
                    <Badge className="bg-gray-100 text-gray-700 font-semibold hover:bg-gray-100">🎓 Clase</Badge>
                  )}
                  {reminder.type === "reparacion" && (
                    <Badge className="bg-gray-100 text-gray-700 font-semibold hover:bg-gray-100">🔧 Reparación</Badge>
                  )}
                  {reminder.type === "seguimiento" && (
                    <Badge className="bg-gray-100 text-gray-700 font-semibold hover:bg-gray-100">📞 Seguimiento</Badge>
                  )}
                  {reminder.type === "promocion" && (
                    <Badge className="bg-gray-100 text-gray-700 font-semibold hover:bg-gray-100">🎁 Promoción</Badge>
                  )}
                  {reminder.type === "otro" && (
                    <Badge className="bg-gray-100 text-gray-700 font-semibold hover:bg-gray-100">⭐ Otro</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
                  <div className="bg-white/50 p-3 rounded border border-gray-200">
                    <p className="text-xs text-muted-foreground font-semibold">Acción</p>
                    <p className="font-bold text-foreground mt-1">
                      {reminder.type === "demo" ? "📱 DEMO" :
                       reminder.type === "bienvenida" ? "👋 Bienvenida" :
                       reminder.type === "clase" ? "🎓 Clase" :
                       reminder.type === "reparacion" ? "🔧 Reparación" :
                       reminder.type === "seguimiento" ? "📞 Seguimiento" :
                       reminder.type === "promocion" ? "🎁 Promoción" :
                       reminder.type === "otro" ? "⭐ Otro" :
                       "📞 Recordatorio"}
                    </p>
                  </div>
                  <div className="bg-white/50 p-3 rounded border border-gray-200">
                    <p className="text-xs text-muted-foreground font-semibold">{reminder.type !== "general" ? "Fecha Programada" : "Próximo Recordatorio"}</p>
                    <p className="font-bold text-foreground mt-1">{formatDate(reminder.nextReminder)}</p>
                  </div>
                  {reminder.type === "general" && (
                    <div className="bg-white/50 p-3 rounded border border-gray-200">
                      <p className="text-xs text-muted-foreground font-semibold">Frecuencia</p>
                      <p className="font-bold text-foreground mt-1">{reminder.frequency} días</p>
                    </div>
                  )}
                </div>

                {reminder.notes && (
                  <div className="bg-gray-50 p-3 rounded mb-3 border border-gray-200">
                    <p className="text-sm text-foreground">{reminder.notes}</p>
                  </div>
                )}
                {(() => {
                  // Lo último que pasó con esta persona: para saber por qué se vuelve a llamar.
                  const u = ultimaActividad(interacciones, reminder.contactId);
                  return (
                    <p className="text-sm text-muted-foreground mb-3">
                      <span className="font-semibold">🕘 Última vez:</span>{" "}
                      {u ? <>{u.cuando} · {u.tipo} · <span className="text-foreground">{u.texto}</span></> : "nunca contactada"}
                    </p>
                  );
                })()}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => {
                    // Si es un recordatorio de DEMO, abrir el modal para registrar el
                    // resultado (vendida/pendiente/seguimiento/no interesado) antes de
                    // marcarlo como completado. Para el resto, comportamiento habitual.
                    if (reminder.type === "demo") {
                      setDemoPendingComplete({
                        reminderId: reminder.id,
                        frequency: reminder.frequency,
                        contactId: reminder.contactId,
                        contactName: reminder.contactName,
                        reminderType: reminder.type,
                        reminderNotes: reminder.notes,
                      });
                    } else {
                      handleComplete(reminder.id, reminder.frequency, reminder.contactId, reminder.contactName, reminder.type, reminder.notes);
                    }
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                  size="sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  Completar
                </Button>
                {/* Posponer: abre un popover con 4 opciones rápidas + "Otra hora..." */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <AlarmClock className="w-4 h-4" />
                      Posponer
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="end">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-muted-foreground px-2 py-1 font-semibold">
                        Posponer hasta…
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start"
                        onClick={() =>
                          handleSnooze(
                            reminder.id,
                            reminder.contactName,
                            buildQuickSnoozeDate("15min", reminder.nextReminder)
                          )
                        }
                      >
                        +15 minutos
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start"
                        onClick={() =>
                          handleSnooze(
                            reminder.id,
                            reminder.contactName,
                            buildQuickSnoozeDate("1h", reminder.nextReminder)
                          )
                        }
                      >
                        +1 hora
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start"
                        onClick={() =>
                          handleSnooze(
                            reminder.id,
                            reminder.contactName,
                            buildQuickSnoozeDate("tomorrowSameTime", reminder.nextReminder)
                          )
                        }
                      >
                        Mañana misma hora
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start"
                        onClick={() =>
                          handleSnooze(
                            reminder.id,
                            reminder.contactName,
                            buildQuickSnoozeDate("tomorrow9", reminder.nextReminder)
                          )
                        }
                      >
                        Mañana 9:00
                      </Button>
                      <div className="border-t my-1" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start text-blue-600 hover:text-blue-700"
                        onClick={() =>
                          openCustomSnooze(reminder.id, reminder.contactName, reminder.nextReminder)
                        }
                      >
                        Otra hora…
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {/* Botón Google Calendar — solo para demo, bienvenida y clase */}
                {(reminder.type === "demo" || reminder.type === "bienvenida" || reminder.type === "clase") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 border-green-300 text-green-700 hover:bg-green-50"
                    title="Añadir a Google Calendar"
                    onClick={() => {
                      const nextDate = new Date(reminder.nextReminder);
                      const fecha = diaLocal(reminder.nextReminder);
                      const horaInicio = nextDate.getHours() !== 0 || nextDate.getMinutes() !== 0
                        ? `${nextDate.getHours().toString().padStart(2, "0")}:${nextDate.getMinutes().toString().padStart(2, "0")}`
                        : "10:00";
                      abrirEnGoogleCalendar({
                        tipo: reminder.type as TipoEvento,
                        contactoNombre: reminder.contactName,
                        fecha,
                        horaInicio,
                        notas: reminder.notes || undefined,
                      });
                    }}
                  >
                    <CalendarPlus className="w-4 h-4" />
                    <span className="hidden sm:inline">Google Cal</span>
                  </Button>
                )}
                <Button
                  onClick={() => handleDelete(reminder.id)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <CabeceraFormacion icono={IconoCabecera} titulo="Recordatorios" subtitulo="El seguimiento de tus contactos" />

      {/* Notificaciones push: tarjeta para activar/desactivar este dispositivo.
          Hay que tocar el botón en CADA dispositivo donde quieras recibir avisos
          (móvil + PC = dos clics, uno por sitio). */}
      <Card className="p-3 border-gray-200 bg-gray-50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              pushSubscribed ? "bg-gray-200 text-gray-600" : "bg-gray-100 text-gray-500"
            }`}>
              {pushSubscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground">Notificaciones en este dispositivo</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {pushPermission === "unsupported"
                  ? "Tu navegador no soporta notificaciones push. Prueba con Chrome o Edge actualizado."
                  : pushPermission === "denied"
                  ? "Los avisos están bloqueados. Actívalos desde los ajustes del navegador (icono del candado en la barra de direcciones)."
                  : pushSubscribed
                  ? "Activadas. Recibirás un aviso cuando un recordatorio venza."
                  : "Recibe un aviso en este dispositivo cuando un recordatorio venza, aunque la app esté cerrada."}
              </p>
              {pushError && (
                <p className="text-xs text-destructive mt-1">{pushError}</p>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            {pushPermission !== "unsupported" && (
              pushSubscribed ? (
                <Button
                  onClick={async () => {
                    await pushUnsubscribe();
                    toast.success("Notificaciones desactivadas en este dispositivo");
                  }}
                  variant="outline"
                  size="sm"
                  disabled={pushLoading}
                  className="gap-2"
                >
                  <BellOff className="w-4 h-4" />
                  {pushLoading ? "..." : "Desactivar"}
                </Button>
              ) : (
                <Button
                  onClick={async () => {
                    await pushSubscribe();
                    if (Notification.permission === "granted") {
                      toast.success("Notificaciones activadas en este dispositivo");
                    }
                  }}
                  size="sm"
                  disabled={pushLoading || pushPermission === "denied"}
                  className="gap-2"
                >
                  <Bell className="w-4 h-4" />
                  {pushLoading ? "..." : "Activar notificaciones"}
                </Button>
              )
            )}
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Vencidos</p>
              <p className="font-display text-3xl font-bold text-destructive mt-2">{overdueReminders.length + rellamadasVencidas.length}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-destructive/50" />
          </div>
        </Card>

        <Card className="p-6 bg-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Para Hoy</p>
              <p className="font-display text-3xl font-bold text-gray-700 mt-2">{pendingReminders.length + rellamadasHoy.length}</p>
            </div>
            <Clock className="w-8 h-8 text-gray-300" />
          </div>
        </Card>

        <Card className="p-6 bg-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Próximos 7 días</p>
              <p className="font-display text-3xl font-bold text-gray-700 mt-2">{upcomingReminders.length + rellamadasProximas.length}</p>
            </div>
            <Clock className="w-8 h-8 text-gray-300" />
          </div>
        </Card>

        <Card className="p-6 bg-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Más adelante</p>
              <p className="font-display text-3xl font-bold text-gray-700 mt-2">{laterReminders.length + rellamadasLejanas.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Día 8 a 90</p>
            </div>
            <Clock className="w-8 h-8 text-gray-300" />
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("overdue")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "overdue"
              ? "text-destructive border-b-2 border-destructive"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Vencidos ({overdueReminders.length + rellamadasVencidas.length})
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "pending"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Para Hoy ({pendingReminders.length + rellamadasHoy.length})
        </button>
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "upcoming"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Próximos 7 días ({upcomingReminders.length + rellamadasProximas.length})
        </button>
        <button
          onClick={() => setActiveTab("later")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "later"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Más adelante ({laterReminders.length + rellamadasLejanas.length})
        </button>
        <button
          onClick={() => setActiveTab("rellamadas")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "rellamadas"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Para Rellamar ({paraRellamar.length})
        </button>
        <button
          onClick={() => setActiveTab("mananas")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "mananas"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Vencidos y de hoy para llamar por la mañana (antes de las 15:00)"
        >
          ☀️ Mañanas ({remMananas.length + rellamadasYaToca.length})
        </button>
        <button
          onClick={() => setActiveTab("tardes")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "tardes"
              ? "text-violet-600 border-b-2 border-violet-600"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Vencidos y de hoy para llamar por la tarde (desde las 15:00 o si la nota dice 'tarde')"
        >
          🌙 Tardes ({remTardes.length + rellamadasYaToca.length})
        </button>
      </div>

      {/* Content */}
      <div>
        {activeTab === "overdue" && (
          <div className="space-y-3">
            {overdueReminders.length === 0 && rellamadasVencidas.length === 0
              ? <div className="text-center py-12"><p className="text-muted-foreground">No hay recordatorios en esta categoría</p></div>
              : <>{renderReminders(overdueReminders)}{rellamadasVencidas.map(r => renderRellamadaConFecha(r.contact, r.fecha_rellamada))}</>
            }
          </div>
        )}
        {activeTab === "pending" && (
          <div className="space-y-3">
            {pendingReminders.length === 0 && rellamadasHoy.length === 0
              ? <div className="text-center py-12"><p className="text-muted-foreground">No hay recordatorios en esta categoría</p></div>
              : <>{renderReminders(pendingReminders)}{rellamadasHoy.map(r => renderRellamadaConFecha(r.contact, r.fecha_rellamada))}</>
            }
          </div>
        )}
        {activeTab === "upcoming" && (
          <div className="space-y-3">
            {upcomingReminders.length === 0 && rellamadasProximas.length === 0
              ? <div className="text-center py-12"><p className="text-muted-foreground">No hay recordatorios en esta categoría</p></div>
              : <>{renderReminders(upcomingReminders)}{rellamadasProximas.map(r => renderRellamadaConFecha(r.contact, r.fecha_rellamada))}</>
            }
          </div>
        )}
        {activeTab === "later" && (
          <div className="space-y-3">
            {laterReminders.length === 0 && rellamadasLejanas.length === 0
              ? <div className="text-center py-12"><p className="text-muted-foreground">No hay recordatorios programados entre el día 8 y los próximos 90 días</p></div>
              : <>{renderReminders(laterReminders)}{rellamadasLejanas.map(r => renderRellamadaConFecha(r.contact, r.fecha_rellamada))}</>
            }
          </div>
        )}
        {(activeTab === "mananas" || activeTab === "tardes") && (() => {
          const lista = activeTab === "mananas" ? remMananas : remTardes;
          return (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {activeTab === "mananas"
                  ? "Para llamar por la mañana: vencidos y de hoy con hora antes de las 15:00, ordenados por hora."
                  : "Para llamar por la tarde: vencidos y de hoy desde las 15:00 (o con \"tarde\" en la nota), ordenados por hora."}
                {" "}Los que no tienen hora salen en las dos.
              </p>
              {lista.length === 0 && rellamadasYaToca.length === 0
                ? <div className="text-center py-12"><p className="text-muted-foreground">No hay nada pendiente para esta parte del día</p></div>
                : <>{renderReminders(lista)}{rellamadasYaToca.map(r => renderRellamadaConFecha(r.contact, r.fecha_rellamada))}</>
              }
            </div>
          );
        })()}
        {activeTab === "rellamadas" && (
          <div className="space-y-3">
            {paraRellamar.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No hay contactos marcados para rellamar</p>
              </div>
            ) : (
              paraRellamar
                .map(contact => (
                  <Card key={contact.id} className="p-4 border-l-4 border-l-gray-300 bg-white hover:shadow-md transition-shadow group">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <button
                          onClick={() => onViewContact?.(contact.id)}
                          className="text-left hover:text-blue-600 transition-colors flex items-center gap-1 group-hover:underline"
                        >
                          <h3 className="font-display font-bold text-lg text-foreground">{contact.nombre}</h3>
                          <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </button>
                        <p className="text-sm text-muted-foreground mt-1">{contact.ubicacion}</p>
                        <p className="text-sm text-muted-foreground mt-1">Tel: {contact.telefono}</p>
                        <div className="flex gap-2 mt-4">
                          <Button
                            onClick={() => {
                              const phone = contact.telefono.replace(/\D/g, "");
                              const message = `¡Hola ${contact.nombre.split(' ')[0]}! Te rellamaba desde Thermomix. ¿Cómo estás?`;
                              const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
                              window.open(url, "_blank");
                            }}
                            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                          >
                            <MessageCircle className="w-4 h-4" />
                            WhatsApp
                          </Button>
                          <Button
                            onClick={() => confirmarLlamada(contact.telefono)}
                            className="gap-2 bg-white border border-green-300 text-green-700 hover:bg-green-50"
                            size="sm"
                          >
                            <Phone className="w-4 h-4" />
                            Llamar
                          </Button>
                          <Button
                            onClick={() => handleRellamadaCompletada(contact.id, contact.nombre)}
                            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                          >
                            <CheckCircle className="w-4 h-4" />
                            ✓ Completada
                          </Button>
                        </div>
                      </div>
                      <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Para Rellamar</Badge>
                    </div>
                  </Card>
                ))
            )}
          </div>
        )}
      </div>

      {/* ModalDemo para completar recordatorios de tipo DEMO con resultado */}
      {demoPendingComplete && (
        <ModalDemo
          contactoId={demoPendingComplete.contactId}
          contactoNombre={demoPendingComplete.contactName}
          onClose={(wasSaved) => {
            const pending = demoPendingComplete;
            setDemoPendingComplete(null);
            // Solo marcamos el recordatorio como completado si el usuario guardó el resultado.
            // Si canceló/cerró sin guardar, el recordatorio permanece pendiente.
            if (wasSaved && pending) {
              handleComplete(
                pending.reminderId,
                pending.frequency,
                pending.contactId,
                pending.contactName,
                pending.reminderType,
                pending.reminderNotes
              );
            }
          }}
        />
      )}

      {/* Dialog "Otra hora..." para snooze personalizado */}
      <Dialog open={!!customSnooze} onOpenChange={(open) => { if (!open) setCustomSnooze(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Posponer recordatorio</DialogTitle>
          </DialogHeader>
          {customSnooze && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Recordatorio de <span className="font-semibold text-foreground">{customSnooze.contactName}</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="snooze-date">Fecha</Label>
                  <Input
                    id="snooze-date"
                    type="date"
                    value={customSnooze.date}
                    min={diaLocal(new Date().toISOString())}
                    onChange={(e) => setCustomSnooze({ ...customSnooze, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snooze-time">Hora</Label>
                  <Input
                    id="snooze-time"
                    type="time"
                    value={customSnooze.time}
                    onChange={(e) => setCustomSnooze({ ...customSnooze, time: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomSnooze(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmCustomSnooze} className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
              <AlarmClock className="w-4 h-4" />
              Posponer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Total Stats */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10">
        <h3 className="font-display font-bold text-lg text-foreground mb-4">Resumen General</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            {/* "Total" aquí significa pendientes/activos: al completar uno, baja.
                Mantenemos el nombre que usa la usuaria. */}
            <p className="text-xs text-muted-foreground">Total de Recordatorios</p>
            <p className="font-display text-2xl font-bold text-primary mt-1">
              {reminders.filter((r) => r.status === "pending").length}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Completados</p>
            <p className="font-display text-2xl font-bold text-green-600 mt-1">
              {reminders.filter((r) => r.status === "completed").length}
            </p>
          </div>
          <div>
            {/* Tasa de cumplimiento se calcula sobre el histórico total
                (pendientes + completados), no sobre el contador de "Total" de
                arriba — si no, daría 0 % cuando completas todo. */}
            <p className="text-xs text-muted-foreground">Tasa de Cumplimiento</p>
            <p className="font-display text-2xl font-bold text-blue-600 mt-1">
              {reminders.length > 0
                ? Math.round(
                    (reminders.filter((r) => r.status === "completed").length / reminders.length) * 100
                  )
                : 0}
              %
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
