import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ComisionMes } from "@/lib/comisiones";

// Facturas mensuales de comisiones (tabla `comisiones`, supabase/crear_comisiones.sql).

export function useSupabaseComisiones() {
  const [meses, setMeses] = useState<ComisionMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from("comisiones").select("*").order("mes", { ascending: false });
    if (e) {
      console.error("Error cargando comisiones:", e);
      setError("No se pudieron cargar las comisiones.");
    } else {
      setMeses((data ?? []) as ComisionMes[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async (fila: ComisionMes) => {
    const { error: e } = await supabase.from("comisiones").upsert([{ ...fila, updated_at: new Date().toISOString() }]);
    if (e) throw e;
    await cargar();
  };

  return { meses, loading, error, guardar };
}
