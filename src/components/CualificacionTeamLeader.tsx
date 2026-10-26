import { Trophy } from "lucide-react";
import { useSupabaseEquipo } from "@/hooks/useSupabaseEquipo";
import { calcularCualificacion, META_TEAM_LEADER } from "@/lib/cualificacion";
import { TMX, TituloSeccion, Recuadro } from "@/components/EstiloFormacion";

// Cualificación de team leader (lib/cualificacion.ts). `resumen` = una sola
// línea para Mi día; si no, el bloque completo para Mi rendimiento.

const fechaLarga = (d: Date) => d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

export default function CualificacionTeamLeader({ resumen = false, onAbrir }: { resumen?: boolean; onAbrir?: () => void }) {
  const { agentes, notas, loading } = useSupabaseEquipo();
  if (loading) return null;

  const { reclutas, altasActivas, compensadas, cierre, diasRestantes } = calcularCualificacion(agentes, notas);
  const meta = META_TEAM_LEADER.altasActivas;
  const conseguido = altasActivas >= meta;
  const porcentaje = Math.min(100, Math.round((altasActivas / meta) * 100));

  if (resumen) {
    return (
      <button
        onClick={onAbrir}
        className="w-full flex items-center gap-2 rounded-2xl border-2 bg-white px-3 py-2 text-left text-sm hover:bg-amber-50"
        style={{ borderColor: TMX.naranja }}
      >
        <Trophy size={18} style={{ color: TMX.naranja }} className="shrink-0" />
        <span className="text-gray-700">
          <span className="font-semibold">Team leader:</span>{" "}
          {conseguido ? (
            <>¡conseguidas las {meta} altas activas! 🎉</>
          ) : (
            <>
              <span className="font-semibold" style={{ color: TMX.naranja }}>{altasActivas} de {meta}</span> altas activas · quedan {diasRestantes} días
            </>
          )}
        </span>
      </button>
    );
  }

  const enCurso = reclutas.filter((r) => !r.deEquipo);
  const deEquipo = reclutas.filter((r) => r.deEquipo);

  return (
    <section className="space-y-3">
      <TituloSeccion color={TMX.naranja} icono={Trophy}>Cualificación team leader</TituloSeccion>
      <Recuadro color={TMX.naranja} className="!p-4 space-y-4">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-gray-700">Altas activas</span>
            <span>
              <span className="text-xl font-bold" style={{ color: TMX.naranja }}>{altasActivas}</span>
              <span className="text-muted-foreground"> de {meta}</span>
              {conseguido && " 🎉"}
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${porcentaje}%`, backgroundColor: TMX.naranja }} />
          </div>
          <p className="text-xs text-muted-foreground first-letter:uppercase">
            Hasta el {fechaLarga(cierre)} (cierre de noviembre) · quedan {diasRestantes} días
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700">Tus reclutas</p>
          {enCurso.length === 0 && <p className="text-sm text-muted-foreground">No tienes reclutas en marcha.</p>}
          {enCurso.map((r) => (
            <div key={r.agente.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{r.agente.nombre}</span>
              <span className="whitespace-nowrap">
                <span className="text-muted-foreground">{r.ventas} de 4 ventas</span>
                {r.compensada ? (
                  <span className="ml-2 rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: TMX.verde }}>Compensada</span>
                ) : r.altaActiva ? (
                  <span className="ml-2 rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: TMX.naranja }}>Alta activa</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><span className="font-semibold" style={{ color: TMX.verde }}>{compensadas}</span> compensadas este periodo</span>
          {deEquipo.length > 0 && (
            <span className="text-muted-foreground">En tu equipo: {deEquipo.map((r) => r.agente.nombre.split(" ")[0]).join(", ")}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Cuenta sola con las ventas que apuntes en Equipo, en la ficha de cada recluta.
        </p>
      </Recuadro>
    </section>
  );
}
