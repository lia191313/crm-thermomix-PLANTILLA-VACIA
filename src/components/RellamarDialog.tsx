import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const hoyISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Pregunta cuándo volver a llamar a una clienta: día (obligatorio), hora y
 * una nota. Devuelve "AAAA-MM-DD", "HH:MM" y la nota al confirmar.
 */
export default function RellamarDialog({
  nombre,
  onClose,
  onConfirmar,
}: {
  nombre: string;
  onClose: () => void;
  onConfirmar: (fecha: string, hora: string, nota: string) => Promise<void>;
}) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("10:00");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const atajos = [
    { label: "Mañana", dias: 1 },
    { label: "En 2 días", dias: 2 },
    { label: "En 1 semana", dias: 7 },
  ];
  const sumar = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Cuándo vuelves a llamar a {nombre.split(" ")[0]}?</DialogTitle>
          <DialogDescription>Se creará un recordatorio con aviso al móvil.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {atajos.map(({ label, dias }) => (
              <Button
                key={dias}
                type="button"
                size="sm"
                variant={fecha === sumar(dias) ? "default" : "outline"}
                onClick={() => setFecha(sumar(dias))}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={fecha} min={hoyISO()} onChange={(e) => setFecha(e.target.value)} aria-label="Día" />
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Hora" />
          </div>
          <div className="flex gap-2">
            {[["10:00", "☀️ Mañana"], ["17:30", "🌙 Tarde"]].map(([h, t]) => (
              <Button key={h} type="button" size="sm" variant={hora === h ? "default" : "outline"} onClick={() => setHora(h)}>
                {t}
              </Button>
            ))}
          </div>
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (opcional): ej. confirmar si viene a la clase"
            aria-label="Nota"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button
            disabled={!fecha || guardando}
            className="bg-yellow-400 text-yellow-900 hover:bg-yellow-500"
            onClick={async () => {
              setGuardando(true);
              try {
                await onConfirmar(fecha, hora || "10:00", nota.trim());
                onClose();
              } finally {
                setGuardando(false);
              }
            }}
          >
            {guardando ? "Guardando..." : "📞 Programar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
