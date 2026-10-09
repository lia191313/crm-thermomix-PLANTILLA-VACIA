// =============================================================
// Helper compartido: broadcast de confirmación de snooze.
// -------------------------------------------------------------
// Cuando un recordatorio se pospone (desde una notificación push o
// desde dentro de la app), llamamos a `broadcastSnoozeConfirm` para
// avisar a TODOS los demás dispositivos:
//   - cierren la notificación original (tag: reminder-<id>)
//   - muestren un aviso "Pospuesto +Xmin / +Xh"
//
// El payload del push lleva `type: "snooze-confirm"` para que el
// service worker lo distinga del push normal de recordatorio.
//
// Uso:
//   import { broadcastSnoozeConfirm } from "../_shared/snooze-broadcast.ts";
//   await broadcastSnoozeConfirm({ supabase, reminderId, minutes,
//                                  originEndpoint, vapid });
//
// Es 100% best-effort: si falla el envío a algún endpoint NO se aborta
// el flujo principal — solo se loguea. La función original que llama
// (snooze-reminder, notify-snooze-broadcast) sigue devolviendo éxito.
// =============================================================

import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

interface PushSub {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  device_label: string | null;
}

interface BroadcastArgs {
  supabase: SupabaseClient;
  reminderId: number;
  minutes: number;
  // Endpoint del dispositivo que originó el snooze. Lo excluimos del broadcast
  // para que no reciba un duplicado (ya muestra confirmación local instantánea).
  // Si no se pasa (caso ediciones manuales, futuras), se hace broadcast a todos.
  originEndpoint?: string | null;
  vapid: VapidConfig;
}

export async function broadcastSnoozeConfirm({
  supabase,
  reminderId,
  minutes,
  originEndpoint,
  vapid,
}: BroadcastArgs): Promise<{ sent: number; failed: number; cleaned: number }> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  // Leer todas las suscripciones (proyecto monousuario, son todas las de la usuaria).
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, device_label")
    .returns<PushSub[]>();

  if (error) {
    console.error("[snooze-broadcast] error leyendo push_subscriptions:", error);
    return { sent: 0, failed: 0, cleaned: 0 };
  }
  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  // Excluir el dispositivo que originó la petición (si nos llega su endpoint).
  const targets = originEndpoint
    ? subs.filter((s) => s.endpoint !== originEndpoint)
    : subs;

  if (targets.length === 0) {
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  const payload = JSON.stringify({
    type: "snooze-confirm",
    reminderId,
    minutes,
    // tag único por recordatorio: si dos snoozes del mismo recordatorio se
    // disparan seguidos, la segunda confirmación reemplaza a la primera en
    // lugar de duplicarse.
    tag: `snooze-confirm-${reminderId}`,
  });

  let sent = 0;
  let failed = 0;
  const obsoleteSubIds: number[] = [];

  for (const sub of targets) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      // TTL bajo (60s): si el dispositivo está offline, esta confirmación ya
      // no aporta nada cuando vuelva — el recordatorio ya se reposicionó en BD
      // y al refrescar verá la nueva fecha.
      await webpush.sendNotification(subscription, payload, { TTL: 60 });
      sent++;
    } catch (err: any) {
      failed++;
      const status = err?.statusCode || err?.status;
      if (status === 404 || status === 410) {
        obsoleteSubIds.push(sub.id);
        console.log(
          `[snooze-broadcast] sub ${sub.id} (${sub.device_label}) caducada, marcando para borrar`
        );
      } else {
        console.error(
          `[snooze-broadcast] error enviando a sub ${sub.id} (${sub.device_label}):`,
          err?.body || err?.message || err
        );
      }
    }
  }

  // Limpieza de suscripciones caducadas (igual que hace notify-due-reminders).
  let cleaned = 0;
  if (obsoleteSubIds.length > 0) {
    const uniqueIds = [...new Set(obsoleteSubIds)];
    const { error: delErr } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", uniqueIds);
    if (delErr) {
      console.error("[snooze-broadcast] error borrando subs caducadas:", delErr);
    } else {
      cleaned = uniqueIds.length;
    }
  }

  return { sent, failed, cleaned };
}

// Lee las VAPID keys del entorno. Falla con un mensaje claro si faltan
// (prácticamente "no debería pasar" porque notify-due-reminders ya las usa).
export function readVapidFromEnv(): VapidConfig | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:tu-email@ejemplo.com";
  if (!publicKey || !privateKey) {
    console.error("[snooze-broadcast] VAPID keys faltan en env");
    return null;
  }
  return { publicKey, privateKey, subject };
}
