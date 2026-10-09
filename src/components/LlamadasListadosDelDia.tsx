import { useState } from "react";
import { ClipboardList, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLlamadasListadosDelDia } from "@/hooks/useListadoLlamadas";

/**
 * Sección del Reporte Diario con las llamadas hechas desde Listados ese día.
 * Cada una tiene una casilla para decidir si entra en el informe semanal.
 */
export default function LlamadasListadosDelDia({ dia }: { dia: Date }) {
  const { llamadas, error, cambiarIncluir, editarNota } = useLlamadasListadosDelDia(dia);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardarNota = async (id: number) => {
    setGuardando(true);
    try {
      await editarNota(id, texto);
      toast.success("Comentario actualizado");
      setEditandoId(null);
    } catch {
      toast.error("No se pudo guardar el comentario");
    } finally {
      setGuardando(false);
    }
  };

  if (error || llamadas.length === 0) return null;

  const incluidas = llamadas.filter((l) => l.incluir_en_informe).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-amber-600" />
          Llamadas de listados ({llamadas.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          {incluidas} de {llamadas.length} en el informe semanal
        </p>
      </div>
      {llamadas.map((l) => {
        const nombre = l.persona ? `${l.persona.nombre} ${l.persona.apellidos}`.trim() : "Persona borrada";
        const hora = new Date(l.fecha).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        return (
          <div
            key={l.id}
            className={`flex items-start gap-3 bg-card border rounded-lg p-4 transition-colors ${
              l.incluir_en_informe ? "border-amber-300" : "border-border opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={l.incluir_en_informe}
              onChange={async (e) => {
                try {
                  await cambiarIncluir(l.id, e.target.checked);
                } catch {
                  toast.error("No se pudo guardar");
                }
              }}
              className="w-5 h-5 mt-0.5 accent-amber-600"
              aria-label={`Incluir a ${nombre} en el informe`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{nombre}</p>
                {editandoId !== l.id && (
                  <button
                    onClick={() => { setEditandoId(l.id); setTexto(l.notas ?? ""); }}
                    className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                    title="Editar comentario"
                    aria-label={`Editar comentario de ${nombre}`}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {l.persona?.telefono} {l.persona?.poblacion && `· ${l.persona.poblacion}`} · Llamada {hora}
              </p>
              {editandoId === l.id ? (
                <div className="mt-1 space-y-2">
                  <textarea
                    autoFocus
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Ej: me devuelve la llamada, interesada en una demo"
                    className="w-full min-h-[80px] p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-background text-foreground"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-7 px-2" disabled={guardando} onClick={() => setEditandoId(null)}>
                      <X size={14} className="mr-1" /> Cancelar
                    </Button>
                    <Button size="sm" className="h-7 px-2 bg-blue-600 hover:bg-blue-700" disabled={guardando} onClick={() => guardarNota(l.id)}>
                      <Check size={14} className="mr-1" /> {guardando ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              ) : (
                l.notas && (
                  <p
                    className="text-sm mt-1 bg-background rounded p-2 whitespace-pre-line cursor-pointer hover:bg-accent/50"
                    onClick={() => { setEditandoId(l.id); setTexto(l.notas ?? ""); }}
                    title="Clic para editar el comentario"
                  >
                    {l.notas}
                  </p>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
