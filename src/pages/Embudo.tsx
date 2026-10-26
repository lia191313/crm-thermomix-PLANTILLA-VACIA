import { useMemo, useState } from "react";
import { Filter, ChevronLeft, ChevronRight, X, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useContacts, Contact } from "@/hooks/useContacts";
import { useSupabaseEquipo } from "@/hooks/useSupabaseEquipo";
import { esArchivado, coincideNombre } from "@/lib/marcas";
import { ETAPAS_VENTA, ETAPA_QUIERE_ENTRAR, FUERA_DEL_EMBUDO, enEmbudo, etapaDe, etapaVecina } from "@/lib/embudo";
import { calcularCualificacion, type EstadoRecluta } from "@/lib/cualificacion";
import { TMX, Recuadro, CabeceraFormacion } from "@/components/EstiloFormacion";

// Pantalla "Embudo" (21/10/2026), con dos pestañas (ver lib/embudo.ts):
//  - Ventas: una columna por paso; se mueven con ‹ ›, ✕ las saca.
//  - Reclutas: "Interesada en entrar" se apunta a mano; el resto de columnas
//    salen solas de Equipo (alta/contrato, alta activa, compensada, en su equipo).

type Pestana = "ventas" | "reclutas";

interface EmbudoProps {
  onViewContact?: (id: number) => void;
}

// Columnas del camino de recluta que salen de Equipo.
const COLUMNAS_RECLUTA: { titulo: string; emoji: string; color: string; incluye: (r: EstadoRecluta) => boolean }[] = [
  { titulo: "Alta / contrato", emoji: "📝", color: TMX.naranja, incluye: (r) => !r.deEquipo && r.ventas === 0 },
  { titulo: "Alta activa", emoji: "🏆", color: TMX.verde, incluye: (r) => !r.deEquipo && r.ventas >= 1 && r.ventas < 4 },
  { titulo: "Compensada", emoji: "⭐", color: "#9333EA", incluye: (r) => !r.deEquipo && r.ventas >= 4 },
  { titulo: "En tu equipo", emoji: "🤝", color: "#0F766E", incluye: (r) => r.deEquipo },
];

export default function Embudo({ onViewContact }: EmbudoProps) {
  const { contacts, loading, updateContact } = useContacts();
  const { agentes, notas } = useSupabaseEquipo();
  const [pestana, setPestana] = useState<Pestana>("ventas");
  const [busqueda, setBusqueda] = useState("");

  const enMarcha = useMemo(
    () => contacts.filter((c) => enEmbudo(c.estado_lead) && !esArchivado(c.nombre)),
    [contacts]
  );
  const enVentas = enMarcha.filter((c) => c.estado_lead !== ETAPA_QUIERE_ENTRAR.id);
  const quierenEntrar = enMarcha.filter((c) => c.estado_lead === ETAPA_QUIERE_ENTRAR.id);
  const { reclutas } = useMemo(() => calcularCualificacion(agentes, notas), [agentes, notas]);

  // Para añadir a alguien: personas que aún no están en el embudo.
  const candidatas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 2) return [];
    return contacts
      .filter((c) => !enEmbudo(c.estado_lead) && !esArchivado(c.nombre) && coincideNombre(c.nombre, q))
      .slice(0, 5);
  }, [contacts, busqueda]);

  const primerNombre = (n: string) => n.replace(/[^\p{L}\s]/gu, "").trim().split(" ")[0];

  // Cada cambio se puede deshacer desde el propio aviso (21/10/2026: movió a
  // Houda sin querer al tocar la flecha).
  const mover = async (c: Contact, estado: string, aviso: string) => {
    const anterior = c.estado_lead ?? FUERA_DEL_EMBUDO;
    try {
      await updateContact({ ...c, estado_lead: estado });
      toast.success(aviso, {
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await updateContact({ ...c, estado_lead: anterior });
              toast.success(`${primerNombre(c.nombre)}: vuelve como estaba`);
            } catch {
              toast.error("No se pudo deshacer");
            }
          },
        },
      });
    } catch (e) {
      console.error("Error moviendo en el embudo:", e);
      toast.error("No se pudo guardar el cambio");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const primeraEtapa = pestana === "ventas" ? ETAPAS_VENTA[0] : ETAPA_QUIERE_ENTRAR;

  // Tarjeta de una persona del embudo (con ‹ › solo en el camino de venta).
  const tarjeta = (c: Contact, conFlechas: boolean) => {
    const anterior = conFlechas ? etapaVecina(c.estado_lead ?? "", -1) : null;
    const siguiente = conFlechas ? etapaVecina(c.estado_lead ?? "", 1) : null;
    return (
      <div key={c.id} className="rounded-lg border bg-gray-50 p-2 space-y-1">
        <button className="font-semibold text-sm text-left hover:underline" onClick={() => onViewContact?.(c.id)}>
          {c.nombre}
        </button>
        {c.ubicacion && <p className="text-xs text-muted-foreground">{c.ubicacion}</p>}
        <div className="flex items-center gap-1">
          {conFlechas && (
            <>
              <Button
                size="icon" variant="ghost" className="h-7 w-7" disabled={!anterior}
                title={anterior ? `Volver a «${etapaDe(anterior)?.label}»` : undefined}
                onClick={() => anterior && mover(c, anterior, `${primerNombre(c.nombre)}: ${etapaDe(anterior)?.label}`)}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                size="icon" variant="ghost" className="h-7 w-7" disabled={!siguiente}
                title={siguiente ? `Pasar a «${etapaDe(siguiente)?.label}»` : undefined}
                onClick={() => siguiente && mover(c, siguiente, `${primerNombre(c.nombre)}: ${etapaDe(siguiente)?.label} ${etapaDe(siguiente)?.emoji}`)}
              >
                <ChevronRight size={16} />
              </Button>
            </>
          )}
          <Button
            size="icon" variant="ghost" className="h-7 w-7 ml-auto text-gray-400 hover:text-red-600"
            title="Sacar del embudo"
            onClick={() => mover(c, FUERA_DEL_EMBUDO, `${primerNombre(c.nombre)} sale del embudo`)}
          >
            <X size={16} />
          </Button>
        </div>
      </div>
    );
  };

  const columna = (key: string, titulo: string, emoji: string, color: string, cuantas: number, contenido: React.ReactNode) => (
    <Recuadro key={key} color={color} className="!p-3 space-y-2">
      <h2 className="font-display font-medium uppercase tracking-wide text-sm flex items-center justify-between gap-2" style={{ color }}>
        <span>{emoji} {titulo}</span>
        <span className="shrink-0 rounded-full px-2 text-white text-xs" style={{ backgroundColor: color }}>{cuantas}</span>
      </h2>
      {cuantas === 0 && <p className="text-xs text-muted-foreground">Nadie en este paso</p>}
      {contenido}
    </Recuadro>
  );

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <CabeceraFormacion
        icono={Filter}
        titulo="Embudo"
        subtitulo={`${enVentas.length} en ventas · ${quierenEntrar.length + reclutas.filter((r) => !r.deEquipo).length} en reclutas`}
      />

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-border">
        {([["ventas", "🛒 Ventas"], ["reclutas", "🤝 Reclutas"]] as const).map(([id, texto]) => (
          <button
            key={id}
            onClick={() => { setPestana(id); setBusqueda(""); }}
            className={`px-4 py-2 font-medium transition-colors ${
              pestana === id ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {pestana === "ventas" ? (
          <>
            Toca el <span className="font-medium text-gray-700">nombre</span> para ver su ficha ·{" "}
            <span className="font-medium text-gray-700">‹ ›</span> para pasarla al paso anterior o siguiente ·{" "}
            <span className="font-medium text-gray-700">✕</span> para sacarla. Si te equivocas, toca «Deshacer» en el aviso.
          </>
        ) : (
          <>
            Apunta aquí a quien quiere <span className="font-medium text-gray-700">ganarse la máquina o trabajar contigo</span>.
            Cuando la des de alta en <span className="font-medium text-gray-700">Equipo</span>, el resto de pasos se mueven solos
            con las ventas que le apuntes allí.
          </>
        )}
      </p>

      {/* Añadir a alguien al primer paso de la pestaña */}
      <Recuadro color={TMX.verde} className="!p-3 sm:!p-4 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={pestana === "ventas" ? "Añadir a ventas: escribe un nombre…" : "Añadir a reclutas: escribe un nombre…"}
            className="pl-9"
          />
        </div>
        {candidatas.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{c.nombre} <span className="text-muted-foreground">· {c.ubicacion}</span></span>
            <Button
              size="sm" variant="outline" className="h-8 gap-1 shrink-0"
              onClick={() => { setBusqueda(""); mover(c, primeraEtapa.id, `${primerNombre(c.nombre)}: ${primeraEtapa.label} ${primeraEtapa.emoji}`); }}
            >
              <Plus size={14} /> Añadir
            </Button>
          </div>
        ))}
      </Recuadro>

      {pestana === "ventas" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPAS_VENTA.map((etapa) => {
            const personas = enVentas.filter((c) => c.estado_lead === etapa.id);
            return columna(etapa.id, etapa.label, etapa.emoji, etapa.color, personas.length, personas.map((c) => tarjeta(c, true)));
          })}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {columna(ETAPA_QUIERE_ENTRAR.id, ETAPA_QUIERE_ENTRAR.label, ETAPA_QUIERE_ENTRAR.emoji, ETAPA_QUIERE_ENTRAR.color,
            quierenEntrar.length, quierenEntrar.map((c) => tarjeta(c, false)))}
          {COLUMNAS_RECLUTA.map((col) => {
            const enColumna = reclutas.filter(col.incluye);
            return columna(col.titulo, col.titulo, col.emoji, col.color, enColumna.length, enColumna.map((r) => (
              <div key={r.agente.id} className="rounded-lg border bg-gray-50 p-2 space-y-0.5">
                <p className="font-semibold text-sm">{r.agente.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {r.deEquipo ? "Agente comercial" : r.agente.estado === "pendiente_firma" ? "Pendiente de firma" : `${r.ventas} de 4 ventas`}
                </p>
              </div>
            )));
          })}
        </div>
      )}
    </div>
  );
}
