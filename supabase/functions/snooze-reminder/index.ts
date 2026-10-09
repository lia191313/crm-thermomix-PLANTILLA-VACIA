// =============================================================
// Edge Function: snooze-reminder
// Sub-fase 4.2 — Posponer recordatorios desde la notificación push
//
// Esta función la llama el service worker (sw.js) cuando el usuario
// pulsa "+15 min" o "+1 hora" en los botones de la notificación.
// Recibe un token firmado HMAC-SHA256 (generado por la función
// notify-due-reminders) + los minutos a posponer.
//
// Verifica el token, extrae el reminderId, y actualiza el recordatorio
// (cambia fecha = NOW() + minutos, limpia notified_at, asegura
// completado = false).
//
// Variables de entorno necesarias:
//   - SUPABASE_URL                (autoseteada por Supabase)
//   - SUPABASE_SERVICE_ROLE_KEY   (autoseteada por Supabase)
//   - SNOOZE_SECRET               (mismo valor que en notify-due-reminders)
//
// Despliegue:
//   supabase functions deploy snooze-reminder --no-verify-jwt
//
// (Va con --no-verify-jwt porque el service worker no maneja sesión
// Supabase fácilmente; la autenticación la hacemos nosotras con el
// token HMAC.)
// =============================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { broadcastSnoozeConfirm, readVapidFromEnv } from "../_shared/snooze-broadcast.ts";

// Cabeceras CORS abiertas: el SW puede llamar desde cualquier origen
// (mis-clientes-tmx.netlify.app y futuras URLs). Permitimos también
// `apikey` y `x-client-info` porque la gateway de Supabase los inyecta
// y el preflight las verifica antes de dejar pasar la petición real.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Verifica el token con la misma lógica HMAC-SHA256 que notify-due-reminders.
// Devuelve el reminderId si es válido, null si está mal firmado o caducado.
async function verifySnoozeToken(token: string, secret: string): Promise<number | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [reminderIdStr, expiresAtStr, sigB64] = parts;
  const reminderId = Number(reminderIdStr);
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(reminderId) || reminderId <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  if (expiresAt < Math.floor(Date.now() / 1000)) {
    console.log(`[snooze] token expirado para reminder ${reminderId}`);
    return null;
  }

  const message = `${reminderIdStr}.${expiresAtStr}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  let sig: Uint8Array;
  try {
    sig = Uint8Array.from(
      atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
  } catch (_e) {
    return null;
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    encoder.encode(message)
  );
  return valid ? reminderId : null;
}

// La columna `fecha` en Supabase es timestamp WITHOUT time zone, y los
// lectores (front en España, cron en Postgres) interpretan los valores como
// hora LOCAL de España. Pero Deno (en Edge Functions) corre en UTC, así que
// no podemos usar `d.getHours()` directamente — daría hora UTC.
// Solución: formatear con Intl.DateTimeFormat forzando Europe/Madrid.
function toLocalNaiveIso(d: Date): string {
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
  // sv-SE devuelve "2026-04-27 14:30:00", convertimos a "2026-04-27T14:30:00"
  return formatted.replace(" ", "T");
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  try {
    const snoozeSecret = Deno.env.get("SNOOZE_SECRET");
    if (!snoozeSecret) {
      console.error("[snooze] SNOOZE_SECRET no configurado");
      return jsonResponse({ ok: false, error: "server misconfigured" }, 500);
    }

    let body: { token?: string; minutes?: number; endpoint?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid json body" }, 400);
    }

    // `endpoint` es opcional: si llega, es el endpoint de la suscripción Web Push
    // del dispositivo que originó la petición (lo manda el SW). Lo usamos para
    // excluirlo del broadcast — ese dispositivo ya muestra confirmación local.
    const { token, minutes, endpoint: originEndpoint } = body;
    // Log de diagnóstico: queda visible en Supabase Functions logs.
    // Si esto reporta `minutes=15` y aun así el BD se actualiza con +1h, hay
    // un bug río abajo. Si reporta `minutes=60` cuando el usuario pulsó +15,
    // el bug está en el SW del cliente.
    console.log(`[snooze] body recibido: minutes=${minutes} hasToken=${!!token} hasEndpoint=${!!originEndpoint}`);
    if (!token || typeof token !== "string") {
      return jsonResponse({ ok: false, error: "missing token" }, 400);
    }
    if (!Number.isFinite(minutes) || (minutes as number) <= 0 || (minutes as number) > 60 * 24 * 7) {
      // Limitamos a 1 semana máxima por sanidad.
      return jsonResponse({ ok: false, error: "invalid minutes" }, 400);
    }

    const reminderId = await verifySnoozeToken(token, snoozeSecret);
    if (!reminderId) {
      return jsonResponse({ ok: false, error: "invalid or expired token" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const newDate = new Date(Date.now() + (minutes as number) * 60 * 1000);
    const newDateIso = toLocalNaiveIso(newDate);

    const { error } = await supabase
      .from("recordatorios")
      .update({
        fecha: newDateIso,
        notified_at: null,
        completado: false,
        completado_en: null,
      })
      .eq("id", reminderId);

    if (error) {
      console.error("[snooze] error updating reminder:", error);
      return jsonResponse({ ok: false, error: error.message }, 500);
    }

    console.log(`[snooze] reminder ${reminderId} pospuesto a ${newDateIso}`);

    // Broadcast a los demás dispositivos (Sub-fase #27/#28).
    // 100% best-effort: si falla, el snooze ya está en BD igualmente.
    let broadcast: { sent: number; failed: number; cleaned: number } | null = null;
    try {
      const vapid = readVapidFromEnv();
      if (vapid) {
        broadcast = await broadcastSnoozeConfirm({
          supabase,
          reminderId,
          minutes: minutes as number,
          originEndpoint: originEndpoint ?? null,
          vapid,
        });
      }
    } catch (err) {
      console.error("[snooze] broadcast falló (no crítico):", err);
    }

    return jsonResponse({ ok: true, reminderId, newDate: newDateIso, broadcast });
  } catch (err: any) {
    console.error("[snooze] uncaught error:", err);
    return jsonResponse({ ok: false, error: err?.message || String(err) }, 500);
  }
});
