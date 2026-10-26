import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Promocion } from "@/lib/promociones";

// Promociones guardadas en Supabase (tabla `promociones`, supabase/crear_promociones.sql),
// iguales en el ordenador y en el móvil (22/10/2026).

export type PromocionNueva = Omit<Promocion, "id">;

const COLUMNAS = "id,tipo,titulo,desde,hasta,resumen,detalles,whatsapp,imagen";

export function useSupabasePromociones() {
  const [promos, setPromos] = useState<Promocion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from("promociones").select(COLUMNAS).order("hasta", { ascending: true });
    if (e) {
      console.error("Error cargando promociones:", e);
      setError("No se pudieron cargar las promociones.");
    } else {
      setPromos((data ?? []) as Promocion[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async (promo: PromocionNueva, id?: number) => {
    const fila = { ...promo, updated_at: new Date().toISOString() };
    const { error: e } = id
      ? await supabase.from("promociones").update(fila).eq("id", id)
      : await supabase.from("promociones").insert([fila]);
    if (e) throw e;
    await cargar();
  };

  const borrar = async (id: number) => {
    const { error: e } = await supabase.from("promociones").delete().eq("id", id);
    if (e) throw e;
    await cargar();
  };

  return { promos, loading, error, guardar, borrar, recargar: cargar };
}

/** Reduce la foto del folleto a JPEG de 1200 px como mucho, para guardarla en la tabla. */
export function reducirImagen(archivo: File, maximo = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(lector.error);
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.onload = () => {
        const escala = Math.min(1, maximo / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(archivo);
  });
}
