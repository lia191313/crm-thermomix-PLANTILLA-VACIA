// Copia de seguridad COMPLETA: todas las tablas de Supabase + lo que la app
// guarda solo en este aparato (recetas y anotaciones personalizadas, etc.).
// La usan los botones "Exportar" del menú del ordenador y del móvil.
import { supabase } from './supabase';

export const TABLAS_COPIA = [
  'contacts',
  'interactions',
  'ventas',
  'recordatorios',
  'rellamar',
  'rellamadas',
  'demos',
  'anotaciones',
  'grupos',
  'contacto_grupos',
  'historial_llamadas',
  'prioritarios',
  'dashboard_snooze',
  'leads_redes',
  'listados',
  'listado_personas',
  'listado_llamadas', // historial de llamadas de los listados (Reporte Diario)
] as const;

// Claves de sesión de Supabase: nunca se copian ni se restauran.
const esClaveDeSesion = (key: string) => key.startsWith('sb-');

async function leerTabla(tabla: string): Promise<unknown[]> {
  const PAGE = 1000;
  const filas: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(tabla).select('*').range(from, from + PAGE - 1);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return filas;
}

export function leerDatosLocales(): Record<string, string | null> {
  const datos: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && !esClaveDeSesion(key)) datos[key] = localStorage.getItem(key);
  }
  return datos;
}

export async function crearCopiaCompleta() {
  const tablas: Record<string, unknown[]> = {};
  const errores: Record<string, string> = {};
  await Promise.all(
    TABLAS_COPIA.map(async (tabla) => {
      try {
        tablas[tabla] = await leerTabla(tabla);
      } catch (err) {
        errores[tabla] = (err as { message?: string })?.message ?? String(err);
      }
    })
  );
  const totales = Object.fromEntries(Object.entries(tablas).map(([t, filas]) => [t, filas.length]));
  return {
    version: 2,
    exportDate: new Date().toISOString(),
    totales,
    errores,
    tablas,
    // Compatibilidad con el formato anterior de copia.
    totalContacts: tablas.contacts?.length ?? 0,
    contacts: tablas.contacts ?? [],
    localData: leerDatosLocales(),
  };
}

export function descargarJSON(datos: unknown, nombreArchivo: string) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Crea la copia completa y la descarga. Devuelve cuántas filas tiene y qué tablas fallaron. */
export async function exportarCopiaCompleta() {
  const copia = await crearCopiaCompleta();
  descargarJSON(copia, `copia_completa_crm_thermomix_${new Date().toISOString().split('T')[0]}.json`);
  const totalFilas = Object.values(copia.totales).reduce((a, b) => a + b, 0);
  return { totalFilas, clientes: copia.totalContacts, errores: Object.keys(copia.errores) };
}

/**
 * Restaura en ESTE aparato lo que se guarda localmente (recetas y anotaciones
 * personalizadas, etc.). No toca los datos de Supabase: esos ya están en la
 * nube y se ven igual en todos los aparatos. Acepta copias nuevas y antiguas.
 */
export function restaurarDatosLocales(copia: unknown): number {
  if (!copia || typeof copia !== 'object') throw new Error('Archivo no válido');
  const obj = copia as Record<string, unknown>;
  const locales = (obj.localData && typeof obj.localData === 'object' ? obj.localData : 'contacts' in obj ? {} : obj) as Record<
    string,
    unknown
  >;
  let restauradas = 0;
  for (const [key, value] of Object.entries(locales)) {
    if (esClaveDeSesion(key) || typeof value !== 'string') continue;
    localStorage.setItem(key, value);
    restauradas++;
  }
  return restauradas;
}
