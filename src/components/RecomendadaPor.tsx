import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Contact } from "@/hooks/useContacts";
import { esArchivado, coincideNombre } from "@/lib/marcas";
import { TMX } from "@/components/EstiloFormacion";

// Ficha: quién le recomendó esta persona (contacts.recomendada_por, 21/10/2026)
// y, al revés, a quién ha recomendado ella.

interface Props {
  contact: Contact;
  contacts: Contact[];
  onGuardar: (recomendadaPor: number | null) => Promise<void>;
}

export default function RecomendadaPor({ contact, contacts, onGuardar }: Props) {
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const quien = contacts.find((c) => c.id === contact.recomendada_por) ?? null;
  const recomendadas = useMemo(
    () => contacts.filter((c) => c.recomendada_por === contact.id),
    [contacts, contact.id]
  );

  const candidatas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 2) return [];
    return contacts
      .filter((c) => c.id !== contact.id && !esArchivado(c.nombre) && coincideNombre(c.nombre, q))
      .slice(0, 5);
  }, [contacts, busqueda, contact.id]);

  const elegir = async (id: number | null) => {
    await onGuardar(id);
    setBuscando(false);
    setBusqueda("");
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs text-muted-foreground mb-1">La recomendó</p>
        {buscando ? (
          <div className="space-y-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-gray-400" size={16} />
              <Input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Escribe su nombre…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            {candidatas.map((c) => (
              <button
                key={c.id}
                onClick={() => elegir(c.id)}
                className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-green-50"
              >
                {c.nombre} <span className="text-muted-foreground">· {c.ubicacion}</span>
              </button>
            ))}
            <button onClick={() => setBuscando(false)} className="text-xs text-muted-foreground hover:underline">
              Cancelar
            </button>
          </div>
        ) : quien ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium" style={{ color: TMX.verde }}>{quien.nombre}</span>
            <button onClick={() => setBuscando(true)} className="text-xs text-muted-foreground hover:underline">Cambiar</button>
            <button onClick={() => elegir(null)} title="Quitar" className="text-gray-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => setBuscando(true)} className="text-sm hover:underline" style={{ color: TMX.azul }}>
            + Apuntar quién la recomendó
          </button>
        )}
      </div>

      {recomendadas.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Ha recomendado a ({recomendadas.length})</p>
          <ul className="text-sm space-y-0.5">
            {recomendadas.map((c) => <li key={c.id}>• {c.nombre}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
