import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface SnoozeMap {
  [contactId: number]: string; // ISO date hasta cuando está aplazado
}

export function useDashboardSnooze() {
  const [snoozeMap, setSnoozeMap] = useState<SnoozeMap>({});

  // Cargar aplazamientos activos al montar
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("dashboard_snooze")
        .select("contact_id, snoozed_until")
        .gt("snoozed_until", new Date().toISOString());

      if (!error && data) {
        const map: SnoozeMap = {};
        data.forEach((r: { contact_id: number; snoozed_until: string }) => {
          map[r.contact_id] = r.snoozed_until;
        });
        setSnoozeMap(map);
      }
    };
    load();
  }, []);

  /** Devuelve true si el contacto está aplazado ahora mismo */
  const isSnoozed = useCallback(
    (contactId: number): boolean => {
      const until = snoozeMap[contactId];
      if (!until) return false;
      return new Date(until) > new Date();
    },
    [snoozeMap]
  );

  /** Aplaza el contacto X días desde hoy (upsert en Supabase) */
  const snooze = useCallback(async (contactId: number, days: number) => {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const isoUntil = until.toISOString();

    // Actualizar estado local inmediatamente (optimista)
    setSnoozeMap(prev => ({ ...prev, [contactId]: isoUntil }));

    // Persistir en Supabase
    await supabase
      .from("dashboard_snooze")
      .upsert({ contact_id: contactId, snoozed_until: isoUntil }, { onConflict: "contact_id" });
  }, []);

  /** Quita el aplazamiento (para cuando se quiera volver a ver el cliente) */
  const clearSnooze = useCallback(async (contactId: number) => {
    setSnoozeMap(prev => {
      const next = { ...prev };
      delete next[contactId];
      return next;
    });

    await supabase
      .from("dashboard_snooze")
      .delete()
      .eq("contact_id", contactId);
  }, []);

  return { isSnoozed, snooze, clearSnooze };
}
