import { useState, useEffect } from 'react';
import { alVolverALaApp } from "@/lib/alVolver";
import { supabase } from '@/lib/supabase';

export interface SupabaseContact {
  id: number;
  nombre: string;
  telefono: string;
  ubicacion: string;
  modelo: string;
  intereses: string[];
  notas: string;
  zona_playa: boolean;
  sin_contactar: boolean;
  /** Me tiene guardada en el móvil: le llegan las listas de difusión. */
  recibe_difusion?: boolean;
  origen?: string | null;
  estado_lead?: string | null;
  /** Ficha de quien le recomendó esta persona (21/10/2026). */
  recomendada_por?: number | null;
  created_at: string;
  updated_at: string;
}

export function useSupabaseContacts() {
  const [contacts, setContacts] = useState<SupabaseContact[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar contactos al montar y cuando cambie la sesión
  useEffect(() => {
    const checkUserAndLoad = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await loadContacts();
      } else {
        setLoading(false);
      }
    };
    
    checkUserAndLoad();
    
    // Escuchar cambios de auth para recargar si es necesario
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadContacts();
      } else {
        setContacts([]);
        setLoading(false);
      }
    });

    // Al volver a la ventana, recargar sin spinner (por si se cambiaron desde otro sitio).
    const quitarAlVolver = alVolverALaApp(() => loadContacts(true));

    return () => {
      subscription.unsubscribe();
      quitarAlVolver();
    };
  }, []);

  const loadContacts = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id,nombre,telefono,ubicacion,modelo,intereses,notas,zona_playa,sin_contactar,recibe_difusion,origen,estado_lead,recomendada_por,created_at,updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const addContact = async (contact: Omit<SupabaseContact, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .insert([contact])
        .select()
        .single();

      if (error) throw error;
      setContacts([data, ...contacts]);
      return data;
    } catch (error) {
      console.error('Error adding contact:', error);
      throw error;
    }
  };

  const updateContact = async (id: number, updates: Partial<SupabaseContact>) => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('contacts')
        .update({ ...updates, updated_at: now })
        .eq('id', id);

      if (error) throw error;
      // Actualizar estado local directamente sin depender del select
      setContacts(prev => prev.map(c =>
        c.id === id ? { ...c, ...updates, updated_at: now } : c
      ));
      return { id, ...updates, updated_at: now } as SupabaseContact;
    } catch (error) {
      console.error('Error updating contact:', error);
      throw error;
    }
  };

  /** Marca o desmarca de golpe "me tiene guardada" en varios contactos. */
  const marcarRecibeDifusion = async (ids: number[], valor: boolean) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('contacts')
      .update({ recibe_difusion: valor })
      .in('id', ids);
    if (error) {
      console.error('Error marcando recibe_difusion:', error);
      throw error;
    }
    const set = new Set(ids);
    setContacts(prev => prev.map(c => (set.has(c.id) ? { ...c, recibe_difusion: valor } : c)));
  };

  const deleteContact = async (id: number) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setContacts(contacts.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting contact:', error);
      throw error;
    }
  };

  return {
    contacts,
    loading,
    addContact,
    updateContact,
    deleteContact,
    marcarRecibeDifusion,
    loadContacts,
  };
}
