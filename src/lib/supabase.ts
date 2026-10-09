import { createClient } from '@supabase/supabase-js';

// La dirección y la clave pública de TU Supabase NO van escritas aquí:
// se ponen en Netlify (Site configuration > Environment variables) con
// los nombres VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
// Para probar en el ordenador, crea un archivo .env con esas dos líneas.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

// true cuando faltan las claves: la pantalla de entrada lo avisa.
export const supabaseSinConfigurar = !supabaseUrl || !supabaseAnonKey;

export const supabase = createClient(
  supabaseUrl || 'https://sin-configurar.supabase.co',
  supabaseAnonKey || 'sin-configurar',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      headers: { 'x-application-name': 'thermomix-crm' }
    }
  }
);
