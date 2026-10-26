import { useState } from "react";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { useContacts } from "@/hooks/useContacts";
import { useRellamar } from "@/hooks/useRellamar";
import { Contact } from "@/data/contacts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, AlertCircle, Calendar, Phone, MessageCircle, FileText, CheckCircle2 } from "lucide-react";
import { loadRemindersFromSupabase } from "@/hooks/useReminders";
import { useSupabaseRecordatorios } from "@/hooks/useSupabaseRecordatorios";
import { toast } from "sonner";

interface ModalAnotacionProps {
  contactoId: number;
  contactoNombre: string;
  onClose: () => void;
}

export default function ModalAnotacion({
  contactoId,
  contactoNombre,
  onClose,
}: ModalAnotacionProps) {
  const { addContacto } = useLlamadasGlobales();
  const { updateContact: updateContactInDB, contacts } = useContacts();
  const { agregarRecordatorio } = useSupabaseRecordatorios();
  const { esRellamar, toggleRellamar } = useRellamar();

  const [isGuardando, setIsGuardando] = useState(false);
  const [contenido, setContenido] = useState("");
  const [tipoAnotacion, setTipoAnotacion] = useState<"nota" | "recordatorio">("nota");
  // El tipo "rellamar" se mantiene en el union para compatibilidad con datos
  // antiguos, pero ya no se ofrece como opción en la UI: en su lugar hay un
  // checkbox que marca el contacto en la lista de rellamar SIN dejar de
  // registrar la interacción real (llamada / whatsapp / nota).
  const [tipoContacto, setTipoContacto] = useState<"llamada" | "whatsapp" | "nota">("nota");
  // Checkbox "También marcar para rellamar". Si está marcado al guardar,
  // se añade el contacto a la lista de rellamar (si no estaba ya).
  const [marcarRellamar, setMarcarRellamar] = useState(false);
  const [recordatorioFecha, setRecordatorioFecha] = useState("");
  const [recordatorioTexto, setRecordatorioTexto] = useState("");
  const [fechaContacto, setFechaContacto] = useState(() => {
    const hoy = new Date();
    return hoy.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }); // formato YYYY-MM-DD
  });
  const [usarFechaPersonalizada, setUsarFechaPersonalizada] = useState(false);

  const handleGuardar = async () => {
    if (isGuardando) return;

    if (tipoAnotacion === "nota" && !contenido.trim()) {
      toast.error("Por favor escribe una anotación");
      return;
    }

    if (tipoAnotacion === "recordatorio" && (!recordatorioFecha || !recordatorioTexto.trim())) {
      toast.error("Por favor completa la fecha y texto del recordatorio");
      return;
    }

    setIsGuardando(true);
    try {
      if (tipoAnotacion === "nota") {
        const fechaFinal = usarFechaPersonalizada ? new Date(fechaContacto + "T12:00:00") : new Date();

        addContacto(contactoId, tipoContacto, contenido, fechaFinal);

        const contact = contacts.find((c) => Number(c.id) === Number(contactoId));
        if (contact) {
          updateContactInDB({
            ...contact,
            ultimoContacto: fechaFinal.toISOString(),
          });
        }

        if (marcarRellamar && !esRellamar(Number(contactoId))) {
          try {
            await toggleRellamar(Number(contactoId), null);
          } catch (e) {
            console.error("Error marcando rellamar:", e);
          }
        }

        const sufijoRellamar = marcarRellamar ? " · marcado para rellamar" : "";
        toast.success(`Guardado para ${contactoNombre}${sufijoRellamar}`);
      } else {
        const notas = contenido.trim() ? `${recordatorioTexto} — ${contenido.trim()}` : recordatorioTexto;
        await agregarRecordatorio({
          contacto_id: contactoId,
          contacto_nombre: contactoNombre,
          descripcion: notas,
          fecha: recordatorioFecha,
          completado: false,
          // Sin tipo, el aviso al móvil (get_due_reminders) no lo enviaría.
          tipo: "general",
        } as any);
        // Refrescar la caché de useReminders para que aparezca en la página de Recordatorios
        await loadRemindersFromSupabase();
        toast.success("Recordatorio programado");
      }

      onClose();
    } catch (error) {
      toast.error(`Error al guardar: ${error}`);
    } finally {
      setIsGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md overflow-hidden border-none shadow-2xl">
        {/* Header */}
        <div className="p-6 bg-gray-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="text-blue-400" size={20} />
            <h2 className="text-lg font-bold truncate">Anotación: {contactoNombre}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 bg-white max-h-[80vh] overflow-y-auto">
          {/* Selector de Tipo de Anotación */}
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setTipoAnotacion("nota")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tipoAnotacion === "nota" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
            >
              📝 NOTA / CONTACTO
            </button>
            <button
              onClick={() => setTipoAnotacion("recordatorio")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tipoAnotacion === "recordatorio" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
            >
              🔔 RECORDATORIO
            </button>
          </div>

          {tipoAnotacion === "nota" ? (
            <div className="space-y-5">
              {/* Tipo de Contacto: 3 opciones (Llamada / WhatsApp / Nota).
                  La marca de "rellamar" se gestiona aparte con un checkbox
                  para que pueda combinarse con cualquier tipo (p.ej.
                  "llamada + marcar para rellamar" cuando salta el contestador). */}
              <div className="grid grid-cols-3 gap-2">
                {(["llamada", "whatsapp", "nota"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTipoContacto(t)}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                      tipoContacto === t
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-100 text-gray-400"
                    }`}
                  >
                    {t === "llamada" ? <Phone size={18} /> : t === "whatsapp" ? <MessageCircle size={18} /> : <FileText size={18} />}
                    <span className="text-[10px] font-bold uppercase mt-1">{t}</span>
                  </button>
                ))}
              </div>

              {/* Checkbox "También marcar para rellamar".
                  Útil cuando llamas y salta el contestador: registras la
                  llamada (cuenta para Reporte Diario) Y la añades a la lista
                  de rellamar (para que aparezca en "Para Rellamar"). */}
              <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                marcarRellamar
                  ? "border-yellow-500 bg-yellow-50"
                  : "border-gray-100 bg-white hover:bg-gray-50"
              }`}>
                <input
                  type="checkbox"
                  checked={marcarRellamar}
                  onChange={(e) => setMarcarRellamar(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                />
                <Phone size={16} className={marcarRellamar ? "text-yellow-600" : "text-gray-400"} />
                <span className={`text-sm font-medium ${marcarRellamar ? "text-yellow-800" : "text-gray-600"}`}>
                  📞 También marcar para rellamar
                </span>
              </label>

              {/* Contenido */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Descripción</label>
                <textarea
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                  placeholder="Escribe aquí los detalles del contacto..."
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>

              {/* Fecha Retroactiva */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Fecha personalizada</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={usarFechaPersonalizada} 
                    onChange={(e) => setUsarFechaPersonalizada(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                </div>
                {usarFechaPersonalizada && (
                  <input
                    type="date"
                    value={fechaContacto}
                    max={new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" })}
                    onChange={(e) => setFechaContacto(e.target.value)}
                    className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 flex items-start gap-3">
                <AlertCircle className="text-orange-500 mt-0.5" size={18} />
                <p className="text-xs text-orange-700 leading-relaxed">
                  Los recordatorios te ayudarán a no olvidar tareas específicas. Aparecerán en tu Dashboard.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Fecha del recordatorio</label>
                <input
                  type="date"
                  value={recordatorioFecha}
                  onChange={(e) => setRecordatorioFecha(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase">¿Qué recordar?</label>
                <input
                  type="text"
                  value={recordatorioTexto}
                  onChange={(e) => setRecordatorioTexto(e.target.value)}
                  placeholder="Ej: Llamar para confirmar cita..."
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Notas adicionales</label>
                <textarea
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm min-h-[80px] outline-none resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
          <Button onClick={onClose} variant="ghost" className="flex-1 text-gray-500">Cancelar</Button>
          <Button
            onClick={handleGuardar}
            disabled={isGuardando}
            className={`flex-1 gap-2 rounded-xl ${tipoAnotacion === 'nota' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} disabled:opacity-60`}
          >
            <CheckCircle2 size={18} />
            {isGuardando ? "Guardando..." : tipoAnotacion === "nota" ? "Guardar Nota" : "Programar"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
