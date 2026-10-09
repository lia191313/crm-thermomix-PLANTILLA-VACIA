// =============================================================
// Edge Function: notify-due-reminders
// Sub-fase 3 — Notificaciones push para Mis Clientes TMX
//
// Esta función:
//   1. Pregunta a Postgres qué recordatorios están vencidos y aún
//      NO se han notificado (función get_due_reminders).
//   2. Para cada recordatorio, envía un Web Push a TODOS los
//      dispositivos registrados en push_subscriptions.
//   3. Marca el recordatorio con notified_at = now() para que no
//      se reenvíe en la siguiente ejecución del cron.
//   4. Si una suscripción devuelve 404/410 (dispositivo desuscrito
//      o caducado), la borra de la BD para no volver a intentarlo.
//
// La función la dispara pg_cron cada minuto (Sub-fase 3.3).
//
// Variables de entorno (secrets) necesarias:
//   - SUPABASE_URL                (autoseteada por Supabase)
//   - SUPABASE_SERVICE_ROLE_KEY   (autoseteada por Supabase)
//   - VAPID_PUBLIC_KEY
//   - VAPID_PRIVATE_KEY
//   - VAPID_SUBJECT               (ej: "mailto:tu-email@ejemplo.com")
//   - CRON_SECRET                 (cadena aleatoria; quien llame a la función
//                                  debe enviarla en el header X-Cron-Secret)
// =============================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

interface DueReminder {
  id: number;
  contacto_id: number;
  contacto_nombre: string | null;
  tipo: string | null;
  notas: string | null;
  fecha: string;
}

// Genera un token firmado HMAC-SHA256 que el service worker incluirá al pulsar
// los botones "+15min" / "+1h" de la notificación. La función snooze-reminder
// verifica la firma antes de tocar la BD. Sin esto, cualquiera con la URL del
// endpoint podría posponer recordatorios. El token caduca a las 24h.
async function generateSnoozeToken(reminderId: number, secret: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const message = `${reminderId}.${expiresAt}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${message}.${sigB64}`;
}

interface PushSub {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  device_label: string | null;
}

// Etiquetas legibles por tipo de recordatorio (idénticas a las de la UI)
const TIPO_LABELS: Record<string, string> = {
  general: "Recordatorio",
  demo: "DEMO",
  bienvenida: "Bienvenida",
  clase: "Clase",
  reparacion: "Reparación",
  seguimiento: "Seguimiento",
  promocion: "Promoción",
  otro: "Recordatorio",
};

async function buildNotification(reminder: DueReminder, snoozeSecret: string | null) {
  const nombre = reminder.contacto_nombre || "un contacto";
  const tipoLabel = TIPO_LABELS[reminder.tipo || "general"] || "Recordatorio";
  const title = `${tipoLabel}: ${nombre}`;

  let body = `Toca llamar a ${nombre}.`;
  if (reminder.notas && reminder.notas.trim().length > 0) {
    body = reminder.notas.trim();
  }

  // url: query params para que la app navegue directamente a la sección
  // Recordatorios (y deje el contactId disponible por si en el futuro lo
  // queremos abrir directamente). El service worker leerá estos params
  // y se los pasará al main thread de la app.
  const url = `/?section=recordatorios&reminderId=${reminder.id}&contactId=${reminder.contacto_id}`;

  // Si tenemos SNOOZE_SECRET configurado, generamos token y añadimos los
  // botones de acción "+15min" / "+1h". Si no, omitimos los botones y la
  // notificación funciona como antes (sin posponer desde el aviso).
  const payload: Record<string, any> = {
    title,
    body,
    url,
    tag: `reminder-${reminder.id}`,
    reminderId: reminder.id,
    contactId: reminder.contacto_id,
  };

  if (snoozeSecret) {
    payload.snoozeToken = await generateSnoozeToken(reminder.id, snoozeSecret);
    // TEMPORAL: solo dejamos un botón ("+15 min") para evitar cualquier
    // ambigüedad. Habíamos detectado un bug en producción donde clic en
    // "+15 min" acababa posponiendo 1 hora — la causa exacta no la
    // localicé pero con un único botón es imposible que ocurra. Cuando
    // se identifique el origen del bug se puede volver a añadir
    // "+1 hora" como segundo botón.
    payload.actions = [
      { action: "snooze:15", title: "+15 min" },
    ];
  }

  return payload;
}

Deno.serve(async (req) => {
  try {
    // Verificación del shared secret. Solo el cron de Supabase conoce este
    // valor (lo guardamos como secret de la function y lo enviamos como header
    // desde pg_cron). Sin esto, cualquiera con la URL podría disparar la
    // función. Con esto, queda protegida sin necesidad de JWT.
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const receivedSecret = req.headers.get("x-cron-secret");
    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:tu-email@ejemplo.com";
    // Si está definido, las notificaciones llevarán botones de Posponer (+15 / +1h).
    // Si no está, las notificaciones siguen funcionando pero sin botones (legacy).
    const snoozeSecret = Deno.env.get("SNOOZE_SECRET") || null;

    if (!vapidPublic || !vapidPrivate) {
      return new Response(
        JSON.stringify({ ok: false, error: "VAPID keys missing in env" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1. Recordatorios vencidos no notificados.
    const { data: due, error: dueErr } = await supabase
      .rpc("get_due_reminders")
      .returns<DueReminder[]>();

    if (dueErr) {
      console.error("Error get_due_reminders:", dueErr);
      return new Response(
        JSON.stringify({ ok: false, error: dueErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!due || due.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "no due reminders" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Suscripciones (todas — proyecto monousuario).
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, device_label")
      .returns<PushSub[]>();

    if (subsErr) {
      console.error("Error reading push_subscriptions:", subsErr);
      return new Response(
        JSON.stringify({ ok: false, error: subsErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!subs || subs.length === 0) {
      // Sin dispositivos suscritos: marcamos los recordatorios como notificados
      // igualmente para no reintentar enviar a la nada en cada tick.
      await supabase
        .from("recordatorios")
        .update({ notified_at: new Date().toISOString() })
        .in("id", due.map((r) => r.id));

      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "no subscriptions" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;
    const obsoleteSubIds: number[] = [];

    // 3. Enviar pushes.
    for (const reminder of due) {
      const payload = JSON.stringify(await buildNotification(reminder, snoozeSecret));

      for (const sub of subs) {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 });
          sent++;
        } catch (err: any) {
          failed++;
          const status = err?.statusCode || err?.status;
          // 404 / 410: el navegador ya desuscribió este endpoint → limpiar BD.
          if (status === 404 || status === 410) {
            obsoleteSubIds.push(sub.id);
            console.log(`[push] subscription ${sub.id} (${sub.device_label}) is gone, marking for removal`);
          } else {
            console.error(`[push] error sending to sub ${sub.id} (${sub.device_label}):`, err?.body || err?.message || err);
          }
        }
      }

      // 4. Marcar este recordatorio como notificado.
      const { error: markErr } = await supabase
        .from("recordatorios")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", reminder.id);
      if (markErr) {
        console.error(`[push] no se pudo marcar reminder ${reminder.id} como notificado:`, markErr);
      }
    }

    // 5. Limpiar suscripciones caducadas (deduplicar por id).
    if (obsoleteSubIds.length > 0) {
      const uniqueIds = [...new Set(obsoleteSubIds)];
      const { error: delErr } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", uniqueIds);
      if (delErr) {
        console.error("[push] error deleting obsolete subs:", delErr);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reminders_processed: due.length,
        subscriptions: subs.length,
        sent,
        failed,
        cleaned_subs: obsoleteSubIds.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[notify-due-reminders] uncaught error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
