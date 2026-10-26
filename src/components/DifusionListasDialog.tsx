import { useEffect, useMemo, useState } from "react";
import { Megaphone, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Contact } from "@/hooks/useContacts";
import { noInvitar, soloOnline } from "@/lib/marcas";

// Las tres listas de difusión de WhatsApp Business, definidas por una regla
// en vez de copiar a mano los destinatarios cada vez.
export type ListaDifusion = "online" | "mi_zona" | "otra_zona";

export const LISTAS: { id: ListaDifusion; nombre: string; descripcion: string }[] = [
  { id: "online", nombre: "Clase online", descripcion: "Todos los clientes" },
  { id: "mi_zona", nombre: "Clase presencial en mi zona", descripcion: "Clientes de Mi zona" },
  { id: "otra_zona", nombre: "Clase presencial en otra zona", descripcion: "Clientes que no son de Mi zona" },
];

const SIN_MODELO = "Sin modelo";
const modeloDe = (c: Contact) => c.modelo?.trim() || SIN_MODELO;

export function contactosDeLista(todos: Contact[], lista: ListaDifusion): Contact[] {
  const contactos = todos.filter((c) => !noInvitar(c.nombre)); // 🚫 no recibe invitaciones
  // 🖥️ solo online: entra en la clase online, pero no en las presenciales.
  if (lista === "mi_zona") return contactos.filter((c) => c.zonaPlaya && !soloOnline(c.nombre));
  if (lista === "otra_zona") return contactos.filter((c) => !c.zonaPlaya && !soloOnline(c.nombre));
  return contactos;
}

export default function DifusionListasDialog({
  contactos,
  onClose,
  onRegistrar,
}: {
  contactos: Contact[];
  onClose: () => void;
  onRegistrar: (ids: number[], texto: string, fecha: string) => Promise<void>;
}) {
  const [lista, setLista] = useState<ListaDifusion>("online");
  const [soloGuardadas, setSoloGuardadas] = useState(true);
  const [modelosQuitados, setModelosQuitados] = useState<Set<string>>(new Set());
  const [quitadas, setQuitadas] = useState<Set<number>>(new Set());
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().split("T")[0]);
  const [guardando, setGuardando] = useState(false);

  const hayMarcadas = contactos.some((c) => c.recibeDifusion);

  // Al cambiar de lista se empieza de cero con los ajustes.
  useEffect(() => {
    setModelosQuitados(new Set());
    setQuitadas(new Set());
  }, [lista]);

  const base = useMemo(() => {
    const deLista = contactosDeLista(contactos, lista);
    return (soloGuardadas ? deLista.filter((c) => c.recibeDifusion) : deLista).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    );
  }, [contactos, lista, soloGuardadas]);

  const modelos = useMemo(() => {
    const m = new Map<string, number>();
    base.forEach((c) => m.set(modeloDe(c), (m.get(modeloDe(c)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [base]);

  const visibles = base.filter((c) => !modelosQuitados.has(modeloDe(c)));
  const elegidas = visibles.filter((c) => !quitadas.has(c.id));

  const toggleModelo = (modelo: string) =>
    setModelosQuitados((prev) => {
      const next = new Set(prev);
      if (next.has(modelo)) next.delete(modelo);
      else next.add(modelo);
      return next;
    });

  const togglePersona = (id: number) =>
    setQuitadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copiarLista = async () => {
    const lineas = elegidas.map((c) => `${c.nombre}\t${c.telefono}`).join("\n");
    try {
      await navigator.clipboard.writeText(lineas);
      toast.success(`Copiados ${elegidas.length} nombres y teléfonos`);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const registrar = async () => {
    if (!texto.trim()) {
      toast.error("Escribe de qué iba la difusión (ej: Clase online del miércoles)");
      return;
    }
    if (elegidas.length === 0) {
      toast.error("No hay ninguna persona marcada");
      return;
    }
    setGuardando(true);
    try {
      await onRegistrar(elegidas.map((c) => c.id), texto.trim(), fecha);
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[92vh] flex flex-col p-5 gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-blue-600" /> Nueva difusión
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {LISTAS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLista(l.id)}
              className={`text-left p-3 rounded-lg border transition ${
                lista === l.id ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-input hover:bg-muted"
              }`}
            >
              <p className="font-semibold text-sm">{l.nombre}</p>
              <p className="text-xs text-muted-foreground">{l.descripcion}</p>
            </button>
          ))}
        </div>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={soloGuardadas} onChange={(e) => setSoloGuardadas(e.target.checked)} className="w-4 h-4" />
            Solo las que me tienen guardada (les llega la difusión)
          </label>
          {soloGuardadas && !hayMarcadas && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Todavía no has marcado a nadie como "me tiene guardada". Desmarca esta casilla para ver a todas, o marca primero quién te tiene guardada.
            </p>
          )}
          {modelos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Máquina:</span>
              {modelos.map(([modelo, n]) => (
                <label
                  key={modelo}
                  className={`flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer ${
                    modelosQuitados.has(modelo) ? "opacity-50 line-through" : "bg-primary/10 border-primary/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!modelosQuitados.has(modelo)}
                    onChange={() => toggleModelo(modelo)}
                    className="w-3.5 h-3.5"
                    aria-label={`Incluir ${modelo}`}
                  />
                  {modelo} ({n})
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{elegidas.length} de {visibles.length} marcadas</span>
          <Button variant="outline" size="sm" onClick={copiarLista} className="gap-1" disabled={elegidas.length === 0}>
            <Copy className="w-3.5 h-3.5" /> Copiar nombres y teléfonos
          </Button>
        </div>

        <div className="flex-1 min-h-[120px] overflow-y-auto border rounded-md divide-y">
          {visibles.length === 0 && <p className="p-4 text-sm text-center text-muted-foreground">Nadie con estos filtros</p>}
          {visibles.map((c) => (
            <label key={c.id} className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${quitadas.has(c.id) ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={!quitadas.has(c.id)}
                onChange={() => togglePersona(c.id)}
                className="w-4 h-4"
                aria-label={`Incluir ${c.nombre}`}
              />
              <span className="flex-1 min-w-0 truncate font-medium">{c.nombre}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{c.telefono}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary whitespace-nowrap">{modeloDe(c)}</span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="De qué iba (ej: Invitación clase online miércoles 8/10)"
            aria-label="De qué iba la difusión"
          />
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha" />
        </div>

        <div className="flex gap-3">
          <Button onClick={registrar} disabled={guardando} className="flex-1 bg-blue-600 hover:bg-blue-700">
            {guardando ? "Guardando..." : `Registrar difusión para ${elegidas.length}`}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
        </div>
      </Card>
    </div>
  );
}
