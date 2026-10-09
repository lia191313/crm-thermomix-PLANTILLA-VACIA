import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Venta {
  id: string;
  contacto_id: number;
  contacto_nombre: string;
  contacto_telefono: string;
  contacto_ubicacion: string;
  modelo: string;
  fecha_venta: string;
  fecha_bienvenida: string | null;
  bienvenida_realizada: boolean;
  notas: string;
  created_at?: string;
  updated_at?: string;
}

// Caché a nivel de módulo: todas las instancias del hook comparten los mismos datos
let _ventasCache: Venta[] = [];
const _listeners = new Set<(ventas: Venta[]) => void>();

function notifyListeners(ventas: Venta[]) {
  _ventasCache = ventas;
  _listeners.forEach(fn => fn(ventas));
}

export function useSupabaseVentas() {
  const [ventas, setVentas] = useState<Venta[]>(_ventasCache);
  const [loading, setLoading] = useState(_ventasCache.length === 0);

  // Suscribirse a actualizaciones del caché compartido
  useEffect(() => {
    const listener = (data: Venta[]) => setVentas(data);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  // Cargar ventas al montar
  useEffect(() => {
    loadVentas();
  }, []);

  // Migrar ventas de localStorage a Supabase si existen
  useEffect(() => {
    const migrateFromLocalStorage = async () => {
      try {
        const localVentas = localStorage.getItem('thermomix_ventas');
        if (localVentas) {
          const ventasData = JSON.parse(localVentas);
          if (Array.isArray(ventasData) && ventasData.length > 0) {
            // Verificar si ya existen ventas en Supabase
            const { data: existingVentas } = await supabase
              .from('ventas')
              .select('id')
              .limit(1);

            // Si no hay ventas en Supabase, migrar desde localStorage
            if (!existingVentas || existingVentas.length === 0) {
              const ventasParaMigrar = ventasData.map((v: any) => ({
                contacto_id: v.contactoId,
                contacto_nombre: v.contactoNombre,
                contacto_telefono: v.contactoTelefono || '',
                contacto_ubicacion: v.contactoUbicacion || '',
                modelo: v.modelo,
                fecha_venta: v.fechaVenta,
                fecha_bienvenida: v.fechaBienvenida || null,
                bienvenida_realizada: v.bienvenidaRealizada || false,
                notas: v.notas || '',
              }));

              const { error } = await supabase
                .from('ventas')
                .insert(ventasParaMigrar);

              if (!error) {
                console.log('Ventas migradas exitosamente de localStorage a Supabase');
                loadVentas();
              }
            }
          }
        }
      } catch (error) {
        console.error('Error during migration:', error);
      }
    };

    migrateFromLocalStorage();
  }, []);

  const loadVentas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Convertir datos de Supabase al formato Venta esperado
      const ventasFormateadas = (data || []).map(v => ({
        id: v.id.toString(),
        contacto_id: v.contacto_id,
        contacto_nombre: v.contacto_nombre,
        contacto_telefono: v.contacto_telefono || '',
        contacto_ubicacion: v.contacto_ubicacion || '',
        modelo: v.modelo,
        fecha_venta: v.fecha_venta,
        fecha_bienvenida: v.fecha_bienvenida,
        bienvenida_realizada: v.bienvenida_realizada,
        notas: v.notas || '',
        created_at: v.created_at,
        updated_at: v.updated_at,
      }));
      
      notifyListeners(ventasFormateadas);
    } catch (error) {
      console.error('Error loading ventas:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const crearRecordatorioBienvenida = useCallback(async (
    contacto_id: number,
    contacto_nombre: string,
    fecha_bienvenida: string,
  ) => {
    try {
      const { data: existente } = await supabase
        .from('recordatorios')
        .select('id')
        .eq('contacto_id', contacto_id)
        .eq('tipo', 'bienvenida')
        .eq('completado', false)
        .maybeSingle();

      if (existente) return;

      await supabase.from('recordatorios').insert([{
        contacto_id,
        contacto_nombre,
        descripcion: contacto_nombre,
        tipo: 'bienvenida',
        frecuencia_dias: 7,
        fecha: fecha_bienvenida,
        fecha_programada: fecha_bienvenida,
        completado: false,
        notas: null,
      }]);
    } catch (error) {
      console.error('Error creando recordatorio de bienvenida:', error);
    }
  }, []);

  const addVenta = useCallback(async (venta: Omit<Venta, 'id' | 'created_at' | 'updated_at'>) => {
    // También guardar en localStorage como backup
    try {
      const localVentas = localStorage.getItem('thermomix_ventas');
      const ventasArray = localVentas ? JSON.parse(localVentas) : [];
      ventasArray.push({
        contactoId: venta.contacto_id,
        contactoNombre: venta.contacto_nombre,
        contactoTelefono: venta.contacto_telefono,
        contactoUbicacion: venta.contacto_ubicacion,
        modelo: venta.modelo,
        fechaVenta: venta.fecha_venta,
        fechaBienvenida: venta.fecha_bienvenida,
        bienvenidaRealizada: venta.bienvenida_realizada,
        notas: venta.notas,
      });
      localStorage.setItem('thermomix_ventas', JSON.stringify(ventasArray));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
    try {
      const { data, error } = await supabase
        .from('ventas')
        .insert([{
          contacto_id: venta.contacto_id,
          contacto_nombre: venta.contacto_nombre,
          contacto_telefono: venta.contacto_telefono,
          contacto_ubicacion: venta.contacto_ubicacion,
          modelo: venta.modelo,
          fecha_venta: venta.fecha_venta,
          fecha_bienvenida: venta.fecha_bienvenida,
          bienvenida_realizada: venta.bienvenida_realizada,
          notas: venta.notas,
        }])
        .select()
        .single();

      if (error) throw error;
      
      const newVenta: Venta = {
        id: data.id.toString(),
        contacto_id: data.contacto_id,
        contacto_nombre: data.contacto_nombre,
        contacto_telefono: data.contacto_telefono,
        contacto_ubicacion: data.contacto_ubicacion,
        modelo: data.modelo,
        fecha_venta: data.fecha_venta,
        fecha_bienvenida: data.fecha_bienvenida,
        bienvenida_realizada: data.bienvenida_realizada,
        notas: data.notas,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      
      notifyListeners([newVenta, ..._ventasCache]);

      if (data.fecha_bienvenida) {
        await crearRecordatorioBienvenida(data.contacto_id, data.contacto_nombre, data.fecha_bienvenida);
      }

      return newVenta;
    } catch (error) {
      console.error('Error adding venta:', error);
      throw error;
    }
  }, [crearRecordatorioBienvenida]);

  const updateVenta = useCallback(async (id: string, updates: Partial<Venta>) => {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .update({
          ...(updates.contacto_nombre !== undefined && { contacto_nombre: updates.contacto_nombre }),
          ...(updates.contacto_telefono !== undefined && { contacto_telefono: updates.contacto_telefono }),
          ...(updates.contacto_ubicacion !== undefined && { contacto_ubicacion: updates.contacto_ubicacion }),
          ...(updates.modelo !== undefined && { modelo: updates.modelo }),
          ...(updates.fecha_venta !== undefined && { fecha_venta: updates.fecha_venta }),
          ...(updates.fecha_bienvenida !== undefined && { fecha_bienvenida: updates.fecha_bienvenida }),
          ...(updates.bienvenida_realizada !== undefined && { bienvenida_realizada: updates.bienvenida_realizada }),
          ...(updates.notas !== undefined && { notas: updates.notas }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) throw error;

      // Propagar al caché compartido para que TODAS las instancias montadas
      // reciban el cambio (antes solo se actualizaba el state local, y la
      // siguiente sincronización con _ventasCache podía pisar los cambios).
      const nuevaLista = _ventasCache.map(v => v.id === id ? {
        ...v,
        ...updates,
        updated_at: data.updated_at,
      } : v);
      notifyListeners(nuevaLista);

      if (updates.fecha_bienvenida) {
        const venta = _ventasCache.find(v => v.id === id);
        if (venta) {
          await crearRecordatorioBienvenida(venta.contacto_id, venta.contacto_nombre, updates.fecha_bienvenida);
        }
      }

      return data;
    } catch (error) {
      console.error('Error updating venta:', error);
      throw error;
    }
  }, [crearRecordatorioBienvenida]);

  const deleteVenta = useCallback(async (id: string) => {
    // También eliminar de localStorage
    try {
      const localVentas = localStorage.getItem('thermomix_ventas');
      if (localVentas) {
        const ventasArray = JSON.parse(localVentas);
        const filtered = ventasArray.filter((v: any) => v.id?.toString() !== id);
        localStorage.setItem('thermomix_ventas', JSON.stringify(filtered));
      }
    } catch (e) {
      console.error('Error deleting from localStorage:', e);
    }
    try {
      const { error } = await supabase
        .from('ventas')
        .delete()
        .eq('id', parseInt(id));

      if (error) throw error;
      notifyListeners(_ventasCache.filter(v => v.id !== id));
    } catch (error) {
      console.error('Error deleting venta:', error);
      throw error;
    }
  }, []);

  return {
    ventas,
    loading,
    addVenta,
    updateVenta,
    deleteVenta,
    loadVentas,
  };
}
