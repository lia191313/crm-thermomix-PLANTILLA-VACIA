import { useState } from "react";
import { History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TMX, TituloSeccion, Recuadro } from "@/components/EstiloFormacion";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";

// Historial de contactos dentro de la ficha (22/10/2026): llamadas, WhatsApps,
// difusiones y notas de esta persona, lo último arriba. Sustituye a la antigua
// pantalla "Historial" del menú, donde había que buscar a la persona y el mes.

const TIPOS = [
  { id: "todos", label: "Todo" },
  { id: "llamada", label: "📞 Llamadas" },
  { id: "whatsapp", label: "💬 WhatsApp" },
  { id: "difusion", label: "📣 Difusiones" },
  { id: "nota", label: "📝 Notas" },
] as const;

const EMOJI: Record<string, string> = { llamada: "📞", whatsapp: "💬", difusion: "📣", nota: "📝", rellamar: "🔁" };
const VISIBLES = 10;

export default function HistorialFicha({ contactId }: { contactId: number }) {
  const { getContactosPorContacto, deleteContacto } = useLlamadasGlobales();
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["id"]>("todos");
  const [verTodo, setVerTodo] = useState(false);

  const todos = getContactosPorContacto(contactId);
  const filtrados = tipo === "todos" ? todos : todos.filter((c) => c.tipo === tipo);
  const lista = verTodo ? filtrados : filtrados.slice(0, VISIBLES);

  const borrar = async (id: string) => {
    if (!window.confirm("¿Borrar este registro del historial?")) return;
    try {
      await deleteContacto(id);
      toast.success("Borrado del historial");
    } catch {
      toast.error("No se pudo borrar");
    }
  };

  return (
    <Recuadro color={TMX.azul} className="!p-6">
      <TituloSeccion color={TMX.azul} icono={History} className="mb-3">Historial de contactos</TituloSeccion>

      {todos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay llamadas, WhatsApps ni notas apuntadas.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTipo(t.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${tipo === t.id ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <ul className="divide-y">
            {lista.map((c) => (
              <li key={c.id} className="group flex items-start gap-3 py-2">
                <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {c.fechaLocal}
                  <br />
                  {c.horaLocal?.slice(0, 5)}
                </span>
                <span className="shrink-0">{EMOJI[c.tipo] ?? "•"}</span>
                <p className="min-w-0 flex-1 whitespace-pre-line text-sm text-gray-800">{c.descripcion || "—"}</p>
                <button
                  onClick={() => borrar(c.id)}
                  className="shrink-0 text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                  title="Borrar del historial"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {filtrados.length === 0 && <p className="py-2 text-sm text-muted-foreground">No hay nada de este tipo.</p>}

          {filtrados.length > VISIBLES && (
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setVerTodo((v) => !v)}>
              {verTodo ? "Ver menos" : `Ver todo (${filtrados.length})`}
            </Button>
          )}
        </>
      )}
    </Recuadro>
  );
}
