import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Phone, MessageCircle, ArrowLeft, Plus, Trash2, Edit2, CheckCircle, X, Clock, CalendarDays, Award, ShoppingBag, CalendarPlus, User, BarChart3, FileText } from "lucide-react";
import { type Contact } from "@/data/contacts";
import { isZonaPlaya } from "@/utils/zonaPlaya";
import { abrirEnGoogleCalendar, type TipoEvento } from "@/utils/googleCalendar";
import { useRellamar } from "@/hooks/useRellamar";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { useContacts } from "@/hooks/useContacts";
import { useContactNotes } from "@/hooks/useContactNotes";
import { useReminders } from "@/hooks/useReminders";
import { useSupabaseDemos } from "@/hooks/useSupabaseDemos";
import { useSupabaseVentas } from "@/hooks/useSupabaseVentas";
import { useDemos } from "@/hooks/useDemos";
import { diasSinContactoDe } from "@/lib/proximosClientes";
import { TMX, TituloSeccion, Recuadro } from "@/components/EstiloFormacion";
import { ETAPAS_VENTA, ETAPA_QUIERE_ENTRAR, FUERA_DEL_EMBUDO, enEmbudo } from "@/lib/embudo";
import RecomendadaPor from "@/components/RecomendadaPor";
import { toast } from "sonner";
import { confirmarLlamada } from "@/lib/callDialog";
import ContactDialog from "@/components/ContactDialog";
import TemplateSelector from "@/components/TemplateSelector";
import ModalDemo from "@/components/ModalDemo";
import HistorialFicha from "@/components/HistorialFicha";

interface DetalleContactoProps {
  contactId: number;
  onBack: () => void;
}

export default function DetalleContacto({ contactId, onBack }: DetalleContactoProps) {
  const { contacts, updateContact: updateContactInDB } = useContacts();
  const contact = contacts.find((c) => c.id === contactId);
  const { getDiasDesdeUltimoContacto, addContacto } = useLlamadasGlobales();
  const { esRellamar, toggleRellamar, quitarRellamar } = useRellamar();
  const { notes, addNote, deleteNote, updateNote } = useContactNotes(contactId);
  const { reminders, addReminder, deleteReminder } = useReminders();
  const { getDemosPorContacto } = useSupabaseDemos();
  const { ventas } = useSupabaseVentas();
  const { demos } = useDemos();
  const comprasContacto = ventas
    .filter((v) => Number(v.contacto_id) === contactId)
    .sort((a, b) => b.fecha_venta.localeCompare(a.fecha_venta));
  const fechaCorta = (f: string) =>
    new Date(f.slice(0, 10) + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  // Histórico de demos de este contacto, ordenado por fecha descendente.
  // Parseamos el prefijo [Resultado] que ModalDemo guarda dentro de notas para
  // mostrarlo como etiqueta separada y dejar las notas limpias.
  const demosContacto = (() => {
    const lista = getDemosPorContacto(contactId) ?? [];
    return [...lista].sort((a, b) => (a.fecha_demo < b.fecha_demo ? 1 : -1)).map((d) => {
      const raw = d.notas ?? "";
      const match = raw.match(/^\[([^\]]+)\]\s?(.*)$/);
      const resultadoLabel = match ? match[1] : null;
      const notasLimpias = match ? match[2] : raw;
      return { ...d, resultadoLabel, notasLimpias };
    });
  })();
  // Estilos de badge según el resultado parseado.
  const badgeClassForResultado = (label: string | null): string => {
    if (!label) return "bg-gray-100 text-gray-600 border-gray-200";
    if (label.startsWith("Venta cerrada")) return "bg-green-100 text-green-700 border-green-200";
    if (label.startsWith("Pendiente")) return "bg-amber-100 text-amber-700 border-amber-200";
    if (label.startsWith("Requiere seguimiento")) return "bg-blue-100 text-blue-700 border-blue-200";
    if (label.startsWith("No interesado")) return "bg-gray-100 text-gray-600 border-gray-200";
    return "bg-purple-100 text-purple-700 border-purple-200";
  };
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [reminderFrequency, setReminderFrequency] = useState(7);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  // Hora del recordatorio (HH:MM). Si está vacío, se guarda sin hora específica
  // (compatibilidad hacia atrás: se interpreta como recordatorio "del día").
  const [scheduledTime, setScheduledTime] = useState<string>(() => {
    const now = new Date();
    let hour = now.getHours() + 1;
    if (hour >= 22 || hour < 8) hour = 10; // de noche → 10:00 por defecto
    return `${hour.toString().padStart(2, "0")}:00`;
  });
  const [reminderType, setReminderType] = useState<"general" | "demo" | "bienvenida" | "clase" | "reparacion" | "seguimiento" | "promocion" | "otro">("general");
  const [reminderNotes, setReminderNotes] = useState("");
  const contactReminder = reminders.find((r) => r.contactId === contactId);
  const [showModalDemo, setShowModalDemo] = useState(false);
  const [editingZona, setEditingZona] = useState(false);
  const [selectedZona, setSelectedZona] = useState<boolean>(contact?.zonaPlaya ?? false);

  // Sincronizar cuando los datos de Supabase lleguen (carga asíncrona)
  useEffect(() => {
    if (contact) {
      setSelectedZona(contact.zonaPlaya ?? false);
    }
  }, [contact?.zonaPlaya]);
  // Evento GCal pendiente de añadir tras programar demo/bienvenida/clase
  const [gcalPendiente, setGcalPendiente] = useState<{ tipo: TipoEvento; fecha: string; hora: string; notas?: string } | null>(null);

  if (!contact) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Contacto no encontrado</p>
      </div>
    );
  }

  // Igual que en la Agenda y en "Mi día": cuentan también ventas, bienvenidas y demos.
  const diasSinContacto = contact ? diasSinContactoDe(contact, { ventas, demos, getDiasDesdeUltimoContacto }) : 999;
  const estadoContacto = () => {
    if (diasSinContacto === 0) return "Contactado hoy";
    if (diasSinContacto <= 7) return "Contactado esta semana";
    if (diasSinContacto <= 30) return "Contactado este mes";
    return "Urgente: " + diasSinContacto + " días sin contacto";
  };

  const handleMarkAsContacted = async () => {
    if (contact) {
      try {
        const now = new Date();
        await addNote("Contacto manual", "llamada", now);
        toast.success("Contacto registrado correctamente.");
      } catch {
        toast.error("Error al registrar el contacto");
      }
    }
  };

  const handleAddNote = () => {
    if (!newNote.trim()) {
      toast.error("Por favor escribe una nota");
      return;
    }
    addNote(newNote, "nota");
    setNewNote("");
    toast.success("Nota agregada");
  };

  const handleSaveEdit = (noteId: string) => {
    if (!editText.trim()) {
      toast.error("La nota no puede estar vacía");
      return;
    }
    updateNote(noteId, editText);
    setEditingId(null);
    toast.success("Nota actualizada");
  };

  const handleCall = async () => {
    const metodo = await confirmarLlamada(contact.telefono);
    if (metodo === "cancelado") return;
    addNote(`Llamada realizada`, "llamada");
    // Al llamar, quitar marca de rellamar automáticamente
    quitarRellamar(contactId);
  };

  // "Marcar para rellamar" = bandeja flotante de pendientes SIN fecha.
  // Si necesitas agendar con fecha+hora+aviso, usa el botón "Programar Otro"
  // (recordatorio tipo "otro") que es más completo (notifica + permite snooze).
  const handleRellamar = async () => {
    if (esRellamar(contactId)) {
      await toggleRellamar(contactId);
      toast.success("Marca de rellamar eliminada");
    } else {
      await toggleRellamar(contactId, null);
      toast.warning("Contacto marcado para rellamar 📞");
    }
  };

  const handleWhatsApp = () => {
    const phone = contact.telefono.replace(/[^\d+]/g, "");
    const message = `¡Hola ${contact.nombre.split(" ")[0]}! Te contacto desde Thermomix.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url);
    addNote(`Mensaje de WhatsApp enviado`, "whatsapp");
  };

  const handleSendTemplateViaWhatsApp = (message: string, imageData?: string) => {
    const phone = contact.telefono.replace(/[^\d+]/g, "");
    
    // Si hay imagen, primero la compartimos
    if (imageData) {
      // Convertir base64 a blob y crear URL
      const byteCharacters = atob(imageData.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      
      // Crear URL para compartir
      const url = URL.createObjectURL(blob);
      
      // Abrir WhatsApp con el mensaje
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl);
      
      // Limpiar URL
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      // Sin imagen, solo enviar texto
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(url);
    }
    
    addNote(`Plantilla de WhatsApp enviada`, "whatsapp");
  };

  const handleAddReminder = () => {
    if (contactReminder) {
      toast.error("Este contacto ya tiene un recordatorio");
      return;
    }
    // Construimos el ISO timestamp combinando fecha + hora cuando existan.
    // Reglas:
    //   - reminderType === "general": fecha = hoy + frecuencia días, a la hora seleccionada.
    //   - resto de tipos: la fecha la elige el usuario (scheduledDate). Si además
    //     hay scheduledTime, se aplica esa hora; si no, queda como "T00:00:00" (legacy).
    let scheduledIso: string | undefined;
    if (reminderType !== "general") {
      if (scheduledDate) {
        scheduledIso = scheduledTime
          ? `${scheduledDate}T${scheduledTime}:00`
          : scheduledDate;
      }
    } else if (scheduledTime) {
      // tipo "general": calculamos la fecha objetivo a partir de la frecuencia
      // y le aplicamos la hora elegida. Esto da una "primera hora" sensata.
      const target = new Date();
      target.setDate(target.getDate() + reminderFrequency);
      const yyyy = target.getFullYear();
      const mm = (target.getMonth() + 1).toString().padStart(2, "0");
      const dd = target.getDate().toString().padStart(2, "0");
      scheduledIso = `${yyyy}-${mm}-${dd}T${scheduledTime}:00`;
    }
    addReminder(contactId, contact!.nombre, reminderFrequency, reminderType, scheduledIso, reminderNotes || undefined);

    // Si es demo/bienvenida/clase, guardar datos para ofrecer el botón de Google Calendar
    if (reminderType === "demo" || reminderType === "bienvenida" || reminderType === "clase") {
      const fechaGcal = scheduledDate || new Date().toISOString().split("T")[0];
      setGcalPendiente({
        tipo: reminderType as TipoEvento,
        fecha: fechaGcal,
        hora: scheduledTime || "10:00",
        notas: reminderNotes || undefined,
      });
    } else {
      setGcalPendiente(null);
    }

    setShowReminderForm(false);
    setReminderFrequency(7);
    setScheduledDate("");
    setReminderType("general");
    setReminderNotes("");
    const tipoTexto =
      reminderType === "demo" ? "DEMO" :
      reminderType === "bienvenida" ? "Bienvenida" :
      reminderType === "clase" ? "Clase" :
      reminderType === "reparacion" ? "Reparación" :
      reminderType === "seguimiento" ? "Seguimiento" :
      reminderType === "promocion" ? "Promoción" :
      reminderType === "otro" ? "Otro" :
      "Recordatorio";
    toast.success(`${tipoTexto} programado correctamente`);
  };

  const handleScheduleReminder = (type: "demo" | "bienvenida" | "clase" | "reparacion" | "seguimiento" | "promocion" | "otro") => {
    if (contactReminder) {
      toast.error("Este contacto ya tiene un recordatorio programado. Bórralo antes de crear uno nuevo.");
      // Scroll a la tarjeta de Recordatorio para que vea el existente
      setTimeout(() => {
        const el = document.getElementById("recordatorio-card");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setReminderType(type);
    setShowReminderForm(true);
    // Scroll automático a la tarjeta de Recordatorio para que la usuaria vea el selector de fecha
    setTimeout(() => {
      const el = document.getElementById("recordatorio-card");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const handleDeleteReminder = () => {
    if (contactReminder) {
      deleteReminder(contactReminder.id);
      toast.success("Recordatorio eliminado");
    }
  };

  const handleSaveContact = async (data: Omit<Contact, "id">) => {
    try {
      await updateContactInDB({ ...data, id: contactId });
      toast.success("Contacto actualizado correctamente");
      setShowEditDialog(false);
    } catch (error) {
      toast.error("Error al actualizar contacto");
    }
  };

  return (
    <div className="space-y-6 p-8">
      <ContactDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        contact={contact}
        onSave={handleSaveContact}
      />

      <TemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        contactName={contact.nombre}
        contactPhone={contact.telefono}
        contactModel={contact.modelo}
        onSendViaWhatsApp={handleSendTemplateViaWhatsApp}
      />

      {/* Header: en el móvil el nombre va debajo de los botones */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Button
          onClick={onBack}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>
        <div className="order-last basis-full sm:order-none sm:basis-0 sm:flex-1 flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex h-12 w-12 shrink-0 rounded-full items-center justify-center text-white text-lg font-display font-medium" style={{ backgroundColor: TMX.naranja }}>
            {contact.nombre.replace(/[^\p{L}]/gu, "").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-medium text-gray-700">{contact.nombre}</h1>
            <p className="font-medium mt-1" style={{ color: TMX.verde }}>{contact.ubicacion}</p>
          </div>
        </div>
        <Button
          onClick={() => setShowEditDialog(true)}
          variant="outline"
          size="sm"
          className="gap-2 ml-auto sm:ml-0 border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          <Edit2 className="w-4 h-4" />
          Editar Contacto
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Información del Contacto */}
        <div className="md:col-span-1 space-y-4">
          <Recuadro color={TMX.verde} className="!p-6">
            <TituloSeccion color={TMX.verde} icono={User} className="mb-4">Información</TituloSeccion>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Teléfono</p>
                <p className="font-medium text-foreground">{contact.telefono}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Modelo</p>
                <span className="inline-block px-3 py-1 bg-primary/20 text-primary text-sm font-medium rounded">
                  {contact.modelo?.startsWith("⭐") ? contact.modelo : contact.modelo}
                </span>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Intereses</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {contact.intereses.map((interes) => (
                    <span
                      key={interes}
                      className="px-2 py-1 bg-accent/20 text-accent text-xs rounded"
                    >
                      {interes}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Notas Generales</p>
                <p className="text-sm text-foreground mt-1">{contact.notas}</p>
              </div>

              {/* Embudo: en qué paso está (lib/embudo.ts) */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Embudo</p>
                <select
                  value={enEmbudo(contact.estado_lead) ? contact.estado_lead ?? "" : ""}
                  onChange={async (e) => {
                    try {
                      await updateContactInDB({ ...contact, estado_lead: e.target.value || FUERA_DEL_EMBUDO });
                      toast.success(e.target.value ? "Paso del embudo guardado ✓" : "Fuera del embudo");
                    } catch {
                      toast.error("No se pudo guardar el embudo");
                    }
                  }}
                  className="w-full px-2 py-1.5 border border-input rounded-md bg-background text-sm"
                >
                  <option value="">— No está en el embudo —</option>
                  <optgroup label="Ventas">
                    {ETAPAS_VENTA.map((etapa) => (
                      <option key={etapa.id} value={etapa.id}>{etapa.emoji} {etapa.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Reclutas">
                    <option value={ETAPA_QUIERE_ENTRAR.id}>{ETAPA_QUIERE_ENTRAR.emoji} {ETAPA_QUIERE_ENTRAR.label} (ganarse la máquina)</option>
                  </optgroup>
                </select>
              </div>

              {/* Quién la recomendó y a quién ha recomendado */}
              <RecomendadaPor
                contact={contact}
                contacts={contacts}
                onGuardar={async (id) => {
                  try {
                    await updateContactInDB({ ...contact, recomendada_por: id });
                    toast.success(id ? "Recomendación apuntada ✓" : "Recomendación quitada");
                  } catch {
                    toast.error("No se pudo guardar la recomendación");
                  }
                }}
              />

              {/* Mi zona - Editable */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Zona</p>
                {editingZona ? (
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const updatedContact = { ...contact, zonaPlaya: true };
                          await updateContactInDB(updatedContact);
                          setSelectedZona(true);
                          setEditingZona(false);
                          toast.success("Zona actualizada a Playa ✓");
                        } catch (e) {
                          toast.error("Error al guardar la zona");
                        }
                      }}
                      className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full hover:bg-blue-200 transition-colors"
                    >
                      📍 Mi zona
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const updatedContact = { ...contact, zonaPlaya: false };
                          await updateContactInDB(updatedContact);
                          setSelectedZona(false);
                          setEditingZona(false);
                          toast.success("Zona actualizada a Barcelona/Interior ✓");
                        } catch (e) {
                          toast.error("Error al guardar la zona");
                        }
                      }}
                      className="px-3 py-1 bg-gray-100 text-gray-500 text-sm font-semibold rounded-full hover:bg-gray-200 transition-colors"
                    >
                      🗺️ Otra zona
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingZona(true)}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold transition-colors cursor-pointer hover:opacity-80"
                    style={{
                      backgroundColor: selectedZona ? "#dbeafe" : "#f3f4f6",
                      color: selectedZona ? "#1e40af" : "#6b7280"
                    }}
                  >
                    {selectedZona ? "📍 Mi zona" : "🗺️ Otra zona"}
                    <Edit2 className="w-3 h-3 ml-1" />
                  </button>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 mt-6">
              <Button
                onClick={handleMarkAsContacted}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <CheckCircle className="w-4 h-4" />
                Marcar como contactado
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={handleCall}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                  size="sm"
                >
                  <Phone className="w-4 h-4" />
                  Llamar
                </Button>
                <Button
                  onClick={handleWhatsApp}
                  className="flex-1 bg-white border border-green-300 hover:bg-green-50 text-green-700 gap-2"
                  size="sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </Button>
              </div>
              {/* Botón Rellamar sincronizado */}
              <Button
                onClick={handleRellamar}
                className={`w-full gap-2 font-bold ${
                  esRellamar(contactId)
                    ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                    : "bg-white border border-gray-300 hover:bg-gray-50 text-gray-700"
                }`}
                size="sm"
              >
                📞 {esRellamar(contactId) ? "Quitar rellamar" : "Marcar para rellamar"}
              </Button>

              <Button
                onClick={() => setShowTemplateSelector(true)}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <MessageCircle className="w-4 h-4" />
                Enviar Plantilla
              </Button>
              <Button
                onClick={() => setShowModalDemo(true)}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <Award className="w-4 h-4" />
                Registrar Demo
              </Button>
            </div>
          </Recuadro>

          {/* Compras (tabla ventas) */}
          {comprasContacto.length > 0 && (
            <Recuadro color={TMX.naranja} className="!p-6">
              <TituloSeccion color={TMX.naranja} icono={ShoppingBag} className="mb-3">Compras</TituloSeccion>
              <div className="space-y-3">
                {comprasContacto.map((v) => (
                  <div key={v.id} className="text-sm">
                    <p className="font-semibold">{v.modelo} · {fechaCorta(v.fecha_venta)}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.bienvenida_realizada
                        ? `Bienvenida hecha${v.fecha_bienvenida ? ` el ${fechaCorta(v.fecha_bienvenida)}` : ""}`
                        : v.fecha_bienvenida ? `Bienvenida el ${fechaCorta(v.fecha_bienvenida)}` : "Bienvenida pendiente"}
                    </p>
                    {v.notas && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{v.notas}</p>}
                  </div>
                ))}
              </div>
            </Recuadro>
          )}

          {/* Estadísticas */}
          <Recuadro color={TMX.azul} className="!p-6">
            <TituloSeccion color={TMX.azul} icono={BarChart3} className="mb-4">Estadísticas</TituloSeccion>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Días sin contacto</span>
                <span className="font-bold text-lg text-primary">{diasSinContacto}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Estado</span>
                <span className={`font-bold text-sm ${diasSinContacto > 30 ? 'text-red-500' : diasSinContacto > 7 ? 'text-orange-500' : 'text-green-500'}`}>{estadoContacto()}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Total de notas</span>
                <span className="font-bold text-primary">{notes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Llamadas</span>
                <span className="font-bold">{notes.filter((n) => n.type === "llamada").length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">WhatsApp</span>
                <span className="font-bold text-green-600">{notes.filter((n) => n.type === "whatsapp").length}</span>
              </div>
            </div>
          </Recuadro>

          {/* Histórico de demos */}
          {demosContacto.length > 0 && (
            <Card className="p-6 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                  <Award className="w-4 h-4 text-purple-600" />
                  Histórico de demos
                </h3>
                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                  {demosContacto.length}
                </span>
              </div>
              <div className="space-y-3">
                {demosContacto.map((d) => (
                  <div key={d.id} className="bg-white/70 border border-purple-100 rounded-lg p-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <p className="text-sm font-medium text-foreground">
                        {new Date(d.fecha_demo + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                      {d.resultadoLabel && (
                        <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${badgeClassForResultado(d.resultadoLabel)}`}>
                          {d.resultadoLabel}
                        </span>
                      )}
                    </div>
                    {d.notasLimpias && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{d.notasLimpias}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recordatorios */}
          <Card id="recordatorio-card" className="p-6 border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Recordatorio
              </h3>
              {contactReminder && (
                <span className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded-full">
                  Pendiente
                </span>
              )}
            </div>

            {!contactReminder ? (
              <div className="space-y-3">
                {!showReminderForm ? (
                  <Button
                    onClick={() => setShowReminderForm(true)}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                    size="sm"
                  >
                    <Plus className="w-4 h-4" />
                    Crear Recordatorio
                  </Button>
                ) : (
                  <div className="space-y-3">
                    {reminderType !== "general" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Fecha programada</label>
                          <input
                            type="date"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            className="w-full px-3 py-2 border border-input rounded-md mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Hora</label>
                          <input
                            type="time"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="w-full px-3 py-2 border border-input rounded-md mt-1"
                          />
                        </div>
                      </div>
                    )}
                    {reminderType === "general" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Frecuencia (días)</label>
                          <input
                            type="number"
                            min="1"
                            max="90"
                            value={reminderFrequency}
                            onChange={(e) => setReminderFrequency(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-input rounded-md mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Hora</label>
                          <input
                            type="time"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="w-full px-3 py-2 border border-input rounded-md mt-1"
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-muted-foreground">Anotación (opcional)</label>
                      <textarea
                        value={reminderNotes}
                        onChange={(e) => setReminderNotes(e.target.value)}
                        placeholder="Añade una nota..."
                        rows={2}
                        className="w-full px-3 py-2 border border-input rounded-md mt-1 text-sm resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleAddReminder}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                        size="sm"
                      >
                        Guardar
                      </Button>
                      <Button
                        onClick={() => {
                          setShowReminderForm(false);
                          setReminderType("general");
                          setScheduledDate("");
                          setReminderNotes("");
                        }}
                        variant="outline"
                        className="flex-1"
                        size="sm"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Próximo recordatorio</p>
                  <p className="font-medium text-foreground">
                    {(() => {
                      const d = new Date(contactReminder.nextReminder);
                      const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
                      const fechaStr = d.toLocaleDateString("es-ES");
                      return hasTime
                        ? `${fechaStr} · ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
                        : fechaStr;
                    })()}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Cada</p>
                  <p className="font-medium text-foreground">{contactReminder.frequency} días</p>
                </div>
                <Button
                  onClick={handleDeleteReminder}
                  variant="ghost"
                  className="w-full text-destructive hover:bg-destructive/10"
                  size="sm"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Recordatorio
                </Button>
              </div>
            )}
          </Card>

          {/* Banner Google Calendar — aparece tras programar demo/bienvenida/clase */}
          {gcalPendiente && (
            <div className="rounded-lg border border-green-200 bg-green-50/60 p-4 space-y-2">
              <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                <CalendarPlus size={14} /> ¿Añadir a Google Calendar?
              </p>
              <p className="text-xs text-green-700">
                Tu recordatorio está guardado en la app. También puedes añadirlo a tu Google Calendar para recibir el aviso en el móvil.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-green-400 text-green-800 hover:bg-green-100 gap-1 text-xs"
                  onClick={() => {
                    abrirEnGoogleCalendar({
                      tipo: gcalPendiente.tipo,
                      contactoNombre: contact!.nombre,
                      fecha: gcalPendiente.fecha,
                      horaInicio: gcalPendiente.hora,
                      notas: gcalPendiente.notas,
                    });
                  }}
                >
                  <CalendarPlus size={13} /> Abrir en Google Calendar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() => setGcalPendiente(null)}
                >
                  Ahora no
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Anotaciones */}
        <div className="md:col-span-2 space-y-4">
          {/* Programar recordatorio - acceso rápido sin scroll (movido desde la Card de Información) */}
          <Recuadro color={TMX.naranja} className="!p-6">
            <TituloSeccion color={TMX.naranja} icono={CalendarDays} className="mb-4">Programar recordatorio</TituloSeccion>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              <Button
                onClick={() => handleScheduleReminder("demo")}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <CalendarDays className="w-4 h-4" />
                DEMO
              </Button>
              <Button
                onClick={() => handleScheduleReminder("bienvenida")}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <CalendarDays className="w-4 h-4" />
                Bienvenida
              </Button>
              <Button
                onClick={() => handleScheduleReminder("clase")}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <CalendarDays className="w-4 h-4" />
                Clase
              </Button>
              <Button
                onClick={() => handleScheduleReminder("reparacion")}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <CalendarDays className="w-4 h-4" />
                Reparación
              </Button>
              <Button
                onClick={() => handleScheduleReminder("seguimiento")}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <CalendarDays className="w-4 h-4" />
                Seguimiento
              </Button>
              <Button
                onClick={() => handleScheduleReminder("promocion")}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <CalendarDays className="w-4 h-4" />
                Promoción
              </Button>
              <Button
                onClick={() => handleScheduleReminder("otro")}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 gap-2"
                size="sm"
              >
                <CalendarDays className="w-4 h-4" />
                Otro
              </Button>
            </div>
          </Recuadro>

          <HistorialFicha contactId={contactId} />

          <Recuadro color={TMX.azul} className="!p-6">
            <TituloSeccion color={TMX.azul} icono={FileText} className="mb-4">Anotaciones</TituloSeccion>

            {/* Agregar Nueva Nota */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-foreground mb-2">
                Agregar nota
              </label>
              <Textarea
                placeholder="Escribe una nota sobre este contacto..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="mb-3 min-h-24"
              />
              <Button
                onClick={handleAddNote}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              >
                <Plus className="w-4 h-4" />
                Agregar Nota
              </Button>
            </div>

            {/* Lista de Notas */}
            <div className="space-y-3">
              {notes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay notas aún. ¡Agrega una!
                </p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
                  >
                    {editingId === note.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="min-h-20"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleSaveEdit(note.id)}
                            size="sm"
                            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Guardar
                          </Button>
                          <Button
                            onClick={() => setEditingId(null)}
                            size="sm"
                            variant="outline"
                            className="gap-2"
                          >
                            <X className="w-4 h-4" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded ${
                                note.type === "llamada"
                                  ? "bg-primary/20 text-primary"
                                  : note.type === "whatsapp"
                                  ? "bg-green-100 text-green-700"
                                  : note.type === "difusion"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {note.type === "llamada"
                                ? "Llamada"
                                : note.type === "whatsapp"
                                ? "WhatsApp"
                                : note.type === "difusion"
                                ? "Difusión"
                                : "Nota"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(note.date).toLocaleDateString("es-ES", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                setEditingId(note.id);
                                setEditText(note.text);
                              }}
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:bg-blue-50"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => {
                                deleteNote(note.id);
                                toast.success("Nota eliminada");
                              }}
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-foreground text-sm">{note.text}</p>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </Recuadro>
        </div>
      </div>
      {showModalDemo && (
        <ModalDemo
          contactoId={contactId}
          contactoNombre={contact.nombre}
          onClose={() => setShowModalDemo(false)}
        />
      )}
    </div>
  );
}
