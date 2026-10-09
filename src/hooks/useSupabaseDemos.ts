import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Demo {
  id: number;
  contacto_id: number;
  fecha_demo: string;
  completada: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export function useSupabaseDemos() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDemos();
  }, []);

  const loadDemos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('demos')
        .select('*')
        .order('fecha_demo', { ascending: true });

      if (error) throw error;
      setDemos(data || []);
    } catch (error) {
      console.error('Error loading demos:', error);
    } finally {
      setLoading(false);
    }
  };

  const agregarDemo = useCallback(async (demo: Omit<Demo, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('demos')
        .insert([demo])
        .select();

      if (error) throw error;
      if (data) {
        setDemos([...demos, data[0]]);
      }
    } catch (error) {
      console.error('Error adding demo:', error);
      throw error;
    }
  }, [demos]);

  const actualizarDemo = useCallback(async (id: number, updates: Partial<Demo>) => {
    try {
      const { error } = await supabase
        .from('demos')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setDemos(demos.map(d => d.id === id ? { ...d, ...updates } : d));
    } catch (error) {
      console.error('Error updating demo:', error);
      throw error;
    }
  }, [demos]);

  const eliminarDemo = useCallback(async (id: number) => {
    try {
      const { error } = await supabase
        .from('demos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setDemos(demos.filter(d => d.id !== id));
    } catch (error) {
      console.error('Error deleting demo:', error);
      throw error;
    }
  }, [demos]);

  const getDemosPorContacto = useCallback((contactoId: number) => {
    return demos.filter(d => d.contacto_id === contactoId);
  }, [demos]);

  return {
    demos,
    loading,
    agregarDemo,
    actualizarDemo,
    eliminarDemo,
    getDemosPorContacto,
    loadDemos,
  };
}
