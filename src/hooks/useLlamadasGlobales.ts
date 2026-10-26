import { useState, useCallback, useMemo, useEffect } from "react";
import { useSupabaseInteractions, SupabaseInteraction } from "./useSupabaseInteractions";
import { fiscalMonthOf, fiscalMonthBounds } from "@/utils/fiscalMonth";
import { esContactoReal } from "@/lib/marcas";

export interface Contacto {
  id: string;
  contactoId: number;
  tipo: "llamada" | "whatsapp" | "difusion" | "nota" | "rellamar";
  descripcion: string;
  fecha: string;
  fechaLocal: string;
  horaLocal: string;
}

export function useLlamadasGlobales() {
  const { interactions, addInteraction, updateInteraction, deleteInteraction, loading } = useSupabaseInteractions();

  // Mapear interacciones de Supabase al formato Contacto esperado por la app
  const contactos = useMemo(() => {
    return interactions.map(i => {
      const fechaRegistro = new Date(i.fecha);
      return {
        id: i.id.toString(),
        contactoId: i.contact_id,
        tipo: i.tipo,
        descripcion: i.notas,
        fecha: i.fecha,
        fechaLocal: fechaRegistro.toLocaleDateString("es-ES", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: "Europe/Madrid",
        }),
        horaLocal: fechaRegistro.toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        }),
      };
    });
  }, [interactions]);

  const addContacto = useCallback(
    async (
      contactoId: number | string,
      tipo: "llamada" | "whatsapp" | "difusion" | "nota" | "rellamar",
      descripcion: string,
      fecha?: Date
    ) => {
      const idNumerico = typeof contactoId === "string" ? parseInt(contactoId, 10) : contactoId;
      const fechaRegistro = fecha || new Date();
      
      const newInteraction = await addInteraction(idNumerico, tipo, descripcion, fechaRegistro);
      
      return {
        id: newInteraction.id.toString(),
        contactoId: newInteraction.contact_id,
        tipo: newInteraction.tipo,
        descripcion: newInteraction.notas,
        fecha: newInteraction.fecha,
        fechaLocal: fechaRegistro.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }),
        horaLocal: fechaRegistro.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid" }),
      };
    },
    [addInteraction]
  );

  const stats = useMemo(() => {
    const hoy = new Date();
    const hoyStr = hoy.toDateString();
    
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + (hoy.getDay() === 0 ? -6 : 1));
    inicioSemana.setHours(0, 0, 0, 0);

    // Mes fiscal Thermomix (no calendario): el contador "mes" suma desde el
    // día siguiente al cierre anterior hasta el día de cierre actual.
    const fmActual = fiscalMonthOf(hoy);
    const { start: inicioMes, endExclusive: inicioMesSiguiente } = fiscalMonthBounds(fmActual);

    // Solo llamadas reales (igual que el Reporte Diario)
    const soloLlamadas = contactos.filter(c => c.tipo === "llamada");

    return {
      hoy: soloLlamadas.filter(c => new Date(c.fecha).toDateString() === hoyStr).length,
      semana: soloLlamadas.filter(c => new Date(c.fecha) >= inicioSemana).length,
      mes: soloLlamadas.filter(c => {
        const f = new Date(c.fecha);
        return f >= inicioMes && f < inicioMesSiguiente;
      }).length,
      porTipo: {
        llamada: contactos.filter(c => c.tipo === "llamada").length,
        whatsapp: contactos.filter(c => c.tipo === "whatsapp").length,
        nota: contactos.filter(c => c.tipo === "nota").length,
      }
    };
  }, [contactos]);

  const getContactosPorContacto = useCallback(
    (contactoId: number | string) => {
      const idNumerico = typeof contactoId === "string" ? parseInt(contactoId, 10) : contactoId;
      return contactos
        .filter((c) => Number(c.contactoId) === idNumerico)
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    },
    [contactos]
  );

  const getUltimoContacto = useCallback(
    (contactoId: number | string) => {
      const filtrados = getContactosPorContacto(contactoId);
      return filtrados[0] || null;
    },
    [getContactosPorContacto]
  );

  const getDiasDesdeUltimoContacto = useCallback(
    (contactoId: number | string) => {
      const idNumerico = typeof contactoId === "string" ? parseInt(contactoId, 10) : contactoId;
      // Solo cuentan como contacto real: llamada, whatsapp, difusion.
      // Excluimos "rellamar" (marca interna) y "nota" (anotaciones no son contacto directo)
      const contactosReales = contactos
        .filter(
          (c) =>
            Number(c.contactoId) === idNumerico &&
            esContactoReal(c.tipo)
        )
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      const ultimo = contactosReales[0] || null;
      if (!ultimo) return 999;

      const hoy = new Date();
      const hoyNormalizado = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      const ultimaFecha = new Date(ultimo.fecha);
      const ultimaFechaNormalizada = new Date(ultimaFecha.getFullYear(), ultimaFecha.getMonth(), ultimaFecha.getDate());
      
      const diferenciaMs = hoyNormalizado.getTime() - ultimaFechaNormalizada.getTime();
      const diasCalculados = Math.max(0, Math.floor(diferenciaMs / (1000 * 60 * 60 * 24)));
      
      return diasCalculados;
    },
    [contactos]
  );

  const deleteContacto = useCallback(
    async (id: string) => {
      await deleteInteraction(Number(id));
    },
    [deleteInteraction]
  );

  const updateContactoDescripcion = useCallback(
    async (id: string, descripcion: string) => {
      await updateInteraction(Number(id), descripcion);
    },
    [updateInteraction]
  );

  const reloadFromStorage = useCallback(() => {
    // Esta función se llama para recargar datos desde Supabase
    // El hook ya se actualiza automáticamente cuando cambian las interacciones
    // Esta es una función de compatibilidad para HistorialContactos
  }, []);

  const forceRefresh = useCallback(() => {
    // Fuerza un refresco de todos los datos
    // Útil para disparar recálculos después de acciones del usuario
    return { stats, contactos };
  }, [stats, contactos]);

  return {
    contactos,
    stats,
    addContacto,
    deleteContacto,
    updateContactoDescripcion,
    getContactosPorContacto,
    getUltimoContacto,
    getDiasDesdeUltimoContacto,
    loading,
    reloadFromStorage,
    forceRefresh
  };
}
