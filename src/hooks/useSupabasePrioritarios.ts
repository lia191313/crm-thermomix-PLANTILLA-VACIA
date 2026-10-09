import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useSupabasePrioritarios() {
  const [prioritarios, setPrioritarios] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrioritarios();
  }, []);

  const loadPrioritarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prioritarios')
        .select('contacto_id');

      if (error) throw error;
      
      const contactoIds = (data || []).map(p => p.contacto_id);
      setPrioritarios(contactoIds);
    } catch (error) {
      console.error('Error loading prioritarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePrioritario = useCallback(async (contactoId: number) => {
    try {
      const esPrioritario = prioritarios.includes(contactoId);
      
      if (esPrioritario) {
        // Eliminar prioritario
        const { error } = await supabase
          .from('prioritarios')
          .delete()
          .eq('contacto_id', contactoId);

        if (error) throw error;
        setPrioritarios(prioritarios.filter(id => id !== contactoId));
      } else {
        // Agregar prioritario
        const { error } = await supabase
          .from('prioritarios')
          .insert([{ contacto_id: contactoId }]);

        if (error) throw error;
        setPrioritarios([...prioritarios, contactoId]);
      }
    } catch (error) {
      console.error('Error toggling prioritario:', error);
      throw error;
    }
  }, [prioritarios]);

  const esPrioritario = useCallback((contactoId: number) => {
    return prioritarios.includes(contactoId);
  }, [prioritarios]);

  return {
    prioritarios,
    loading,
    togglePrioritario,
    esPrioritario,
    loadPrioritarios,
  };
}
