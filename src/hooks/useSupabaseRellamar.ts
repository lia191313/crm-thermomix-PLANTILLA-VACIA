import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface RellamarItem {
  contact_id: number;
  fecha_rellamada: string | null;
}

// Caché y canal compartidos a nivel de módulo: TODAS las instancias del hook
// comparten los mismos datos y un único canal de Supabase Realtime.
// Si cada hook creara su propio canal, Supabase devolvía:
//   "cannot add postgres_changes callbacks for realtime:rellamar_changes
//    after subscribe()"
// y crasheaba el componente que lo abriera segundo. Con esta arquitectura,
// el canal se crea UNA VEZ y los componentes se enganchan vía listeners.
let _rellamarCache: RellamarItem[] = [];
const _listeners = new Set<(items: RellamarItem[]) => void>();
let _channelInitialized = false;
let _initialLoadStarted = false;

function notifyListeners(items: RellamarItem[]) {
  _rellamarCache = items;
  _listeners.forEach((fn) => fn(items));
}

async function loadRellamarFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('rellamar')
      .select('contact_id, fecha_rellamada');

    if (error) throw error;
    const items: RellamarItem[] = (data || []).map((r: any) => ({
      contact_id: Number(r.contact_id),
      fecha_rellamada: r.fecha_rellamada || null,
    }));
    notifyListeners(items);
  } catch (error) {
    console.error('Error loading rellamar:', error);
  }
}

function initializeChannelOnce() {
  if (_channelInitialized) return;
  _channelInitialized = true;

  // Realtime: cuando cambia la tabla rellamar (insert/update/delete) refrescamos
  // el caché y todos los componentes suscritos se actualizan automáticamente.
  supabase
    .channel('rellamar_changes_singleton')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rellamar' },
      () => {
        loadRellamarFromSupabase();
      }
    )
    .subscribe();

  // Reaccionar a cambios de sesión: si entra/sale un usuario, recargamos.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      loadRellamarFromSupabase();
    } else {
      notifyListeners([]);
    }
  });
}

export function useSupabaseRellamar() {
  const [rellamarData, setRellamarData] = useState<RellamarItem[]>(_rellamarCache);
  const [loading, setLoading] = useState(_rellamarCache.length === 0 && !_initialLoadStarted);

  const rellamarIds = rellamarData.map((r) => r.contact_id);

  useEffect(() => {
    // Cada instancia del hook se suscribe al caché global.
    const listener = (items: RellamarItem[]) => {
      setRellamarData(items);
      setLoading(false);
    };
    _listeners.add(listener);

    // Inicialización única (canal + carga inicial) la primera vez que se monta
    // CUALQUIER instancia del hook.
    if (!_initialLoadStarted) {
      _initialLoadStarted = true;
      initializeChannelOnce();
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await loadRellamarFromSupabase();
        } else {
          setLoading(false);
        }
      })();
    } else {
      // Si ya estaba cargado, marcamos como no-loading aquí mismo.
      setLoading(false);
    }

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const toggleRellamar = async (
    contactId: number,
    fechaRellamada?: string | null
  ) => {
    try {
      const isMarked = _rellamarCache.some((r) => r.contact_id === contactId);

      if (isMarked) {
        const { error } = await supabase
          .from('rellamar')
          .delete()
          .eq('contact_id', contactId);

        if (error) throw error;
        notifyListeners(_rellamarCache.filter((r) => r.contact_id !== contactId));
      } else {
        const { error } = await supabase
          .from('rellamar')
          .insert([
            { contact_id: contactId, marcado: true, fecha_rellamada: fechaRellamada || null },
          ]);

        if (error) throw error;
        notifyListeners([
          ..._rellamarCache,
          { contact_id: contactId, fecha_rellamada: fechaRellamada || null },
        ]);
      }
    } catch (error) {
      console.error('Error toggling rellamar:', error);
      throw error;
    }
  };

  const esRellamar = (contactId: number) =>
    _rellamarCache.some((r) => r.contact_id === contactId);

  return {
    rellamarIds,
    rellamarData,
    loading,
    toggleRellamar,
    esRellamar,
    loadRellamar: loadRellamarFromSupabase,
  };
}
