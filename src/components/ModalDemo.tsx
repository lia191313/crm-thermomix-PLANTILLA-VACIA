import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Award, CheckCircle2, Bell, CalendarPlus } from "lucide-react";
import { useSupabaseDemos } from "@/hooks/useSupabaseDemos";
import { useReminders } from "@/hooks/useReminders";
import { abrirEnGoogleCalendar } from "@/utils/googleCalendar";
import { toast } from "sonner";

interface ModalDemoProps {
  contactoId: number;
  contactoNombre: string;
  // Retrocompatible: si el consumidor no usa el argumento, sigue funcionando como antes.
  onClose: (wasSaved?: boolean) => void;
}

const RESULTADOS = [
  { value: "pendiente_venta", label: "Pendiente de cerrar venta", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "venta_cerrada", label: "Venta cerrada 🎉", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "seguimiento", label: "Requiere seguimiento", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "no_interesado", label: "No interesado", color: "bg-gray-100 text-gray-600 border-gray-200" },
] as const;

// Opciones rápidas para agendar el seguimiento (en días desde hoy).
const SEGUIMIENTO_OPCIONES = [
  { value: 3, label: "3 días" },
  { value: 7, label: "7 días" },
  { value: 15, label: "15 días" },
  { value: 30, label: "30 días" },
] as const;

export default function ModalDemo({ contactoId, contactoNombre, onClose }: ModalDemoProps) {
  const { agregarDemo } = useSupabaseDemos();
  const { addReminder } = useReminders();
  const [resultado, setResultado] = useState<typeof RESULTADOS[number]["value"]>("pendiente_venta");
  const [notas, setNotas] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [guardado, setGuardado] = useState(false);

  // Seguimiento: cuándo queremos volver a contactar. Solo se usa si el resultado
  // es "pendiente_venta" o "seguimiento". Por defecto 7 días.
  const [seguimientoDias, setSeguimientoDias] = useState<number>(7);
  const [seguimientoFechaCustom, setSeguimientoFechaCustom] = useState<string>("");
  const [crearRecordatorio, setCrearRecordatorio] = useState<boolean>(true);

  const necesitaSeguimiento = resultado === "pendiente_venta" || resultado === "seguimiento";

  const handleGuardar = async () => {
    try {
      // Como el esquema de `demos` no tiene campo `resultado`, lo codificamos como prefijo
      // en las notas para no romper nada y poder leerlo después. Retrocompatible: si no hay
      // resultado, el texto de notas va tal cual.
      const resultadoLabel = RESULTADOS.find((r) => r.value === resultado)?.label ?? "";
      const notasConResultado = resultadoLabel
        ? `[${resultadoLabel}]${notas ? ` ${notas}` : ""}`
        : (notas || null);

      await agregarDemo({
        contacto_id: contactoId,
        fecha_demo: fecha,
        completada: resultado === "venta_cerrada" || resultado === "no_interesado",
        notas: notasConResultado,
      });

      // Si el resultado necesita seguimiento y el usuario quiere crear recordatorio,
      // lo creamos automáticamente. No rompe nada: si fallase, ya hemos guardado la demo.
      if (necesitaSeguimiento && crearRecordatorio) {
        try {
          // Calcular la fecha de seguimiento: personalizada o a X días desde hoy.
          let scheduledDate: string;
          let diasUsados: number;
          if (seguimientoFechaCustom) {
            scheduledDate = seguimientoFechaCustom;
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const target = new Date(seguimientoFechaCustom + "T00:00:00");
            diasUsados = Math.max(1, Math.round((target.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));
          } else {
            const target = new Date();
            target.setHours(0, 0, 0, 0);
            target.setDate(target.getDate() + seguimientoDias);
            scheduledDate = target.toISOString().split("T")[0];
            diasUsados = seguimientoDias;
          }

          addReminder(contactoId, contactoNombre, diasUsados, "seguimiento", scheduledDate);
          toast.success(`Seguimiento agendado para el ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`);
        } catch (e) {
          console.error("Error creando recordatorio de seguimiento:", e);
          // No bloqueamos el flujo: la demo ya está registrada.
        }
      }

      setGuardado(true);
      toast.success(`Demo registrada para ${contactoNombre}`);
    } catch (error) {
      toast.error(`Error al registrar demo: ${error}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <Award className="text-purple-600" size={20} />
            <div>
              <h2 className="font-bold text-base">Registrar demo</h2>
              <p className="text-xs text-muted-foreground">{contactoNombre}</p>
            </div>
          </div>
          <button onClick={() => onClose(false)} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {guardado ? (
          <div className="p-6 text-center space-y-4">
            <CheckCircle2 className="mx-auto text-green-500 mb-1" size={40} />
            <p className="font-medium">Demo registrada ✅</p>
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 space-y-2">
              <p className="text-xs text-muted-foreground">¿Quieres anotarlo en Google Calendar?</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-purple-300 text-purple-700 hover:bg-purple-50 gap-2"
                onClick={() =>
                  abrirEnGoogleCalendar({
                    tipo: "demo",
                    contactoNombre,
                    fecha,
                    notas: notas || undefined,
                  })
                }
              >
                <CalendarPlus size={15} />
                Añadir a Google Calendar
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Se abrirá Google Calendar con el evento listo para guardar
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onClose(true)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Fecha */}
            <div>
              <label className="text-sm font-medium mb-1 block">Fecha de la demo</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
              />
            </div>

            {/* Resultado */}
            <div>
              <label className="text-sm font-medium mb-2 block">Resultado</label>
              <div className="grid grid-cols-2 gap-2">
                {RESULTADOS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setResultado(r.value)}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all ${
                      resultado === r.value
                        ? r.color + " ring-2 ring-offset-1 ring-current"
                        : "bg-background border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Notas <span className="text-xs text-muted-foreground">(opcional)</span>
              </label>
              <Textarea
                placeholder="Observaciones de la demo, interés mostrado, objeciones..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="min-h-20 text-sm"
              />
            </div>

            {/* Seguimiento automático (solo si el resultado lo requiere) */}
            {necesitaSeguimiento && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="crear-recordatorio"
                    checked={crearRecordatorio}
                    onChange={(e) => setCrearRecordatorio(e.target.checked)}
                    className="mt-1"
                  />
                  <label htmlFor="crear-recordatorio" className="text-sm font-medium flex items-center gap-1 cursor-pointer">
                    <Bell size={14} className="text-blue-600" />
                    Crear recordatorio de seguimiento
                  </label>
                </div>

                {crearRecordatorio && (
                  <div className="space-y-2 pl-6">
                    <p className="text-xs text-muted-foreground">Volver a contactar en:</p>
                    <div className="grid grid-cols-4 gap-1">
                      {SEGUIMIENTO_OPCIONES.map((op) => (
                        <button
                          key={op.value}
                          onClick={() => { setSeguimientoDias(op.value); setSeguimientoFechaCustom(""); }}
                          className={`px-2 py-1.5 rounded-md border text-xs font-medium transition-all ${
                            !seguimientoFechaCustom && seguimientoDias === op.value
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-background border-input text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">o fecha personalizada:</label>
                      <input
                        type="date"
                        value={seguimientoFechaCustom}
                        onChange={(e) => setSeguimientoFechaCustom(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full px-2 py-1 mt-1 border border-input rounded-md bg-background text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button onClick={handleGuardar} className="flex-1 bg-purple-600 hover:bg-purple-700">
                <Award size={16} className="mr-2" /> Registrar demo
              </Button>
              <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
