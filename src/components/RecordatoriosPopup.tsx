import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useReminders, type Reminder } from "@/hooks/useReminders";
import { fechaISO } from "@/lib/listados";

const CLAVE = "popupRecordatoriosVisto";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "numeric" });

const leer = () => {
  try { return localStorage.getItem(CLAVE); } catch { return null; }
};
const guardar = (v: string) => {
  try { localStorage.setItem(CLAVE, v); } catch { /* sin almacenamiento: da igual */ }
};

function Linea({ r, conDia }: { r: Reminder; conDia?: boolean }) {
  return (
    <li className="py-2 border-b last:border-0">
      <p className="font-medium">
        {conDia ? `${dia(r.nextReminder)} ` : ""}{hora(r.nextReminder)} · {r.contactName}
      </p>
      {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
    </li>
  );
}

/**
 * Ventana que sale al abrir la app (una vez al día) con los recordatorios
 * de hoy y los que se quedaron sin hacer de días anteriores.
 */
export default function RecordatoriosPopup({ onVerTodos }: { onVerTodos: () => void }) {
  const { getPendingReminders, getOverdueReminders } = useReminders();
  const [abierto, setAbierto] = useState(false);
  const hoy = [...getPendingReminders()].sort((a, b) => a.nextReminder.localeCompare(b.nextReminder));
  const vencidos = getOverdueReminders();
  const hay = hoy.length + vencidos.length > 0;

  useEffect(() => {
    if (hay && leer() !== fechaISO(new Date())) setAbierto(true);
  }, [hay]);

  const cerrar = () => {
    guardar(fechaISO(new Date()));
    setAbierto(false);
  };

  if (!abierto) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🔔 Tus recordatorios de hoy</DialogTitle>
          <DialogDescription>
            {hoy.length === 0 ? "Hoy no tienes ninguno programado." : `Tienes ${hoy.length} para hoy.`}
          </DialogDescription>
        </DialogHeader>
        {hoy.length > 0 && <ul>{hoy.map((r) => <Linea key={r.id} r={r} />)}</ul>}
        {vencidos.length > 0 && (
          <div>
            <p className="font-semibold text-red-700 mt-2">⚠️ Se quedaron sin hacer ({vencidos.length})</p>
            <ul>{vencidos.slice(0, 5).map((r) => <Linea key={r.id} r={r} conDia />)}</ul>
            {vencidos.length > 5 && <p className="text-sm text-muted-foreground">y {vencidos.length - 5} más…</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={cerrar}>Cerrar</Button>
          <Button onClick={() => { cerrar(); onVerTodos(); }}>Ver recordatorios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
