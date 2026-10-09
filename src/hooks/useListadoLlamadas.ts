// Historial de llamadas hechas desde Listados (tabla listado_llamadas).
// Lo usa el Reporte Diario: se ven las del día y se eligen cuáles entran en
// el informe semanal (incluir_en_informe).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface LlamadaListado {
  id: number;
  fecha: string;
  notas: string | null;
  incluir_en_informe: boolean;
  persona: { nombre: string; apellidos: string; telefono: string; poblacion: string } | null;
}

const COLUMNAS = "id,fecha,notas,incluir_en_informe,persona:listado_personas(nombre,apellidos,telefono,poblacion)";

export async function fetchLlamadasListados(desde: Date, hasta: Date): Promise<LlamadaListado[]> {
  const { data, error } = await supabase
    .from("listado_llamadas")
    .select(COLUMNAS)
    .gte("fecha", desde.toISOString())
    .lte("fecha", hasta.toISOString())
    .order("fecha", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LlamadaListado[];
}

export async function marcarIncluirEnInforme(id: number, incluir: boolean) {
  const { error } = await supabase.from("listado_llamadas").update({ incluir_en_informe: incluir }).eq("id", id);
  if (error) throw error;
}

/** Llamadas de listados de un día concreto (hora local). */
export function useLlamadasListadosDelDia(dia: Date) {
  const [llamadas, setLlamadas] = useState<LlamadaListado[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const desde = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, 0, 0, 0);
    const hasta = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 23, 59, 59, 999);
    try {
      setLlamadas(await fetchLlamadasListados(desde, hasta));
      setError(null);
    } catch (err) {
      console.error("Error cargando llamadas de listados:", err);
      setError((err as { message?: string })?.message ?? String(err));
    }
  }, [dia]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarIncluir = async (id: number, incluir: boolean) => {
    await marcarIncluirEnInforme(id, incluir);
    setLlamadas((prev) => prev.map((l) => (l.id === id ? { ...l, incluir_en_informe: incluir } : l)));
  };

  const editarNota = async (id: number, notas: string) => {
    const valor = notas.trim() || null;
    const { error: e } = await supabase.from("listado_llamadas").update({ notas: valor }).eq("id", id);
    if (e) throw e;
    setLlamadas((prev) => prev.map((l) => (l.id === id ? { ...l, notas: valor } : l)));
  };

  return { llamadas, error, cambiarIncluir, editarNota, recargar: cargar };
}
