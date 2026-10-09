import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface SupabaseInteraction {
  id: number;
  contact_id: number;
  tipo: "llamada" | "whatsapp" | "difusion" | "nota" | "rellamar";
  notas: string;
  fecha: string;
}

/**
 * La columna `fecha` es "timestamp sin zona" y la app la guarda con
 * toISOString() (hora UTC). Al leerla sin la "Z" el navegador la tomaba como
 * hora española y todo salía 2 horas antes. La marcamos como UTC al leer.
 */
export function fechaComoUTC(fecha: string): string {
  if (!fecha || /([zZ]|[+-]\d{2}:?\d{2})$/.test(fecha) || !fecha.includes('T')) return fecha;
  return `${fecha}Z`;
}

const normalizar = (i: SupabaseInteraction): SupabaseInteraction => ({ ...i, fecha: fechaComoUTC(i.fecha) });

export function useSupabaseInteractions(contactId?: number) {
  const [interactions, setInteractions] = useState<SupabaseInteraction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInteractions = useCallback(async () => {
    try {
      let query = supabase
        .from('interactions')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(10000);

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setInteractions((data || []).map(normalizar));
    } catch (error) {
      console.error('Error loading interactions:', error);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    const checkUserAndLoad = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await loadInteractions();
      } else {
        setLoading(false);
      }
    };
    
    checkUserAndLoad();
    
    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadInteractions();
      } else {
        setInteractions([]);
        setLoading(false);
      }
    });

    // Suscribirse a cambios en tiempo real
    // Se usa un nombre de canal único por instancia para evitar el error
    // "cannot add postgres_changes callbacks after subscribe()" cuando hay
    // varias instancias del hook activas al mismo tiempo.
    const channelName = `interactions_changes_${contactId ?? 'all'}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, () => {
        loadInteractions();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [loadInteractions]);

  const addInteraction = async (
    cId: number,
    tipo: "llamada" | "whatsapp" | "difusion" | "nota" | "rellamar",
    descripcion: string,
    fecha?: Date
  ) => {
    try {
      const fechaRegistro = fecha || new Date();
      const { data, error } = await supabase
        .from('interactions')
        .insert([{
          contact_id: cId,
          tipo,
          notas: descripcion,
          fecha: fechaRegistro.toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      
      // Actualizar estado local si es para este contacto
      if (!contactId || contactId === cId) {
        setInteractions(prev => [normalizar(data), ...prev]);
      }
      
      return normalizar(data);
    } catch (error) {
      console.error('Error adding interaction:', error);
      throw error;
    }
  };

  const updateInteraction = async (id: number, descripcion: string) => {
    try {
      const { data, error } = await supabase
        .from('interactions')
        .update({ notas: descripcion })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setInteractions(prev => prev.map(i => (i.id === id ? normalizar(data) : i)));
      return data;
    } catch (error) {
      console.error('Error updating interaction:', error);
      throw error;
    }
  };

  const deleteInteraction = async (id: number) => {
    try {
      const { error } = await supabase
        .from('interactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setInteractions(prev => prev.filter(i => i.id !== id));
    } catch (error) {
      console.error('Error deleting interaction:', error);
      throw error;
    }
  };

  return {
    interactions,
    loading,
    addInteraction,
    updateInteraction,
    deleteInteraction,
    loadInteractions
  };
}
