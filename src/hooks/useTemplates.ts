import { useState, useEffect } from "react";
import { MessageTemplate, getTemplates, addTemplate, updateTemplate, deleteTemplate, initDB } from "@/services/storage";
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

export const useTemplates = () => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        await initDB();
        const storedTemplates = await getTemplates();
        
        if (storedTemplates.length === 0) {
          // First time: load default templates
          for (const template of DEFAULT_TEMPLATES) {
            await addTemplate(template);
          }
          setTemplates(DEFAULT_TEMPLATES);
        } else {
          setTemplates(storedTemplates);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading templates");
        setTemplates(DEFAULT_TEMPLATES);
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
      await addTemplate(template);
      setTemplates([...templates, template]);
      return template;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding template");
      throw err;
    }
  };

  const updateExistingTemplate = async (template: MessageTemplate) => {
    try {
      await updateTemplate(template);
      setTemplates(templates.map(t => t.id === template.id ? template : t));
      return template;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating template");
      throw err;
    }
  };

  const deleteExistingTemplate = async (id: string) => {
    try {
      await deleteTemplate(id);
      setTemplates(templates.filter(t => t.id !== id));
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
