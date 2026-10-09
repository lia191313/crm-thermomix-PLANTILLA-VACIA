import { useState, useEffect } from "react";

export interface AnotacionPersonalizada {
  id: string;
  contactoId: number;
  contenido: string;
  fecha: string;
  tipo: "nota" | "recordatorio";
  recordatorioFecha?: string; // Fecha del recordatorio (ej: "2026-03-20")
  recordatorioTexto?: string; // Texto del recordatorio (ej: "Visita de bienvenida")
  completado: boolean;
}

export function useAnotacionesPersonalizadas() {
  const [anotaciones, setAnotaciones] = useState<AnotacionPersonalizada[]>([]);

  useEffect(() => {
    // Cargar anotaciones del localStorage
    const stored = localStorage.getItem("anotaciones_personalizadas");
    if (stored) {
      try {
        setAnotaciones(JSON.parse(stored));
      } catch (error) {
        console.error("Error loading anotaciones:", error);
      }
    }
  }, []);

  const addAnotacion = (
    contactoId: number,
    contenido: string,
    tipo: "nota" | "recordatorio" = "nota",
    recordatorioFecha?: string,
    recordatorioTexto?: string
  ) => {
    const newAnotacion: AnotacionPersonalizada = {
      id: Date.now().toString(),
      contactoId,
      contenido,
      fecha: new Date().toISOString(),
      tipo,
      recordatorioFecha,
      recordatorioTexto,
      completado: false,
    };

    const updated = [newAnotacion, ...anotaciones];
    setAnotaciones(updated);
    localStorage.setItem("anotaciones_personalizadas", JSON.stringify(updated));
    return newAnotacion;
  };

  const getAnotacionesPorContacto = (contactoId: number) => {
    return anotaciones
      .filter((a) => a.contactoId === contactoId)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  };

  const getRecordatoriosPendientes = () => {
    const hoy = new Date().toISOString().split("T")[0];
    return anotaciones
      .filter(
        (a) =>
          a.tipo === "recordatorio" &&
          a.recordatorioFecha &&
          a.recordatorioFecha <= hoy &&
          !a.completado
      )
      .sort((a, b) => (a.recordatorioFecha || "").localeCompare(b.recordatorioFecha || ""));
  };

  const getRecordatoriosPorContacto = (contactoId: number) => {
    return anotaciones
      .filter((a) => a.contactoId === contactoId && a.tipo === "recordatorio")
      .sort((a, b) => (a.recordatorioFecha || "").localeCompare(b.recordatorioFecha || ""));
  };

  const marcarRecordatorioCompletado = (anotacionId: string) => {
    const updated = anotaciones.map((a) =>
      a.id === anotacionId ? { ...a, completado: true } : a
    );
    setAnotaciones(updated);
    localStorage.setItem("anotaciones_personalizadas", JSON.stringify(updated));
  };

  const deleteAnotacion = (anotacionId: string) => {
    const updated = anotaciones.filter((a) => a.id !== anotacionId);
    setAnotaciones(updated);
    localStorage.setItem("anotaciones_personalizadas", JSON.stringify(updated));
  };

  return {
    anotaciones,
    addAnotacion,
    getAnotacionesPorContacto,
    getRecordatoriosPendientes,
    getRecordatoriosPorContacto,
    marcarRecordatorioCompletado,
    deleteAnotacion,
  };
}
