import { useState } from "react";
import { Gift, Copy, ChevronDown, Pencil, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TMX } from "@/components/EstiloFormacion";
import { useSupabasePromociones } from "@/hooks/useSupabasePromociones";
import { avisoFinal, repartirPromos, textoFechas, type Promocion, type TipoPromo } from "@/lib/promociones";

// Piezas de "Promociones" que se usan en la pestaña y en el botón 🎁 Promos
// de Listados y Mi día (22/10/2026).

export const NOMBRE_TIPO: Record<TipoPromo, string> = { venta: "Venta", reclutamiento: "Reclutamiento" };

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado. Pégalo en WhatsApp ✅");
  } catch {
    toast.error("No se pudo copiar");
  }
}

/** Una promoción: lo que decir por teléfono a la vista; condiciones y foto plegadas. */
export function TarjetaPromo({
  promo, onEditar, onRepetir, apagada = false,
}: {
  promo: Promocion;
  onEditar?: () => void;
  onRepetir?: () => void;
  apagada?: boolean;
}) {
  const [verCondiciones, setVerCondiciones] = useState(false);
  const [verFoto, setVerFoto] = useState(false);
  const aviso = apagada ? null : avisoFinal(promo);

  return (
    <div className={`rounded-xl border bg-white p-3 sm:p-4 space-y-2 ${apagada ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 leading-tight">{promo.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {textoFechas(promo)}
            {aviso && <span className="ml-2 font-semibold text-red-600">· {aviso}</span>}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {onRepetir && (
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={onRepetir} title="Volver a usarla con otras fechas">
              <Repeat className="h-4 w-4" /> Repetir
            </Button>
          )}
          {onEditar && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEditar} title="Cambiar">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3">
        {promo.resumen && <p className="min-w-0 flex-1 whitespace-pre-line text-gray-800">{promo.resumen}</p>}
        {promo.imagen && (
          <button className="shrink-0" onClick={() => setVerFoto(true)} title="Ver el folleto en grande">
            <img src={promo.imagen} alt="" className="h-20 w-20 rounded-lg border object-cover sm:h-24 sm:w-24" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {promo.detalles && (
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setVerCondiciones((v) => !v)}>
            Condiciones <ChevronDown className={`h-4 w-4 transition-transform ${verCondiciones ? "rotate-180" : ""}`} />
          </Button>
        )}
        {promo.imagen && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => setVerFoto(true)}>Ver folleto</Button>
        )}
        {promo.whatsapp && (
          <Button size="sm" className="h-8 gap-1 text-white" style={{ backgroundColor: TMX.verde }} onClick={() => copiar(promo.whatsapp!)}>
            <Copy className="h-4 w-4" /> Copiar para WhatsApp
          </Button>
        )}
      </div>

      {verCondiciones && promo.detalles && (
        <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{promo.detalles}</p>
      )}

      {promo.imagen && verFoto && <VisorFoto src={promo.imagen} titulo={promo.titulo} onCerrar={() => setVerFoto(false)} />}
    </div>
  );
}

/** Foto del folleto a pantalla completa; tocándola se amplía para leer la letra pequeña. */
function VisorFoto({ src, titulo, onCerrar }: { src: string; titulo: string; onCerrar: () => void }) {
  const [ampliada, setAmpliada] = useState(false);
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="flex h-[95vh] w-[98vw] max-w-[98vw] flex-col gap-2 p-2 sm:p-3">
        <DialogHeader>
          <DialogTitle className="pr-8 text-sm sm:text-base">{titulo}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {ampliada ? "Toca la foto para verla entera · desliza para moverte" : "Toca la foto para ampliarla"}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded bg-gray-50">
          <img
            src={src}
            alt={titulo}
            onClick={() => setAmpliada((a) => !a)}
            className={ampliada ? "max-w-none cursor-zoom-out" : "h-full w-full cursor-zoom-in object-contain"}
            style={ampliada ? { width: "220%" } : undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Las promos en vigor de un tipo, para consultarlas rápido durante una llamada. */
function VigentesDeTipo({ promos, tipo }: { promos: Promocion[]; tipo: TipoPromo }) {
  const { vigentes } = repartirPromos(promos.filter((p) => p.tipo === tipo));
  if (vigentes.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No hay promociones de {NOMBRE_TIPO[tipo].toLowerCase()} en vigor.</p>;
  }
  return <div className="space-y-3">{vigentes.map((p) => <TarjetaPromo key={p.id} promo={p} />)}</div>;
}

/** Botón 🎁 Promos: abre las promociones en vigor por encima, sin salir de la pantalla. */
export function BotonPromos({ className = "" }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variant="outline" className={`gap-2 ${className}`} onClick={() => setAbierto(true)}>
        <Gift className="h-4 w-4" style={{ color: TMX.naranja }} /> Promos
      </Button>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" style={{ color: TMX.naranja }} /> Promociones en vigor
            </SheetTitle>
          </SheetHeader>
          {abierto && <PanelPromos />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PanelPromos() {
  const { promos, loading, error } = useSupabasePromociones();
  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>;
  if (error) return <p className="py-6 text-center text-sm text-red-600">{error}</p>;
  return (
    <Tabs defaultValue="venta" className="mt-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="venta">Venta</TabsTrigger>
        <TabsTrigger value="reclutamiento">Reclutamiento</TabsTrigger>
      </TabsList>
      <TabsContent value="venta" className="mt-3"><VigentesDeTipo promos={promos} tipo="venta" /></TabsContent>
      <TabsContent value="reclutamiento" className="mt-3"><VigentesDeTipo promos={promos} tipo="reclutamiento" /></TabsContent>
    </Tabs>
  );
}
