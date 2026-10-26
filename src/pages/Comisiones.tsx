import { useMemo, useState } from "react";
import { Receipt, Plus, ChevronDown, Pencil, FolderOpen, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CabeceraFormacion, TituloSeccion, TMX } from "@/components/EstiloFormacion";
import { useSupabaseComisiones } from "@/hooks/useSupabaseComisiones";
import { CONCEPTOS, euros, neto, nombreMes, porTrimestre, sumar, type ComisionMes } from "@/lib/comisiones";

// Pantalla "Mis comisiones" (25/10/2026): resumen de cada factura mensual de
// Vorwerk para el gestor. Solo importes. Ver src/lib/comisiones.ts.


const DUDAS_GESTOR = [
  "La factura pone IVA 21 %, pero Vorwerk no lo paga (el banco solo recibe comisión − IRPF). ¿Está bien puesto?",
  "¿Hay que presentar cada trimestre el modelo 130 (y el 303)?",
  "El primer año de actividad, ¿me pueden retener un 7 % de IRPF en vez del 15 %?",
  "Cómo declarar los premios en especie (máquinas, vasos…), que tributan sin ser dinero.",
];

const VACIO = (mes: string): ComisionMes => ({
  mes, factura: null, fecha_factura: null, base: 0, iva_factura: 0, irpf: 0, nac_retenidas: 0, basicas: 0, bono: 0,
  icb: 0, reclutamiento: 0, grupo: 0, especie: 0, cobrado: null, fecha_cobro: null, notas: null,
});

function EditarMesDialog({ inicial, nuevo, onCerrar, onGuardar }: {
  inicial: ComisionMes;
  nuevo: boolean;
  onCerrar: () => void;
  onGuardar: (c: ComisionMes) => Promise<void>;
}) {
  const [form, setForm] = useState<ComisionMes>(inicial);
  const [guardando, setGuardando] = useState(false);
  const numero = (k: keyof ComisionMes, v: string) => setForm((f) => ({ ...f, [k]: v === "" ? (k === "cobrado" ? null : 0) : Number(v.replace(",", ".")) }));
  const texto = (k: keyof ComisionMes, v: string) => setForm((f) => ({ ...f, [k]: v.trim() ? v : null }));

  const guardar = async () => {
    if (!/^\d{4}-\d{2}$/.test(form.mes)) {
      toast.error("Elige el mes");
      return;
    }
    setGuardando(true);
    try {
      await onGuardar(form);
      toast.success("Mes guardado");
      onCerrar();
    } catch (e) {
      console.error("Error guardando comisiones:", e);
      toast.error("No se pudo guardar");
      setGuardando(false);
    }
  };

  const campoNum = (k: keyof ComisionMes, label: string, ayuda?: string) => (
    <label className="block text-sm">
      <span className="text-gray-700">{label}</span>
      {ayuda && <span className="block text-xs text-muted-foreground">{ayuda}</span>}
      <Input type="number" step="0.01" inputMode="decimal" value={form[k] ?? ""} onChange={(e) => numero(k, e.target.value)} />
    </label>
  );

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{nuevo ? "Añadir mes" : `Cambiar ${nombreMes(form.mes)}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-700">Mes de la factura</span>
              <Input type="month" value={form.mes} disabled={!nuevo} onChange={(e) => setForm((f) => ({ ...f, mes: e.target.value }))} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Nº de factura</span>
              <Input value={form.factura ?? ""} onChange={(e) => texto("factura", e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {campoNum("base", "Comisión (subtotal)")}
            {campoNum("irpf", "Retención IRPF")}
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">De qué se compone</p>
          <div className="grid grid-cols-2 gap-3">
            {CONCEPTOS.map((c) => <div key={c.campo}>{campoNum(c.campo, c.label, c.ayuda)}</div>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {campoNum("cobrado", "Cobrado en el banco")}
            <label className="block text-sm">
              <span className="text-gray-700">Día del cobro</span>
              <Input type="date" value={form.fecha_cobro ?? ""} onChange={(e) => texto("fecha_cobro", e.target.value)} />
            </label>
          </div>
          {campoNum("iva_factura", "IVA que pone la factura", "no se cobra; solo para el gestor")}
          <label className="block text-sm">
            <span className="text-gray-700">Notas</span>
            <Textarea rows={2} value={form.notas ?? ""} onChange={(e) => texto("notas", e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando} style={{ backgroundColor: TMX.verde }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Comisiones() {
  const { meses, loading, error, guardar } = useSupabaseComisiones();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ fila: ComisionMes; nuevo: boolean } | null>(null);

  const total = useMemo(() => sumar(meses), [meses]);
  const trimestres = useMemo(() => porTrimestre(meses), [meses]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const siguienteMes = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-4xl mx-auto">
      <CabeceraFormacion icono={Receipt} titulo="Mis comisiones" subtitulo="Lo que cobro de Vorwerk, ordenado para el gestor">
        <Button size="sm" className="gap-1 shrink-0" style={{ backgroundColor: TMX.verde }} onClick={() => setEditando({ fila: VACIO(siguienteMes()), nuevo: true })}>
          <Plus size={16} /> Añadir mes
        </Button>
      </CabeceraFormacion>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {meses.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ["Comisiones", total.base, false],
              ["IRPF retenido", total.irpf, false],
              ["Neto según facturas", total.neto, false],
              ["De ello en especie", total.especie, false],
              ["Cobrado de verdad", total.cobrado, true],
            ].map(([label, valor, real]) => (
              <div key={label as string} className={`rounded-xl border bg-white p-3 ${real ? "border-green-600" : "border-gray-200"}`}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-lg font-semibold tabular-nums ${real ? "text-green-700" : "text-gray-800"}`}>{euros(valor as number)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            «Cobrado de verdad» es lo que llegó al banco. Es menos que el neto porque los premios en especie (vasos, TM7…) no se cobran en dinero y
            Vorwerk descuenta a veces otras facturas.
          </p>
        </div>
      )}

      <section className="space-y-2">
        <TituloSeccion color={TMX.naranja} icono={Receipt}>Mes a mes</TituloSeccion>
        {meses.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay ningún mes. Toca «Añadir mes».</p>}
        <div className="rounded-xl border border-gray-200 bg-white divide-y">
          {meses.length > 0 && (
            <div className="px-3 py-1.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex-1">Mes</span>
              <span className="w-24 text-right">Según factura</span>
              <span className="w-24 text-right">Cobrado</span>
              <span className="w-4" />
            </div>
          )}
          {meses.map((c) => {
            const abiertoEste = abierto === c.mes;
            return (
              <div key={c.mes}>
                <button className="w-full px-3 py-2.5 flex items-center gap-3 text-left" onClick={() => setAbierto(abiertoEste ? null : c.mes)}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-800 first-letter:uppercase">{nombreMes(c.mes)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {euros(Number(c.base))} − IRPF {euros(Number(c.irpf))}
                      {Number(c.especie) > 0 && <> · en especie {euros(Number(c.especie))}</>}
                    </span>
                  </span>
                  <span className="w-24 text-right text-sm tabular-nums text-gray-700">{euros(neto(c))}</span>
                  <span className="w-24 text-right text-sm font-semibold tabular-nums text-green-700">{c.cobrado != null ? euros(Number(c.cobrado)) : "—"}</span>
                  <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${abiertoEste ? "rotate-180" : ""}`} />
                </button>
                {abiertoEste && (
                  <div className="px-3 pb-3 space-y-2 text-sm">
                    <ul className="space-y-1">
                      {CONCEPTOS.filter((k) => Number(c[k.campo]) > 0).map((k) => (
                        <li key={k.campo} className="flex justify-between gap-2">
                          <span className="text-gray-600">{k.label} <span className="text-xs text-muted-foreground">({k.ayuda})</span></span>
                          <span className="tabular-nums">{euros(Number(c[k.campo]))}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      {c.factura && <>Factura {c.factura}</>}
                      {c.fecha_cobro && <> · cobrado el {new Date(c.fecha_cobro).toLocaleDateString("es-ES")}</>}
                      {Number(c.iva_factura) > 0 && <> · la factura pone IVA {euros(Number(c.iva_factura))} (no se cobra)</>}
                    </p>
                    {c.notas && <p className="text-xs text-gray-600 whitespace-pre-line">{c.notas}</p>}
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setEditando({ fila: c, nuevo: false })}>
                      <Pencil size={14} /> Cambiar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {trimestres.length > 0 && (
        <section className="space-y-2">
          <TituloSeccion color={TMX.naranja} icono={Receipt}>Por trimestres</TituloSeccion>
          <p className="text-xs text-muted-foreground">Trimestres del año natural, como los pide Hacienda.</p>
          <div className="rounded-xl border border-gray-200 bg-white divide-y text-sm">
            <div className="px-3 py-1.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="w-16">Trimestre</span>
              <span className="flex-1" />
              <span className="w-24 text-right">Según factura</span>
              <span className="w-24 text-right">Cobrado</span>
            </div>
            {trimestres.map(({ trimestre: t, totales }) => (
              <div key={t} className="px-3 py-2 flex items-center gap-3">
                <span className="w-16 font-medium text-gray-800">{t}</span>
                <span className="flex-1 text-xs text-muted-foreground">
                  {euros(totales.base)} − IRPF {euros(totales.irpf)}
                  {totales.especie > 0 && <> · en especie {euros(totales.especie)}</>}
                </span>
                <span className="w-24 text-right tabular-nums text-gray-700">{euros(totales.neto)}</span>
                <span className="w-24 text-right font-semibold tabular-nums text-green-700">{euros(totales.cobrado)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <TituloSeccion color={TMX.naranja} icono={HelpCircle}>Para preguntar al gestor</TituloSeccion>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          {DUDAS_GESTOR.map((d) => <li key={d}>{d}</li>)}
        </ul>
        <p className="inline-flex items-center gap-1 text-sm text-gray-600">
          <FolderOpen size={16} /> Consejo: guarda los PDF de cada factura en una carpeta de tu Drive.
        </p>
      </section>

      {editando && (
        <EditarMesDialog inicial={editando.fila} nuevo={editando.nuevo} onCerrar={() => setEditando(null)} onGuardar={guardar} />
      )}
    </div>
  );
}
