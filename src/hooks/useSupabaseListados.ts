import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { nombreCompleto, normalizarTelefono, type EstadoPersona, type FilaListado, type ClienteBasico } from '@/lib/listados';

export interface Listado {
  id: number;
  nombre: string;
  created_at: string;
}

export interface PersonaListado {
  id: number;
  listado_id: number | null;
  nombre: string;
  apellidos: string;
  telefono: string;
  poblacion: string;
  estado: EstadoPersona;
  notas: string | null;
  llamadas: number;
  ultima_llamada: string | null;
  contact_id: number | null;
  /** Día en que toca volver a llamar (AAAA-MM-DD) o null. */
  rellamar_el: string | null;
  /** Mejor llamarla por la mañana o por la tarde (null = cualquier hora). */
  franja: 'manana' | 'tarde' | null;
  created_at: string;
  updated_at: string;
}

const PERSONA_COLUMNS = 'id,listado_id,nombre,apellidos,telefono,poblacion,estado,notas,llamadas,ultima_llamada,contact_id,rellamar_el,franja,created_at,updated_at';

// Supabase devuelve como mucho 1000 filas por consulta: pedimos por tramos.
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Nombre y teléfono de todos los clientes, para avisar de duplicados. */
export function fetchClientesBasicos() {
  return fetchAll<ClienteBasico>('contacts', 'id,nombre,telefono');
}

// Todas las filas con las mismas columnas: al insertar varias a la vez,
// Supabase pone NULL en las que falten, y "llamadas" no admite NULL.
export const filaParaInsertar = (f: FilaListado, listadoId: number) => ({
  listado_id: listadoId,
  nombre: f.nombre,
  apellidos: f.apellidos,
  telefono: f.telefono,
  poblacion: f.poblacion,
  notas: f.notas ?? null,
  rellamar_el: f.rellamar_el ?? null,
  franja: f.franja ?? null,
  llamadas: f.llamadas ?? 0,
  ultima_llamada: f.ultima_llamada ?? null,
});

/** Guarda en el historial (listado_llamadas) las que se cargan ya llamadas. */
async function registrarLlamadasPrevias(nuevas: PersonaListado[]) {
  const previas = nuevas.filter((p) => p.llamadas > 0 && p.ultima_llamada);
  if (previas.length === 0) return;
  const { error } = await supabase
    .from('listado_llamadas')
    .insert(previas.map((p) => ({ persona_id: p.id, fecha: p.ultima_llamada, notas: p.notas })));
  if (error) console.error('Error guardando llamadas previas:', error);
}

export function useSupabaseListados() {
  const [listados, setListados] = useState<Listado[]>([]);
  const [personas, setPersonas] = useState<PersonaListado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkUserAndLoad = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await loadAll();
      } else {
        setLoading(false);
      }
    };

    checkUserAndLoad();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadAll();
      } else {
        setListados([]);
        setPersonas([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [l, p] = await Promise.all([
        fetchAll<Listado>('listados', 'id,nombre,created_at'),
        fetchAll<PersonaListado>('listado_personas', PERSONA_COLUMNS),
      ]);
      setListados(l.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setPersonas(p);
      setError(null);
    } catch (err) {
      console.error('Error loading listados:', err);
      setError(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
    } finally {
      setLoading(false);
    }
  };

  const crearListado = async (nombre: string, filas: FilaListado[]) => {
    const { data: listado, error: e1 } = await supabase
      .from('listados')
      .insert([{ nombre }])
      .select('id,nombre,created_at')
      .single();
    if (e1) throw e1;

    const { data: nuevas, error: e2 } = await supabase
      .from('listado_personas')
      .insert(filas.map((f) => filaParaInsertar(f, listado.id)))
      .select(PERSONA_COLUMNS);
    if (e2) {
      // Si fallan las personas, no dejamos un listado vacío colgando.
      await supabase.from('listados').delete().eq('id', listado.id);
      throw e2;
    }

    setListados((prev) => [listado, ...prev]);
    setPersonas((prev) => [...prev, ...((nuevas ?? []) as PersonaListado[])]);
    await registrarLlamadasPrevias((nuevas ?? []) as PersonaListado[]);
    return listado as Listado;
  };

  /** Añade más personas a un listado que ya existe (p. ej. otra hoja del mismo listado). */
  const anadirAListado = async (listadoId: number, filas: FilaListado[]) => {
    const { data: nuevas, error: e } = await supabase
      .from('listado_personas')
      .insert(filas.map((f) => filaParaInsertar(f, listadoId)))
      .select(PERSONA_COLUMNS);
    if (e) throw e;
    setPersonas((prev) => [...prev, ...((nuevas ?? []) as PersonaListado[])]);
    await registrarLlamadasPrevias((nuevas ?? []) as PersonaListado[]);
  };

  const renombrarListado = async (id: number, nombre: string) => {
    const { error: e } = await supabase.from('listados').update({ nombre }).eq('id', id);
    if (e) throw e;
    setListados((prev) => prev.map((l) => (l.id === id ? { ...l, nombre } : l)));
  };

  /**
   * Borra el listado y sus personas, salvo las descartadas: esas se quedan
   * ocultas (sin listado) para poder avisar si vuelven a aparecer.
   */
  const borrarListado = async (id: number) => {
    const { error: e1 } = await supabase
      .from('listado_personas')
      .delete()
      .eq('listado_id', id)
      .neq('estado', 'descartado');
    if (e1) throw e1;
    const { error: e2 } = await supabase.from('listados').delete().eq('id', id);
    if (e2) throw e2;
    setListados((prev) => prev.filter((l) => l.id !== id));
    setPersonas((prev) =>
      prev
        .filter((p) => p.listado_id !== id || p.estado === 'descartado')
        .map((p) => (p.listado_id === id ? { ...p, listado_id: null } : p))
    );
  };

  const actualizarPersona = async (id: number, updates: Partial<Omit<PersonaListado, 'id' | 'created_at'>>) => {
    const { data, error: e } = await supabase
      .from('listado_personas')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(PERSONA_COLUMNS)
      .single();
    if (e) throw e;
    setPersonas((prev) => prev.map((p) => (p.id === id ? (data as PersonaListado) : p)));
    return data as PersonaListado;
  };

  /**
   * Cuenta la llamada en la persona y la guarda en el historial (para el
   * Reporte Diario). Devuelve la persona actualizada y el id de la llamada,
   * para poder guardarle luego la nota de "¿Cómo ha ido?".
   */
  const registrarLlamada = async (persona: PersonaListado) => {
    const ahora = new Date().toISOString();
    const actualizada = await actualizarPersona(persona.id, {
      llamadas: (persona.llamadas ?? 0) + 1,
      ultima_llamada: ahora,
    });
    let llamadaId: number | null = null;
    const { data, error } = await supabase
      .from('listado_llamadas')
      .insert([{ persona_id: persona.id, fecha: ahora }])
      .select('id')
      .single();
    if (error) console.error('Error guardando la llamada en el historial:', error);
    else llamadaId = data.id;
    return { persona: actualizada, llamadaId };
  };

  /** Guarda en el historial la nota de esa llamada concreta. */
  const anotarLlamada = async (llamadaId: number, notas: string) => {
    const { error } = await supabase.from('listado_llamadas').update({ notas }).eq('id', llamadaId);
    if (error) console.error('Error guardando la nota de la llamada:', error);
  };

  /**
   * Pasa la persona a cliente del CRM (tabla contacts) con su nota.
   * Si ya existe un cliente con ese teléfono, no crea otro: le añade la nota
   * y enlaza con él. Devuelve si se ha creado uno nuevo o se ha enlazado.
   */
  const adoptarPersona = async (persona: PersonaListado, nombreDelListado: string) => {
    const hoy = new Date().toLocaleDateString('es-ES');
    const nota = [`Adoptada del listado "${nombreDelListado}" el ${hoy}.`, persona.notas?.trim()]
      .filter(Boolean)
      .join(' ');

    const tel = normalizarTelefono(persona.telefono);
    const clientes = await fetchClientesBasicos();
    const existente = tel.length >= 6
      ? clientes.find((c) => normalizarTelefono(c.telefono) === tel)
      : undefined;

    let contactId: number;
    if (existente) {
      const { data: actual, error: e0 } = await supabase
        .from('contacts').select('notas').eq('id', existente.id).single();
      if (e0) throw e0;
      const notas = [actual?.notas?.trim(), nota].filter(Boolean).join('\n');
      const { error: e1 } = await supabase
        .from('contacts')
        .update({ notas, updated_at: new Date().toISOString() })
        .eq('id', existente.id);
      if (e1) throw e1;
      contactId = existente.id;
    } else {
      const { data, error: e1 } = await supabase
        .from('contacts')
        .insert([{
          nombre: nombreCompleto(persona),
          telefono: persona.telefono,
          ubicacion: persona.poblacion,
          modelo: '',
          intereses: [],
          notas: nota,
          zona_playa: false,
          sin_contactar: false,
          origen: 'Listado',
          estado_lead: 'Contactado',
        }])
        .select('id')
        .single();
      if (e1) throw e1;
      contactId = data.id;
    }

    // La adopción viene de una llamada: se apunta en su historial de cliente para
    // que el Dashboard y el Planning la cuenten como contactada (si no, sale
    // como "NUEVO / nunca contactada" en la agenda de prioritarios).
    const { error: eInt } = await supabase.from('interactions').insert([{
      contact_id: contactId,
      tipo: 'llamada',
      fecha: persona.ultima_llamada ?? new Date().toISOString(),
      notas: `Llamada desde el listado "${nombreDelListado}": adoptada.`,
    }]);
    if (eInt) console.error('Error apuntando la llamada de la adopción:', eInt);

    await actualizarPersona(persona.id, { estado: 'adoptado', contact_id: contactId });
    return { nuevo: !existente, clienteExistente: existente?.nombre };
  };

  return {
    listados,
    personas,
    loading,
    error,
    loadAll,
    crearListado,
    anadirAListado,
    renombrarListado,
    borrarListado,
    actualizarPersona,
    registrarLlamada,
    anotarLlamada,
    adoptarPersona,
  };
}
