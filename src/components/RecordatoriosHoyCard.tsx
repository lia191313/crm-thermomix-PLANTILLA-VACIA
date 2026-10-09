import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useReminders } from "@/hooks/useReminders";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/**
 * Aviso del Dashboard: recordatorios de hoy y los que se pasaron de fecha.
 * Solo aparece si hay alguno.
 */
export default function RecordatoriosHoyCard({ onAbrir }: { onAbrir: () => void }) {
  const { getPendingReminders, getOverdueReminders } = useReminders();
  const hoy = [...getPendingReminders()].sort((a, b) => a.nextReminder.localeCompare(b.nextReminder));
  const vencidos = getOverdueReminders();
  const total = hoy.length + vencidos.length;
  if (total === 0) return null;

  const primeros = hoy.slice(0, 4).map((r) => `${hora(r.nextReminder)} ${r.contactName.split(" ").slice(0, 2).join(" ")}`);

  return (
    <Card className="p-4 border-l-4 border-blue-500 bg-blue-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-full text-blue-700"><Bell size={18} /></div>
        <div>
          <p className="font-semibold text-blue-900">
            {hoy.length > 0
              ? `Hoy tienes ${hoy.length} ${hoy.length === 1 ? "recordatorio" : "recordatorios"}`
              : "No tienes recordatorios para hoy"}
            {vencidos.length > 0 && ` · ${vencidos.length} ${vencidos.length === 1 ? "pendiente" : "pendientes"} de días anteriores`}
          </p>
          {primeros.length > 0 && (
            <p className="text-sm text-blue-800">
              {primeros.join(" · ")}
              {hoy.length > primeros.length && ` · y ${hoy.length - primeros.length} más`}
            </p>
          )}
        </div>
      </div>
      <Button onClick={onAbrir} className="bg-blue-600 hover:bg-blue-700 text-white">
        Ver recordatorios
      </Button>
    </Card>
  );
}
