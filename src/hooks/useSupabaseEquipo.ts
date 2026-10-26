import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { moverEnEmbudoTras, contactoDeRecluta } from '@/lib/embudoAuto';

export type TipoAgente = 'real' | 'apoyo';
export type EstadoAgente = 'pendiente_firma' | 'activa' | 'caducada';
export type TipoNotaEquipo = 'nota' | 'whatsapp' | 'llamada' | 'venta';

export interface Agente {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  zona: string | null;
  tipo: TipoAgente;
  estado: EstadoAgente;
  fecha_alta: string | null;
  fecha_limite: string | null;
  contacto_id: number | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotaEquipo {
  id: number;
  agente_id: number;
  tipo: TipoNotaEquipo;
  fecha: string;
  notas: string;
}

export type AgenteInput = Omit<Agente, 'id' | 'created_at' | 'updated_at'>;

export function useSupabaseEquipo() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [notas, setNotas] = useState<NotaEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [a, n] = await Promise.all([
        supabase.from('equipo').select('*').order('nombre'),
        supabase.from('equipo_notas').select('*').order('fecha', { ascending: false }),
      ]);
      if (a.error) throw a.error;
      if (n.error) throw n.error;
      setAgentes(a.data || []);
      setNotas(n.data || []);
      setError(null);
    } catch (e) {
      console.error('Error cargando el equipo:', e);
      setError('No se ha podido cargar el equipo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarAgente = useCallback(async (datos: AgenteInput, id?: number) => {
    const ahora = new Date().toISOString();
    const { data, error } = id
      ? await supabase.from('equipo').update({ ...datos, updated_at: ahora }).eq('id', id).select().single()
      : await supabase.from('equipo').insert([datos]).select().single();
    if (error) throw error;
    // Recluta nueva: si tiene ficha en Contactos, pasa sola a "Agente" en el embudo.
    if (!id) await moverEnEmbudoTras(await contactoDeRecluta(data), "recluta");
    setAgentes((prev) =>
      (id ? prev.map((a) => (a.id === id ? data : a)) : [...prev, data]).sort((x, y) =>
        x.nombre.localeCompare(y.nombre, 'es')
      )
    );
    return data as Agente;
  }, []);

  const borrarAgente = useCallback(async (id: number) => {
    const { error } = await supabase.from('equipo').delete().eq('id', id);
    if (error) throw error;
    setAgentes((prev) => prev.filter((a) => a.id !== id));
    setNotas((prev) => prev.filter((n) => n.agente_id !== id));
  }, []);

  // La fecha se guarda en UTC (toISOString), como en interactions.
  const anadirNota = useCallback(async (agenteId: number, tipo: TipoNotaEquipo, texto: string) => {
    const { data, error } = await supabase
      .from('equipo_notas')
      .insert([{ agente_id: agenteId, tipo, notas: texto, fecha: new Date().toISOString() }])
      .select()
      .single();
    if (error) throw error;
    setNotas((prev) => [data, ...prev]);
  }, []);

  const borrarNota = useCallback(async (id: number) => {
    const { error } = await supabase.from('equipo_notas').delete().eq('id', id);
    if (error) throw error;
    setNotas((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { agentes, notas, loading, error, guardarAgente, borrarAgente, anadirNota, borrarNota };
}
