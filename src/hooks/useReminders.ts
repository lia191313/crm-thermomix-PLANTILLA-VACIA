import { useState, useEffect, useCallback } from "react";
import { alVolverALaApp } from "@/lib/alVolver";

import { supabase } from "@/lib/supabase";

export interface Reminder {
  id: string;
  contactId: number;
  contactName: string;
  frequency: number; // días
  lastContact: string; // ISO date
  nextReminder: string; // ISO date
  status: "pending" | "completed" | "overdue";
  notes?: string;
  type?: "general" | "demo" | "bienvenida" | "clase" | "reparacion" | "seguimiento" | "promocion" | "otro";
  scheduledDate?: string;
}

// Caché a nivel de módulo: todas las instancias del hook comparten los mismos datos
// (mismo patrón que useSupabaseVentas).
let _remindersCache: Reminder[] = [];
const _listeners = new Set<(reminders: Reminder[]) => void>();
let _initialLoadStarted = false;

function notifyListeners(reminders: Reminder[]) {
  _remindersCache = reminders;
  _listeners.forEach((fn) => fn(reminders));
}

// ---------- Helpers de fecha ----------
// La columna `fecha` en Supabase es `timestamp WITHOUT time zone`. Si enviásemos
// un ISO con `Z` (UTC), Postgres lo guardaría como naive y al releerlo el
// navegador lo interpretaría como hora local, dando un desfase de la zona
// horaria (en España, +/- 2h con horario de verano). Para evitarlo formateamos
// siempre la HORA LOCAL "tal cual", sin conversión a UTC. (Si en algún
// momento pasamos la columna a `timestamptz` podemos volver a `.toISOString()`
// sin problema.)
function toLocalNaiveIso(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// ---------- Broadcast multi-dispositivo del snooze ----------
// Sub-fases #27/#28. Cuando se pospone un recordatorio desde dentro de la
// app (camino in-app, no desde la notificación), llamamos a la Edge Function
// `notify-snooze-broadcast` para que cierre la notificación original en los
// otros dispositivos y muestre la confirmación allí también.
//
// Es totalmente best-effort: cualquier error se loguea y no se propaga.
// El snooze en BD ya se ha hecho cuando se llega aquí.
async function broadcastSnoozeBestEffort(reminderId: number, newDate: Date): Promise<void> {
  try {
    // Minutos relativos a "ahora" (positivos). Si por algún motivo es ≤ 0
    // (snooze al pasado, raro), forzamos a 1 para que la función no rechace.
    const diffMs = newDate.getTime() - Date.now();
    const minutes = Math.max(1, Math.round(diffMs / 60000));

    // Endpoint de la suscripción Web Push de ESTE dispositivo, para que el
    // backend nos excluya del broadcast (ya mostramos toast in-app, no
    // queremos también una notificación push duplicada en el mismo dispositivo).
    let endpoint: string | null = null;
    try {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) endpoint = sub.endpoint;
      }
    } catch (_e) {
      // si no hay SW activo o no hay suscripción, seguimos sin endpoint
    }

    const { error } = await supabase.functions.invoke("notify-snooze-broadcast", {
      body: { reminderId, minutes, endpoint },
    });
    if (error) {
      console.warn("[snooze broadcast] no se pudo emitir:", error.message ?? error);
    }
  } catch (err) {
    console.warn("[snooze broadcast] error inesperado (ignorado):", err);
  }
}

// ---------- Mapeo BD <-> interfaz pública ----------

function mapSupabaseRowToReminder(row: any): Reminder {
  return {
    id: row.id.toString(),
    contactId: row.contacto_id,
    contactName: row.contacto_nombre || "",
    frequency: row.frecuencia_dias ?? 7,
    lastContact: row.fecha_ultimo_contacto || row.created_at || row.fecha,
    nextReminder: row.fecha,
    status: row.completado_en || row.completado ? "completed" : "pending",
    notes: row.notas || row.descripcion || undefined,
    type: row.tipo || undefined,
    scheduledDate: row.fecha_programada || undefined,
  };
}

function mapReminderUpdatesToSupabase(updates: Partial<Reminder>): Record<string, any> {
  const row: Record<string, any> = {};
  if (updates.contactId !== undefined) row.contacto_id = updates.contactId;
  if (updates.contactName !== undefined) row.contacto_nombre = updates.contactName;
  if (updates.frequency !== undefined) row.frecuencia_dias = updates.frequency;
  if (updates.lastContact !== undefined) row.fecha_ultimo_contacto = updates.lastContact;
  if (updates.nextReminder !== undefined) row.fecha = updates.nextReminder;
  if (updates.notes !== undefined) row.notas = updates.notes;
  if (updates.type !== undefined) row.tipo = updates.type;
  if (updates.scheduledDate !== undefined) row.fecha_programada = updates.scheduledDate;
  if (updates.status !== undefined) {
    row.completado = updates.status === "completed";
    row.completado_en = updates.status === "completed" ? toLocalNaiveIso(new Date()) : null;
  }
  return row;
}

// ---------- Carga inicial ----------

export async function loadRemindersFromSupabase() {
  try {
    const { data, error } = await supabase
      .from("recordatorios")
      .select("*")
      .order("fecha", { ascending: true });

    if (error) throw error;

    // Mostrar todos los recordatorios no completados (incluyendo los creados desde ModalAnotacion)
    const filtered = (data || []).filter((r: any) => !r.completado_en && !r.completado);
    const mapped = filtered.map(mapSupabaseRowToReminder);
    notifyListeners(mapped);
  } catch (error) {
    console.error("Error loading reminders:", error);
  }
}

// ---------- Hook ----------

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>(_remindersCache);

  // Suscribirse al caché compartido
  useEffect(() => {
    const listener = (data: Reminder[]) => setReminders(data);
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  // Carga inicial (se ejecuta una sola vez globalmente)
  useEffect(() => {
    if (!_initialLoadStarted) {
      _initialLoadStarted = true;
      loadRemindersFromSupabase();
      // Al volver a la ventana, recargar (por si se cambiaron desde otro sitio).
      alVolverALaApp(() => loadRemindersFromSupabase());
    }
  }, []);

  const addReminder = useCallback(
    async (
      contactId: number,
      contactName: string,
      frequency: number,
      type: NonNullable<Reminder["type"]> = "general",
      scheduledDate?: string,
      notes?: string
    ): Promise<Reminder | null> => {
      const now = new Date();
      // Parseo cuidadoso de scheduledDate:
      //   - "YYYY-MM-DD" (date-only de ModalDemo): se interpreta como medianoche LOCAL,
      //     no UTC, para evitar que aparezca como 02:00 del día siguiente en CEST.
      //   - "YYYY-MM-DDTHH:MM:SS" (con hora, de DetalleContacto): se parsea como local
      //     directamente (JavaScript ya lo hace cuando no hay sufijo Z).
      const parseScheduled = (s: string) =>
        s.includes("T") ? new Date(s) : new Date(s + "T00:00:00");
      const nextDate = scheduledDate
        ? parseScheduled(scheduledDate)
        : new Date(now.getTime() + frequency * 24 * 60 * 60 * 1000);

      try {
        const { data, error } = await supabase
          .from("recordatorios")
          .insert([
            {
              contacto_id: contactId,
              contacto_nombre: contactName,
              tipo: type,
              frecuencia_dias: frequency,
              fecha: toLocalNaiveIso(nextDate),
              fecha_ultimo_contacto: toLocalNaiveIso(now),
              fecha_programada: scheduledDate || null,
              completado: false,
              notas: notes || null,
              // descripcion es NOT NULL en el esquema legacy
              descripcion: contactName || "Recordatorio",
            },
          ])
          .select()
          .single();

        if (error) throw error;

        const newReminder = mapSupabaseRowToReminder(data);
        notifyListeners([..._remindersCache, newReminder]);
        return newReminder;
      } catch (error) {
        console.error("Error adding reminder:", error);
        return null;
      }
    },
    []
  );

  const updateReminder = useCallback(
    async (reminderId: string, updates: Partial<Reminder>) => {
      try {
        const row = mapReminderUpdatesToSupabase(updates);
        const { error } = await supabase
          .from("recordatorios")
          .update(row)
          .eq("id", Number(reminderId));

        if (error) throw error;

        const nuevaLista = _remindersCache.map((r) =>
          r.id === reminderId ? { ...r, ...updates } : r
        );
        notifyListeners(nuevaLista);
      } catch (error) {
        console.error("Error updating reminder:", error);
      }
    },
    []
  );

  const completeReminder = useCallback(
    async (reminderId: string, frequency: number) => {
      // Preservamos exactamente la semántica legacy: marcar completed + empujar
      // nextReminder hacia adelante + actualizar lastContact.
      const now = new Date();
      const nextDate = new Date(now.getTime() + frequency * 24 * 60 * 60 * 1000);
      const nowIso = toLocalNaiveIso(now);
      const nextIso = toLocalNaiveIso(nextDate);

      try {
        const { error } = await supabase
          .from("recordatorios")
          .update({
            completado: true,
            completado_en: nowIso,
            fecha_ultimo_contacto: nowIso,
            fecha: nextIso,
          })
          .eq("id", Number(reminderId));

        if (error) throw error;

        const nuevaLista = _remindersCache.map((r) =>
          r.id === reminderId
            ? {
                ...r,
                status: "completed" as const,
                lastContact: nowIso,
                nextReminder: nextIso,
              }
            : r
        );
        notifyListeners(nuevaLista);
      } catch (error) {
        console.error("Error completing reminder:", error);
      }
    },
    []
  );

  // Snooze: posponer un recordatorio a una nueva fecha/hora.
  //   - Cambia `fecha` a newDate (hora local, sin conversión a UTC).
  //   - Pone `notified_at` a NULL para que el cron vuelva a notificar a la nueva hora.
  //   - Mantiene `completado=false` (sigue siendo pendiente).
  // Operación 100% aditiva: si la columna `notified_at` no existe en alguna BD vieja,
  // el update sigue funcionando porque se envía como una de las columnas a actualizar
  // y Supabase devolvería error visible — pero en producción ya está creada
  // (Sub-fase 3.1).
  const snoozeReminder = useCallback(
    async (reminderId: string, newDate: Date) => {
      const newDateIso = toLocalNaiveIso(newDate);
      try {
        const { error } = await supabase
          .from("recordatorios")
          .update({
            fecha: newDateIso,
            notified_at: null,
            completado: false,
            completado_en: null,
          })
          .eq("id", Number(reminderId));

        if (error) throw error;

        const nuevaLista = _remindersCache.map((r) =>
          r.id === reminderId
            ? {
                ...r,
                status: "pending" as const,
                nextReminder: newDateIso,
              }
            : r
        );
        notifyListeners(nuevaLista);

        // Sub-fases #27/#28 — Broadcast del snooze a los demás dispositivos.
        // 100% best-effort y no bloqueante: si falla (sin red, función caída,
        // etc.), el snooze ya está guardado en BD y todo sigue funcionando.
        // Lo lanzamos sin await para que el toast del front no se demore.
        void broadcastSnoozeBestEffort(Number(reminderId), newDate);
      } catch (error) {
        console.error("Error snoozing reminder:", error);
        throw error;
      }
    },
    []
  );

  const deleteReminder = useCallback(async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from("recordatorios")
        .delete()
        .eq("id", Number(reminderId));

      if (error) throw error;

      notifyListeners(_remindersCache.filter((r) => r.id !== reminderId));
    } catch (error) {
      console.error("Error deleting reminder:", error);
    }
  }, []);

  // Las pestañas se calculan POR DÍA CALENDARIO, no por hora exacta:
  //   - "Vencidos": día calendario anterior a hoy (ayer, anteayer…)
  //   - "Para Hoy": mismo día calendario que hoy (sin importar si la hora ya
  //                 pasó — sigue apareciendo todo el día)
  //   - "Próximos 7 días": de mañana en adelante, hasta 7 días
  // Antes se usaba la HORA exacta, lo cual hacía que un recordatorio para
  // hoy a las 16:00 no apareciera en "Para Hoy" hasta que daban las 16:00.

  const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getPendingReminders = useCallback(() => {
    const today = startOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return reminders.filter((r) => {
      const nextDate = new Date(r.nextReminder);
      return nextDate >= today && nextDate < tomorrow && r.status === "pending";
    });
  }, [reminders]);

  const getOverdueReminders = useCallback(() => {
    const today = startOfToday();
    return reminders.filter((r) => {
      const nextDate = new Date(r.nextReminder);
      return nextDate < today && r.status === "pending";
    });
  }, [reminders]);

  const getUpcomingReminders = useCallback(
    (days: number = 7) => {
      const today = startOfToday();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const limit = new Date(today);
      limit.setDate(limit.getDate() + days);
      limit.setHours(23, 59, 59, 999);
      return reminders.filter((r) => {
        const nextDate = new Date(r.nextReminder);
        return nextDate >= tomorrow && nextDate <= limit && r.status === "pending";
      });
    },
    [reminders]
  );

  // "Más adelante": recordatorios entre `fromDays` (incl.) y `toDays` (incl.)
  // contados desde HOY. Por defecto día 8 → día 90, lo que cubre todo lo que
  // queda fuera de la pestaña "Próximos 7 días" pero dentro de un horizonte
  // razonable de planificación (3 meses).
  // Es ADITIVO: la pestaña existente "Próximos 7 días" sigue calculándose con
  // `getUpcomingReminders(7)` exactamente igual que antes.
  const getLaterReminders = useCallback(
    (fromDays: number = 8, toDays: number = 90) => {
      const today = startOfToday();
      const start = new Date(today);
      start.setDate(start.getDate() + fromDays);
      start.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setDate(end.getDate() + toDays);
      end.setHours(23, 59, 59, 999);
      return reminders.filter((r) => {
        const nextDate = new Date(r.nextReminder);
        return nextDate >= start && nextDate <= end && r.status === "pending";
      });
    },
    [reminders]
  );

  return {
    reminders,
    addReminder,
    updateReminder,
    completeReminder,
    snoozeReminder,
    deleteReminder,
    getPendingReminders,
    getOverdueReminders,
    getUpcomingReminders,
    getLaterReminders,
  };
}
