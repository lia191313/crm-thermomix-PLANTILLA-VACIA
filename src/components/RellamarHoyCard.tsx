import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { fechaISO, FRANJA_LABEL, pedirFiltroInicialListados } from "@/lib/listados";

/**
 * Aviso del Dashboard: cuántas personas de los listados toca volver a llamar
 * hoy (o se pasó el día). Solo aparece si hay alguna.
 */
export default function RellamarHoyCard({ onAbrir }: { onAbrir: () => void }) {
  const [cuenta, setCuenta] = useState<{ total: number; manana: number; tarde: number } | null>(null);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("listado_personas")
      .select("franja")
      .eq("estado", "pendiente")
      .lte("rellamar_el", fechaISO())
      .then(({ data, error }) => {
        if (cancelado || error || !data) return;
        setCuenta({
          total: data.length,
          manana: data.filter((p) => p.franja === "manana").length,
          tarde: data.filter((p) => p.franja === "tarde").length,
        });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (!cuenta || cuenta.total === 0) return null;

  const detalle = [
    cuenta.manana > 0 && `${cuenta.manana} ${FRANJA_LABEL.manana.toLowerCase()}`,
    cuenta.tarde > 0 && `${cuenta.tarde} ${FRANJA_LABEL.tarde.toLowerCase()}`,
  ].filter(Boolean).join(" · ");

  return (
    <Card className="p-4 border-l-4 border-l-gray-300 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 rounded-full text-gray-600"><Phone size={18} /></div>
        <div>
          <p className="font-semibold text-gray-800">
            Hoy tienes {cuenta.total} {cuenta.total === 1 ? "persona" : "personas"} del listado para volver a llamar
          </p>
          {detalle && <p className="text-sm text-gray-600">{detalle}</p>}
        </div>
      </div>
      <Button
        onClick={() => {
          pedirFiltroInicialListados("rellamar");
          onAbrir();
        }}
      >
        Ver a quién llamar
      </Button>
    </Card>
  );
}
