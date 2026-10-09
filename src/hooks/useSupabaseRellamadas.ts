import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useSupabaseRellamadas() {
  const [rellamadas, setRellamadas] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRellamadas();
  }, []);

  const loadRellamadas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rellamadas')
        .select('contacto_id');

      if (error) throw error;
      
      const contactoIds = (data || []).map(r => r.contacto_id);
      setRellamadas(contactoIds);
    } catch (error) {
      console.error('Error loading rellamadas:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRellamada = useCallback(async (contactoId: number) => {
    try {
      const esRellamada = rellamadas.includes(contactoId);
      
      if (esRellamada) {
        // Eliminar rellamada
        const { error } = await supabase
          .from('rellamadas')
          .delete()
          .eq('contacto_id', contactoId);

        if (error) throw error;
        setRellamadas(rellamadas.filter(id => id !== contactoId));
      } else {
        // Agregar rellamada
        const { error } = await supabase
          .from('rellamadas')
          .insert([{ contacto_id: contactoId }]);

        if (error) throw error;
        setRellamadas([...rellamadas, contactoId]);
      }
    } catch (error) {
      console.error('Error toggling rellamada:', error);
      throw error;
    }
  }, [rellamadas]);

  const isRellamada = useCallback((contactoId: number) => {
    return rellamadas.includes(contactoId);
  }, [rellamadas]);

  return {
    rellamadas,
    loading,
    toggleRellamada,
    isRellamada,
    loadRellamadas,
  };
}
