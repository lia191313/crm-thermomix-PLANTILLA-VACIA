import { useMemo } from "react";
import { useSupabaseInteractions } from "./useSupabaseInteractions";
import { useSupabaseContacts } from "./useSupabaseContacts";

export interface ContactNote {
  id: string;
  contactId: number;
  text: string;
  date: string;
  type: "llamada" | "whatsapp" | "nota" | "difusion" | "rellamar";
}

export function useContactNotes(contactId: number) {
  const { interactions, addInteraction, deleteInteraction } = useSupabaseInteractions(contactId);
  const { updateContact: updateContactInDB, contacts } = useSupabaseContacts();

  // ✅ FUENTE ÚNICA DE VERDAD: Obtener notas directamente de Supabase
  const notes = useMemo(() => {
    return interactions.map(i => ({
      id: i.id.toString(),
      contactId: i.contact_id,
      text: i.notas,
      date: i.fecha,
      type: i.tipo as ContactNote["type"]
    }));
  }, [interactions]);

  const addNote = async (text: string, type: "llamada" | "whatsapp" | "nota" = "nota", fecha?: Date) => {
    const fechaRegistro = fecha || new Date();
    
    // ✅ Guardar en Supabase
    const newInteraction = await addInteraction(contactId, type, text, fechaRegistro);

    // ✅ Actualizar ultimoContacto en el modelo Contact para estadísticas rápidas
    const contactToUpdate = contacts.find(c => Number(c.id) === Number(contactId));
    if (contactToUpdate) {
      await updateContactInDB(contactId, { 
        updated_at: fechaRegistro.toISOString() 
      });
    }

    return {
      id: newInteraction.id.toString(),
      contactId: newInteraction.contact_id,
      text: newInteraction.notas,
      date: newInteraction.fecha,
      type: newInteraction.tipo as "llamada" | "whatsapp" | "nota"
    };
  };

  const deleteNote = async (noteId: string) => {
    await deleteInteraction(Number(noteId));
  };

  const updateNote = async (noteId: string, text: string) => {
    // Para simplificar, borramos y creamos una nueva o podríamos añadir updateInteraction
    const nota = interactions.find(i => i.id.toString() === noteId);
    if (nota) {
      await deleteInteraction(Number(noteId));
      await addInteraction(contactId, nota.tipo, text, new Date(nota.fecha));
    }
  };

  return { notes, addNote, deleteNote, updateNote };
}
