import { useState } from "react";
import { addDays } from "date-fns";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fechaISO } from "@/lib/listados";

// Ventana "¿Cómo ha ido?" que sale al volver de llamar desde Mi día, como la de
// Listados (22/10/2026): nota de la llamada y, si hace falta, cuándo volver a llamar.

export interface VolverALlamar {
  /** "AAAA-MM-DD" */
  fecha: string;
  /** "HH:MM" o vacío (entonces a las 10:00). */
  hora: string;
}

const ATAJOS: [string, number][] = [["Mañana", 1], ["En 2 días", 2], ["En 1 semana", 7], ["En 1 mes", 30]];

export default function TrasLlamadaDialog({
  nombre, telefono, onHablamos, onNoContesta, onCerrar,
}: {
  nombre: string;
  telefono?: string;
  onHablamos: (nota: string, volver: VolverALlamar | null) => void;
  onNoContesta: (nota: string) => void;
  onCerrar: () => void;
}) {
  const [nota, setNota] = useState("");
  const [volver, setVolver] = useState(false);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");

  const fechaDentroDe = (dias: number) => fechaISO(addDays(new Date(), dias));

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-green-600" /> ¿Cómo ha ido con {nombre}?</DialogTitle>
          <DialogDescription>{telefono && <span className="font-medium text-gray-700 tabular-nums">📞 {telefono} · </span>}Apunta lo que habéis hablado. Si no la apuntas, la llamada no se guarda.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea rows={3} autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota de la llamada (opcional)" />

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={volver}
                onChange={(e) => {
                  setVolver(e.target.checked);
                  if (e.target.checked && !fecha) setFecha(fechaDentroDe(1));
                }}
              />
              Volver a llamar
            </label>
            {volver && (
              <div className="space-y-2 pl-6">
                <div className="flex flex-wrap gap-1.5">
                  {ATAJOS.map(([texto, dias]) => (
                    <Button
                      key={dias}
                      type="button"
                      size="sm"
                      variant={fecha === fechaDentroDe(dias) ? "default" : "outline"}
                      className="h-8"
                      onClick={() => setFecha(fechaDentroDe(dias))}
                    >
                      {texto}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                  <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} title="Hora (opcional)" />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={() => onHablamos(nota.trim(), volver && fecha ? { fecha, hora } : null)}
            >
              ✅ Hablamos
            </Button>
            <Button variant="outline" onClick={() => onNoContesta(nota.trim())}>
              📞 No contesta
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">«No contesta» la vuelve a poner mañana a la misma hora.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
