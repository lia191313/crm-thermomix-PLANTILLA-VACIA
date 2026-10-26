import { useState, useEffect } from "react";
import { MessageTemplate, getTemplates as getTemplatesLocales } from "@/services/storage";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "default-1",
    name: "Receta Sugerida",
    content: "¡Hola {nombre}! 👋\n\nTe quería compartir una receta deliciosa de Cookidoo: \"{receta}\"\n\nEs perfecta para preparar con tu Thermomix {modelo}. ¿Te gustaría que te envíe más detalles?\n\n¡Saludos! 🍳",
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-2",
    name: "Invitación a Clase",
    content: "¡Hola {nombre}! 👋\n\nTe invito a nuestra próxima clase de cocina con Thermomix. Es una excelente oportunidad para aprender nuevas técnicas y recetas.\n\n¿Te animas a venir? 🎓\n\n¡Saludos!",
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-3",
    name: "Promoción Especial",
    content: "¡Hola {nombre}! 🎉\n\nTengo una promoción especial para ti en tu Thermomix {modelo}. No te la pierdas.\n\n¿Hablamos para los detalles?\n\n¡Saludos!",
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-4",
    name: "Seguimiento",
    content: "¡Hola {nombre}! 👋\n\nSolo quería saber cómo te va con tu Thermomix {modelo}. ¿Hay algo en lo que pueda ayudarte?\n\n¡Saludos!",
    createdAt: new Date().toISOString(),
  },
];

// Las plantillas se guardan en Supabase (tabla "plantillas") para tenerlas iguales
// en el ordenador y en el móvil, y que entren en la copia de seguridad.
// Antes vivían solo en el IndexedDB de cada navegador: la primera vez que la app
// arranca en un aparato, sube las que tenga guardadas ahí (sin pisar las que ya
// estén en la nube) y lo apunta para no repetirlo.
const CLAVE_MIGRADAS = "plantillas_migradas_v1";

type FilaPlantilla = {
  id: string;
  name: string;
  content: string;
  image_data: string | null;
  image_name: string | null;
  created_at: string;
};

const aFila = (t: MessageTemplate): FilaPlantilla => ({
  id: t.id,
  name: t.name,
  content: t.content,
  image_data: t.imageData ?? null,
  image_name: t.imageName ?? null,
  created_at: t.createdAt,
});

const deFila = (f: FilaPlantilla): MessageTemplate => ({
  id: f.id,
  name: f.name,
  content: f.content,
  imageData: f.image_data ?? undefined,
  imageName: f.image_name ?? undefined,
  createdAt: f.created_at,
});

async function subirPlantillasLocales() {
  try {
    if (localStorage.getItem(CLAVE_MIGRADAS)) return;
  } catch {
    return;
  }
  const locales = await getTemplatesLocales().catch(() => [] as MessageTemplate[]);
  if (locales.length > 0) {
    const { error } = await supabase
      .from("plantillas")
      .upsert(locales.map(aFila), { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
  try {
    localStorage.setItem(CLAVE_MIGRADAS, new Date().toISOString());
  } catch {
    // sin localStorage: se reintentará la próxima vez (no duplica, ignora repetidas)
  }
}

export const useTemplates = () => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        await subirPlantillasLocales();
        // Las más nuevas, arriba del todo.
        const { data, error } = await supabase.from("plantillas").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        if (!data || data.length === 0) {
          const { error: e2 } = await supabase.from("plantillas").insert(DEFAULT_TEMPLATES.map(aFila));
          if (e2) throw e2;
          setTemplates(DEFAULT_TEMPLATES);
        } else {
          setTemplates((data as FilaPlantilla[]).map(deFila));
        }
      } catch (err) {
        console.error("Error cargando plantillas:", err);
        setError(err instanceof Error ? err.message : "Error loading templates");
        // Sin conexión: al menos mostramos las de este aparato.
        const locales = await getTemplatesLocales().catch(() => [] as MessageTemplate[]);
        setTemplates(locales.length ? locales : DEFAULT_TEMPLATES);
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const addNewTemplate = async (name: string, content: string, imageData?: string, imageName?: string) => {
    try {
      const template: MessageTemplate = {
        id: nanoid(),
        name,
        content,
        imageData,
        imageName,
        createdAt: new Date().toISOString(),
      };
      const { error } = await supabase.from("plantillas").insert([aFila(template)]);
      if (error) throw error;
      setTemplates((prev) => [template, ...prev]);
      return template;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding template");
      throw err;
    }
  };

  const updateExistingTemplate = async (template: MessageTemplate) => {
    try {
      const { error } = await supabase.from("plantillas").update(aFila(template)).eq("id", template.id);
      if (error) throw error;
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? template : t)));
      return template;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating template");
      throw err;
    }
  };

  const deleteExistingTemplate = async (id: string) => {
    try {
      const { error } = await supabase.from("plantillas").delete().eq("id", id);
      if (error) throw error;
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error deleting template");
      throw err;
    }
  };

  const renderTemplate = (template: MessageTemplate, variables: Record<string, string>) => {
    let content = template.content;
    Object.entries(variables).forEach(([key, value]) => {
      content = content.replace(`{${key}}`, value);
    });
    return content;
  };

  return {
    templates,
    loading,
    error,
    addTemplate: addNewTemplate,
    updateTemplate: updateExistingTemplate,
    deleteTemplate: deleteExistingTemplate,
    renderTemplate,
  };
};
