import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Anotacion {
  id: string;
  contacto_id: number;
  texto: string;
  created_at?: string;
  updated_at?: string;
}

export function useSupabaseAnotaciones() {
  const [anotaciones, setAnotaciones] = useState<Anotacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnotaciones();
  }, []);

  const loadAnotaciones = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('anotaciones')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const anotacionesFormateadas = (data || []).map(a => ({
        id: a.id.toString(),
        contacto_id: a.contacto_id,
        texto: a.texto,
        created_at: a.created_at,
        updated_at: a.updated_at,
      }));
      
      setAnotaciones(anotacionesFormateadas);
    } catch (error) {
      console.error('Error loading anotaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const addAnotacion = useCallback(async (contactoId: number, texto: string) => {
    try {
      const { data, error } = await supabase
        .from('anotaciones')
        .insert([{
          contacto_id: contactoId,
          texto,
        }])
        .select()
        .single();

      if (error) throw error;
      
      const newAnotacion: Anotacion = {
        id: data.id.toString(),
        contacto_id: data.contacto_id,
        texto: data.texto,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      
      setAnotaciones([newAnotacion, ...anotaciones]);
      return newAnotacion;
    } catch (error) {
      console.error('Error adding anotacion:', error);
      throw error;
    }
  }, [anotaciones]);

  const updateAnotacion = useCallback(async (id: string, texto: string) => {
    try {
      const { data, error } = await supabase
        .from('anotaciones')
        .update({
          texto,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) throw error;
      
      setAnotaciones(anotaciones.map(a => a.id === id ? {
        ...a,
        texto: data.texto,
        updated_at: data.updated_at,
      } : a));
      
      return data;
    } catch (error) {
      console.error('Error updating anotacion:', error);
      throw error;
    }
  }, [anotaciones]);

  const deleteAnotacion = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('anotaciones')
        .delete()
        .eq('id', parseInt(id));

      if (error) throw error;
      setAnotaciones(anotaciones.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting anotacion:', error);
      throw error;
    }
  }, [anotaciones]);

  const getAnotacionesPorContacto = useCallback((contactoId: number) => {
    return anotaciones.filter(a => a.contacto_id === contactoId);
  }, [anotaciones]);

  return {
    anotaciones,
    loading,
    addAnotacion,
    updateAnotacion,
    deleteAnotacion,
    getAnotacionesPorContacto,
    loadAnotaciones,
  };
}
