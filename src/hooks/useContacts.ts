import { useMemo } from "react";
import { useSupabaseContacts, SupabaseContact } from "./useSupabaseContacts";
import { contacts as localContacts } from "@/data/contacts";

export interface Contact {
  id: number;
  nombre: string;
  telefono: string;
  ubicacion: string;
  modelo: string;
  intereses: string[];
  notas: string;
  ultimoContacto?: string;
  zonaPlaya?: boolean;
  sinContactar?: boolean;
  /** Me tiene guardada: le llegan las listas de difusión de WhatsApp. */
  recibeDifusion?: boolean;
  origen?: string | null;
  estado_lead?: string | null;
  recomendada_por?: number | null;
}

export const useContacts = () => {
  const { contacts: supabaseContacts, loading, addContact, updateContact, deleteContact, marcarRecibeDifusion } = useSupabaseContacts();

  // Mapear contactos de Supabase al formato Contact esperado por la app
  // Si falta teléfono en Supabase, recuperarlo del archivo local
  const contacts = useMemo(() => {
    return supabaseContacts.map(c => {
      let telefono = c.telefono;
      
      // Buscar el contacto local por ID o por Nombre (más fiable si los IDs han cambiado)
      const localContact = localContacts.find(lc => 
        lc.id === c.id || 
        lc.nombre.toLowerCase().trim() === c.nombre.toLowerCase().trim()
      );

      // Si el teléfono está vacío en Supabase, recuperarlo del local
      if (!telefono || telefono.trim() === "") {
        if (localContact && localContact.telefono) {
          telefono = localContact.telefono;
        }
      }

      let ubicacion = c.ubicacion;
      // Si la ubicación es genérica o está vacía, recuperarla del local
      const ubicacionesGenericas = ["otras zonas", "Otras zonas", "Desconocida", "desconocida", "", null];
      if (ubicacionesGenericas.includes(ubicacion) || !ubicacion) {
        if (localContact && localContact.ubicacion) {
          ubicacion = localContact.ubicacion;
        }
      }
      
      return {
        id: c.id,
        nombre: c.nombre,
        telefono: telefono,
        ubicacion: ubicacion,
        modelo: c.modelo,
        intereses: c.intereses,
        notas: c.notas,
        ultimoContacto: c.updated_at,
        zonaPlaya: c.zona_playa,
        sinContactar: c.sin_contactar ?? false,
        recibeDifusion: c.recibe_difusion ?? false,
        origen: c.origen,
        estado_lead: c.estado_lead,
        recomendada_por: c.recomendada_por ?? null,
      };
    });
  }, [supabaseContacts]);

  const addNewContact = async (contact: Omit<Contact, "id">) => {
    const newContact = await addContact({
      nombre: contact.nombre,
      telefono: contact.telefono,
      ubicacion: contact.ubicacion,
      modelo: contact.modelo,
      intereses: contact.intereses,
      notas: contact.notas,
      zona_playa: contact.zonaPlaya || false,
      sin_contactar: contact.sinContactar ?? false,
      recibe_difusion: contact.recibeDifusion ?? false,
      origen: contact.origen,
      estado_lead: contact.estado_lead,
    });
    return {
      ...newContact,
      ultimoContacto: newContact.updated_at,
      zonaPlaya: newContact.zona_playa
    };
  };

  const updateExistingContact = async (contact: Contact) => {
    const updated = await updateContact(contact.id, {
      nombre: contact.nombre,
      telefono: contact.telefono,
      ubicacion: contact.ubicacion,
      modelo: contact.modelo,
      intereses: contact.intereses,
      notas: contact.notas,
      zona_playa: contact.zonaPlaya,
      sin_contactar: contact.sinContactar ?? false,
      origen: contact.origen,
      estado_lead: contact.estado_lead,
      // Solo si viene: así editar la ficha desde otro sitio no lo borra.
      ...(contact.recomendada_por !== undefined && { recomendada_por: contact.recomendada_por }),
    });
    return {
      ...updated,
      ultimoContacto: updated.updated_at,
      zonaPlaya: updated.zona_playa
    };
  };

  const deleteExistingContact = async (id: number) => {
    await deleteContact(id);
  };

  return {
    contacts,
    loading,
    addContact: addNewContact,
    updateContact: updateExistingContact,
    deleteContact: deleteExistingContact,
    marcarRecibeDifusion,
  };
};
