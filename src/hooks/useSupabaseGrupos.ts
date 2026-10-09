import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Grupo {
  id: number;
  nombre: string;
  descripcion: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export function useSupabaseGrupos() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGrupos();
  }, []);

  const loadGrupos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('grupos')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setGrupos(data || []);
    } catch (error) {
      console.error('Error loading grupos:', error);
    } finally {
      setLoading(false);
    }
  };

  const agregarGrupo = useCallback(async (grupo: Omit<Grupo, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('grupos')
        .insert([grupo])
        .select();

      if (error) throw error;
      if (data) {
        setGrupos([...grupos, data[0]]);
      }
    } catch (error) {
      console.error('Error adding grupo:', error);
      throw error;
    }
  }, [grupos]);

  const actualizarGrupo = useCallback(async (id: number, updates: Partial<Grupo>) => {
    try {
      const { error } = await supabase
        .from('grupos')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setGrupos(grupos.map(g => g.id === id ? { ...g, ...updates } : g));
    } catch (error) {
      console.error('Error updating grupo:', error);
      throw error;
    }
  }, [grupos]);

  const eliminarGrupo = useCallback(async (id: number) => {
    try {
      const { error } = await supabase
        .from('grupos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setGrupos(grupos.filter(g => g.id !== id));
    } catch (error) {
      console.error('Error deleting grupo:', error);
      throw error;
    }
  }, [grupos]);

  const agregarContactoAGrupo = useCallback(async (contactoId: number, grupoId: number) => {
    try {
      const { error } = await supabase
        .from('contacto_grupos')
        .insert([{ contacto_id: contactoId, grupo_id: grupoId }]);

      if (error) throw error;
    } catch (error) {
      console.error('Error adding contacto to grupo:', error);
      throw error;
    }
  }, []);

  const eliminarContactoDelGrupo = useCallback(async (contactoId: number, grupoId: number) => {
    try {
      const { error } = await supabase
        .from('contacto_grupos')
        .delete()
        .eq('contacto_id', contactoId)
        .eq('grupo_id', grupoId);

      if (error) throw error;
    } catch (error) {
      console.error('Error removing contacto from grupo:', error);
      throw error;
    }
  }, []);

  const getGruposDelContacto = useCallback(async (contactoId: number) => {
    try {
      const { data, error } = await supabase
        .from('contacto_grupos')
        .select('grupo_id')
        .eq('contacto_id', contactoId);

      if (error) throw error;
      return (data || []).map(cg => cg.grupo_id);
    } catch (error) {
      console.error('Error getting grupos for contacto:', error);
      return [];
    }
  }, []);

  return {
    grupos,
    loading,
    agregarGrupo,
    actualizarGrupo,
    eliminarGrupo,
    agregarContactoAGrupo,
    eliminarContactoDelGrupo,
    getGruposDelContacto,
    loadGrupos,
  };
}
