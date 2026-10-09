import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface SupabaseLead {
  id: number;
  nombre: string;
  alias?: string | null;
  telefono?: string | null;
  plataforma: string;
  estado: string;
  enlace_anuncio?: string | null;
  notas?: string | null;
  created_at: string;
  updated_at: string;
}

export function useSupabaseLeads() {
  const [leads, setLeads] = useState<SupabaseLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUserAndLoad = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await loadLeads();
      } else {
        setLoading(false);
      }
    };

    checkUserAndLoad();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadLeads();
      } else {
        setLeads([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads_redes')
        .select('id,nombre,alias,telefono,plataforma,estado,enlace_anuncio,notas,created_at,updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error loading leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const addLead = async (lead: Omit<SupabaseLead, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('leads_redes')
        .insert([lead])
        .select()
        .single();

      if (error) throw error;
      setLeads([data, ...leads]);
      return data;
    } catch (error) {
      console.error('Error adding lead:', error);
      throw error;
    }
  };

  const updateLead = async (id: number, updates: Partial<Omit<SupabaseLead, 'id' | 'created_at'>>) => {
    try {
      const { data, error } = await supabase
        .from('leads_redes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setLeads(leads.map(l => l.id === id ? data : l));
      return data;
    } catch (error) {
      console.error('Error updating lead:', error);
      throw error;
    }
  };

  const deleteLead = async (id: number) => {
    try {
      const { error } = await supabase
        .from('leads_redes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setLeads(leads.filter(l => l.id !== id));
    } catch (error) {
      console.error('Error deleting lead:', error);
      throw error;
    }
  };

  return {
    leads,
    loading,
    addLead,
    updateLead,
    deleteLead,
    loadLeads,
  };
}
