import { useState } from "react";
import { Gift, Plus, ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CabeceraFormacion, TituloSeccion, TMX } from "@/components/EstiloFormacion";
import { TarjetaPromo, NOMBRE_TIPO } from "@/components/Promociones";
import { useSupabasePromociones, reducirImagen, type PromocionNueva } from "@/hooks/useSupabasePromociones";
import { repartirPromos, type Promocion, type TipoPromo } from "@/lib/promociones";

// Pestaña "Promociones" (22/10/2026): las promos de venta y de reclutamiento del
// momento. Cambian cada semana, cada 15 días o cada mes, así que cada una lleva
// fechas y se ordena sola; las caducadas pasan a "Anteriores" y se pueden repetir.

const VACIA: PromocionNueva = { tipo: "venta", titulo: "", desde: null, hasta: null, resumen: null, detalles: null, whatsapp: null, imagen: null };

function EditarPromoDialog({
  inicial, id, onCerrar, onGuardar, onBorrar,
}: {
  inicial: PromocionNueva;
  id?: number;
  onCerrar: () => void;
  onGuardar: (p: PromocionNueva, id?: number) => Promise<void>;
  onBorrar: (id: number) => Promise<void>;
}) {
  const [form, setForm] = useState<PromocionNueva>(inicial);
  const [guardando, setGuardando] = useState(false);
  const campo = <K extends keyof PromocionNueva>(k: K, v: PromocionNueva[K]) => setForm((f) => ({ ...f, [k]: v }));
  const texto = (v: string) => (v.trim() ? v : null);

  const subirFoto = async (archivo?: File) => {
    if (!archivo) return;
    try {
      campo("imagen", await reducirImagen(archivo));
    } catch {
      toast.error("No se pudo leer la foto");
    }
  };

  const guardar = async () => {
    if (!form.titulo.trim()) {
      toast.error("Ponle un título");
      return;
    }
    if (form.desde && form.hasta && form.hasta < form.desde) {
      toast.error("La fecha de final es antes que la de inicio");
      return;
    }
    setGuardando(true);
    try {
      await onGuardar({ ...form, titulo: form.titulo.trim() }, id);
      toast.success("Promoción guardada 🎁");
      onCerrar();
    } catch (e) {
      console.error("Error guardando la promoción:", e);
      toast.error("No se pudo guardar");
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!id || !window.confirm(`¿Borrar "${form.titulo}"? Si solo ha caducado, no hace falta: pasa sola a Anteriores.`)) return;
    try {
      await onBorrar(id);
      toast.success("Promoción borrada");
      onCerrar();
    } catch {
      toast.error("No se pudo borrar");
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{id ? "Cambiar promoción" : "Nueva promoción"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["venta", "reclutamiento"] as TipoPromo[]).map((t) => (
              <Button
                key={t}
                type="button"
                variant={form.tipo === t ? "default" : "outline"}
                style={form.tipo === t ? { backgroundColor: TMX.naranja } : undefined}
                onClick={() => campo("tipo", t)}
              >
                {NOMBRE_TIPO[t]}
              </Button>
            ))}
          </div>
          <label className="block space-y-1 text-sm font-medium text-gray-700">
            <span>Título</span>
            <Input value={form.titulo} onChange={(e) => campo("titulo", e.target.value)} placeholder="Ej.: Truco o trato" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Desde</span>
              <Input type="date" value={form.desde ?? ""} onChange={(e) => campo("desde", e.target.value || null)} />
            </label>
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Hasta (incluido)</span>
              <Input type="date" value={form.hasta ?? ""} onChange={(e) => campo("hasta", e.target.value || null)} />
            </label>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">Sin «Hasta», se queda siempre (por ejemplo, el precio normal de la TM7).</p>
          <label className="block space-y-1 text-sm font-medium text-gray-700">
            <span>Qué decir por teléfono</span>
            <Textarea rows={3} value={form.resumen ?? ""} onChange={(e) => campo("resumen", texto(e.target.value))} placeholder="2 o 3 frases cortas" />
          </label>
          <label className="block space-y-1 text-sm font-medium text-gray-700">
            <span>Condiciones (letra pequeña)</span>
            <Textarea rows={4} value={form.detalles ?? ""} onChange={(e) => campo("detalles", texto(e.target.value))} placeholder="Cuotas, entrada, requisitos…" />
          </label>
          <label className="block space-y-1 text-sm font-medium text-gray-700">
            <span>Texto para WhatsApp</span>
            <Textarea rows={4} value={form.whatsapp ?? ""} onChange={(e) => campo("whatsapp", texto(e.target.value))} />
          </label>
          <div className="space-y-1 text-sm font-medium text-gray-700">
            <span>Foto del folleto</span>
            {form.imagen ? (
              <div className="flex items-center gap-3">
                <img src={form.imagen} alt="" className="h-20 rounded border object-contain" />
                <Button variant="ghost" size="sm" onClick={() => campo("imagen", null)}>Quitar foto</Button>
              </div>
            ) : (
              <Input type="file" accept="image/*" onChange={(e) => subirFoto(e.target.files?.[0])} />
            )}
          </div>
        </div>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          {id ? (
            <Button variant="ghost" className="gap-1 text-red-600" onClick={borrar}><Trash2 className="h-4 w-4" /> Borrar</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
            <Button className="text-white" style={{ backgroundColor: TMX.verde }} disabled={guardando} onClick={guardar}>Guardar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListaDeTipo({
  promos, onEditar, onRepetir,
}: {
  promos: Promocion[];
  onEditar: (p: Promocion) => void;
  onRepetir: (p: Promocion) => void;
}) {
  const [verAnteriores, setVerAnteriores] = useState(false);
  const { vigentes, proximas, anteriores } = repartirPromos(promos);

  return (
    <div className="space-y-5">
      {vigentes.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No hay ninguna en vigor ahora mismo.</p>
      ) : (
        <div className="space-y-3">{vigentes.map((p) => <TarjetaPromo key={p.id} promo={p} onEditar={() => onEditar(p)} />)}</div>
      )}

      {proximas.length > 0 && (
        <div className="space-y-2">
          <TituloSeccion color={TMX.azul} icono={Gift}>Próximas</TituloSeccion>
          {proximas.map((p) => <TarjetaPromo key={p.id} promo={p} onEditar={() => onEditar(p)} />)}
        </div>
      )}

      {anteriores.length > 0 && (
        <div className="space-y-2">
          <button className="flex items-center gap-1 text-sm font-medium text-muted-foreground" onClick={() => setVerAnteriores((v) => !v)}>
            Anteriores ({anteriores.length}) <ChevronDown className={`h-4 w-4 transition-transform ${verAnteriores ? "rotate-180" : ""}`} />
          </button>
          {verAnteriores && anteriores.map((p) => (
            <TarjetaPromo key={p.id} promo={p} apagada onEditar={() => onEditar(p)} onRepetir={() => onRepetir(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Promociones() {
  const { promos, loading, error, guardar, borrar } = useSupabasePromociones();
  const [tipo, setTipo] = useState<TipoPromo>("venta");
  const [editando, setEditando] = useState<{ inicial: PromocionNueva; id?: number } | null>(null);

  const abrirNueva = () => setEditando({ inicial: { ...VACIA, tipo } });
  const abrirEdicion = (p: Promocion) => {
    const { id, ...resto } = p;
    setEditando({ inicial: resto, id });
  };
  // "Repetir": la misma promo como nueva, sin fechas para ponerle las de ahora.
  const repetir = (p: Promocion) => {
    const { id: _id, ...resto } = p;
    setEditando({ inicial: { ...resto, desde: null, hasta: null } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CabeceraFormacion icono={Gift} titulo="Promociones" subtitulo="Las del momento, para tenerlas a mano al llamar" />
        <Button className="gap-2 text-white" style={{ backgroundColor: TMX.verde }} onClick={abrirNueva}>
          <Plus className="h-4 w-4" /> Nueva promoción
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-muted-foreground">Cargando…</p>
      ) : error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : (
        <Tabs value={tipo} onValueChange={(v) => setTipo(v as TipoPromo)}>
          <TabsList className="grid w-full grid-cols-2">
            {(["venta", "reclutamiento"] as TipoPromo[]).map((t) => (
              <TabsTrigger key={t} value={t}>{NOMBRE_TIPO[t]}</TabsTrigger>
            ))}
          </TabsList>
          {(["venta", "reclutamiento"] as TipoPromo[]).map((t) => (
            <TabsContent key={t} value={t} className="mt-4">
              <ListaDeTipo promos={promos.filter((p) => p.tipo === t)} onEditar={abrirEdicion} onRepetir={repetir} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {editando && (
        <EditarPromoDialog
          inicial={editando.inicial}
          id={editando.id}
          onCerrar={() => setEditando(null)}
          onGuardar={guardar}
          onBorrar={borrar}
        />
      )}
    </div>
  );
}
