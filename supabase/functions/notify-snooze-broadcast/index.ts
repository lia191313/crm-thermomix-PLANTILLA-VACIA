// =============================================================
// Edge Function: notify-snooze-broadcast
// Sub-fases #27 / #28 — Snooze multi-dispositivo desde DENTRO de la app
//
// Esta función la llama el front (src/hooks/useReminders.ts) DESPUÉS
// de haber pospuesto un recordatorio desde dentro de la app (sección
// Recordatorios → botones rápidos "+15 min", "+1 h", "Mañana"...).
//
// El front ya actualizó la BD con la sesión de la usuaria. Esta función NO
// toca BD: solo emite el push tipo "snooze-confirm" a los demás
// dispositivos para que cierren la notificación original (si la había)
// y muestren la confirmación visual.
//
// Para el camino "snooze desde la propia notificación push" usamos
// `snooze-reminder` (con token HMAC), que ya hace el broadcast por su
// cuenta tras actualizar la BD. Esta función es solo para el camino
// in-app.
//
// Variables de entorno necesarias:
//   - SUPABASE_URL                (autoseteada)
//   - SUPABASE_SERVICE_ROLE_KEY   (autoseteada)
//   - VAPID_PUBLIC_KEY
//   - VAPID_PRIVATE_KEY
//   - VAPID_SUBJECT               (opcional)
//
// Despliegue:
//   supabase functions deploy notify-snooze-broadcast --project-ref TU_PROJECT_REF
//
// (SIN --no-verify-jwt: solo la usuaria logueada con su sesión Supabase puede
// disparar el broadcast. La gateway se encarga de validar el JWT.)
// =============================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { broadcastSnoozeConfirm, readVapidFromEnv } from "../_shared/snooze-broadcast.ts";

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

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  try {
    let body: { reminderId?: number; minutes?: number; endpoint?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid json body" }, 400);
    }

    const { reminderId, minutes, endpoint: originEndpoint } = body;

    if (!Number.isFinite(reminderId) || (reminderId as number) <= 0) {
      return jsonResponse({ ok: false, error: "missing or invalid reminderId" }, 400);
    }
    if (!Number.isFinite(minutes) || (minutes as number) <= 0 || (minutes as number) > 60 * 24 * 365) {
      // Tope amplio (1 año) — solo sirve para validar que es un número sano.
      return jsonResponse({ ok: false, error: "invalid minutes" }, 400);
    }

    const vapid = readVapidFromEnv();
    if (!vapid) {
      return jsonResponse({ ok: false, error: "VAPID keys missing" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const result = await broadcastSnoozeConfirm({
      supabase,
      reminderId: reminderId as number,
      minutes: minutes as number,
      originEndpoint: originEndpoint ?? null,
      vapid,
    });

    console.log(
      `[notify-snooze-broadcast] reminder ${reminderId} → sent=${result.sent} failed=${result.failed} cleaned=${result.cleaned}`
    );
    return jsonResponse({ ok: true, ...result });
  } catch (err: any) {
    console.error("[notify-snooze-broadcast] uncaught:", err);
    return jsonResponse({ ok: false, error: err?.message || String(err) }, 500);
  }
});
