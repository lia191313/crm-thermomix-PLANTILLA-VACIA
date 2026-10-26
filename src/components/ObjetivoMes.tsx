import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { fiscalMonthOf, fiscalMonthBounds, fiscalMonthLabel } from "@/utils/fiscalMonth";
import { TMX, TituloSeccion, Recuadro } from "@/components/EstiloFormacion";
import { useSupabaseEquipo } from "@/hooks/useSupabaseEquipo";
import { altasActivasDelMes } from "@/lib/cualificacion";

// Objetivo de ventas, demos y altas activas del mes fiscal Thermomix (21/10/2026). Se guarda
// en la tabla `objetivos` (supabase/crear_objetivos.sql), una fila por mes.

interface Objetivo {
  ventas: number;
  demos: number;
  /** Altas activas (reclutas con su primera venta este mes, ver lib/cualificacion.ts). */
  altas: number;
}

export function claveMes(fecha = new Date()): string {
  const fm = fiscalMonthOf(fecha);
  return `${fm.year}-${String(fm.month).padStart(2, "0")}`;
}

function Barra({ etiqueta, llevas, objetivo, color }: { etiqueta: string; llevas: number; objetivo: number; color: string }) {
  const porcentaje = objetivo > 0 ? Math.min(100, Math.round((llevas / objetivo) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-gray-700">{etiqueta}</span>
        <span>
          <span className="font-semibold" style={{ color }}>{llevas}</span>
          <span className="text-muted-foreground"> de {objetivo}</span>
          {llevas >= objetivo && objetivo > 0 && <span className="ml-1">🎉</span>}
        </span>
      </div>
      <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${porcentaje}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function ObjetivoMes({ ventasMes, demosMes }: { ventasMes: number; demosMes: number }) {
  const fm = fiscalMonthOf(new Date());
  const mes = claveMes();
  const nombreMes = fiscalMonthLabel(fm, { short: false }).split(" ")[0].toLowerCase();
  const cierre = new Date(fiscalMonthBounds(fm).endExclusive.getTime() - 86400000);

  const [objetivo, setObjetivo] = useState<Objetivo | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [ventas, setVentas] = useState("");
  const [demos, setDemos] = useState("");
  const [altas, setAltas] = useState("");
  const { notas: notasEquipo } = useSupabaseEquipo();
  const altasMes = altasActivasDelMes(notasEquipo, fm);

  useEffect(() => {
    supabase
      .from("objetivos")
      .select("ventas, demos, altas")
      .eq("mes", mes)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("Error cargando el objetivo del mes:", error);
        setObjetivo(data ?? null);
      });
  }, [mes]);

  const abrirEdicion = () => {
    setVentas(String(objetivo?.ventas ?? ""));
    setDemos(String(objetivo?.demos ?? ""));
    setAltas(String(objetivo?.altas ?? ""));
    setEditando(true);
  };

  const guardar = async () => {
    const numero = (t: string) => Math.max(0, parseInt(t, 10) || 0);
    const nuevo = { ventas: numero(ventas), demos: numero(demos), altas: numero(altas) };
    const { error } = await supabase
      .from("objetivos")
      .upsert({ mes, ...nuevo, updated_at: new Date().toISOString() });
    if (error) {
      console.error("Error guardando el objetivo:", error);
      toast.error("No se pudo guardar el objetivo");
      return;
    }
    setObjetivo(nuevo);
    setEditando(false);
    toast.success(`Objetivo de ${nombreMes} guardado 🎯`);
  };

  if (objetivo === undefined) return null;

  return (
    <section className="space-y-3">
      <TituloSeccion color={TMX.verde} icono={Target}>Objetivo de {nombreMes}</TituloSeccion>
      <Recuadro color={TMX.verde} className="!p-3 sm:!p-4 space-y-3">
        {editando ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm font-medium text-gray-700 space-y-1">
                <span>Ventas</span>
                <Input type="number" inputMode="numeric" min={0} value={ventas} onChange={(e) => setVentas(e.target.value)} />
              </label>
              <label className="text-sm font-medium text-gray-700 space-y-1">
                <span>Demos</span>
                <Input type="number" inputMode="numeric" min={0} value={demos} onChange={(e) => setDemos(e.target.value)} />
              </label>
              <label className="text-sm font-medium text-gray-700 space-y-1">
                <span>Altas activas</span>
                <Input type="number" inputMode="numeric" min={0} value={altas} onChange={(e) => setAltas(e.target.value)} />
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
              <Button size="sm" className="text-white" style={{ backgroundColor: TMX.verde }} onClick={guardar}>Guardar</Button>
            </div>
          </div>
        ) : objetivo && (objetivo.ventas > 0 || objetivo.demos > 0 || objetivo.altas > 0) ? (
          <>
            {objetivo.ventas > 0 && <Barra etiqueta="Ventas" llevas={ventasMes} objetivo={objetivo.ventas} color={TMX.verde} />}
            {objetivo.demos > 0 && <Barra etiqueta="Demos" llevas={demosMes} objetivo={objetivo.demos} color={TMX.naranja} />}
            {objetivo.altas > 0 && <Barra etiqueta="Altas activas" llevas={altasMes} objetivo={objetivo.altas} color={TMX.azul} />}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>El mes de Thermomix cierra el {cierre.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={abrirEdicion}>Cambiar</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-700">
              Todavía no has puesto tu objetivo de {nombreMes}. Llevas{" "}
              <span className="font-semibold" style={{ color: TMX.verde }}>{ventasMes} {ventasMes === 1 ? "venta" : "ventas"}</span>,{" "}
              <span className="font-semibold" style={{ color: TMX.naranja }}>{demosMes} {demosMes === 1 ? "demo" : "demos"}</span> y{" "}
              <span className="font-semibold" style={{ color: TMX.azul }}>{altasMes} {altasMes === 1 ? "alta activa" : "altas activas"}</span>.
            </p>
            <Button size="sm" className="text-white" style={{ backgroundColor: TMX.verde }} onClick={abrirEdicion}>Poner objetivo</Button>
          </div>
        )}
      </Recuadro>
    </section>
  );
}
