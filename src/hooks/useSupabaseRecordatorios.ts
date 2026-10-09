import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Recordatorio {
  id: number;
  contacto_id: number;
  descripcion: string;
  fecha: string;
  completado: boolean;
  created_at: string;
  updated_at: string;
}

export function useSupabaseRecordatorios() {
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecordatorios();
  }, []);

  const loadRecordatorios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('recordatorios')
        .select('*')
        .order('fecha', { ascending: true });

      if (error) throw error;
      setRecordatorios(data || []);
    } catch (error) {
      console.error('Error loading recordatorios:', error);
    } finally {
      setLoading(false);
    }
  };

  const agregarRecordatorio = useCallback(async (recordatorio: Omit<Recordatorio, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('recordatorios')
        .insert([recordatorio])
        .select();

      if (error) throw error;
      if (data) {
        setRecordatorios([...recordatorios, data[0]]);
      }
    } catch (error) {
      console.error('Error adding recordatorio:', error);
      throw error;
    }
  }, [recordatorios]);

  const actualizarRecordatorio = useCallback(async (id: number, updates: Partial<Recordatorio>) => {
    try {
      const { error } = await supabase
        .from('recordatorios')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setRecordatorios(recordatorios.map(r => r.id === id ? { ...r, ...updates } : r));
    } catch (error) {
      console.error('Error updating recordatorio:', error);
      throw error;
    }
  }, [recordatorios]);

  const eliminarRecordatorio = useCallback(async (id: number) => {
    try {
      const { error } = await supabase
        .from('recordatorios')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRecordatorios(recordatorios.filter(r => r.id !== id));
    } catch (error) {
      console.error('Error deleting recordatorio:', error);
      throw error;
    }
  }, [recordatorios]);

  return {
    recordatorios,
    loading,
    agregarRecordatorio,
    actualizarRecordatorio,
    eliminarRecordatorio,
    loadRecordatorios,
  };
}
