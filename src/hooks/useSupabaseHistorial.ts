import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface HistorialLlamada {
  id: string;
  contacto_id: number;
  tipo: string;
  descripcion: string;
  fecha: string;
  created_at?: string;
}

export function useSupabaseHistorial() {
  const [historial, setHistorial] = useState<HistorialLlamada[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistorial();
  }, []);

  const loadHistorial = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('historial_llamadas')
        .select('*')
        .order('fecha', { ascending: false });

      if (error) throw error;
      
      const historialFormateado = (data || []).map(h => ({
        id: h.id.toString(),
        contacto_id: h.contacto_id,
        tipo: h.tipo,
        descripcion: h.descripcion || '',
        fecha: h.fecha,
        created_at: h.created_at,
      }));
      
      setHistorial(historialFormateado);
    } catch (error) {
      console.error('Error loading historial:', error);
    } finally {
      setLoading(false);
    }
  };

  const addHistorial = useCallback(async (contactoId: number, tipo: string, descripcion: string) => {
    try {
      const { data, error } = await supabase
        .from('historial_llamadas')
        .insert([{
          contacto_id: contactoId,
          tipo,
          descripcion,
          fecha: new Date().toISOString(),
        }])
        .select()
        .single();

      if (error) throw error;
      
      const newHistorial: HistorialLlamada = {
        id: data.id.toString(),
        contacto_id: data.contacto_id,
        tipo: data.tipo,
        descripcion: data.descripcion,
        fecha: data.fecha,
        created_at: data.created_at,
      };
      
      setHistorial([newHistorial, ...historial]);
      return newHistorial;
    } catch (error) {
      console.error('Error adding historial:', error);
      throw error;
    }
  }, [historial]);

  const getHistorialPorContacto = useCallback((contactoId: number) => {
    return historial.filter(h => h.contacto_id === contactoId);
  }, [historial]);

  return {
    historial,
    loading,
    addHistorial,
    getHistorialPorContacto,
    loadHistorial,
  };
}
