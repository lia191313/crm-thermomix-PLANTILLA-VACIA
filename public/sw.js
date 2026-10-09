// Service worker para PWA instalable + notificaciones push.
// Estrategia de fetch: network-first — siempre intenta red, usa caché como
// respaldo si no hay conexión.

const CACHE = "mis-clientes-tmx-v9";
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

// Endpoint Supabase para snooze desde notificación. URL y anon key son
// públicas (las mismas de la app, configuradas en Netlify) y llegan en la
// dirección del propio sw.js (?u=...&k=..., ver index.html). La seguridad
// real la da el snoozeToken HMAC firmado por la Edge Function notify-due-reminders.
const SW_PARAMS = new URL(self.location.href).searchParams;
const SUPABASE_URL = SW_PARAMS.get("u") || "";
const SUPABASE_ANON_KEY = SW_PARAMS.get("k") || "";
const SNOOZE_ENDPOINT = `${SUPABASE_URL}/functions/v1/snooze-reminder`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Solo manejar GET. Dejar pasar POST/PUT/etc (ej. llamadas a Supabase).
  if (req.method !== "GET") return;

  // Dejar pasar peticiones a Supabase y otras APIs sin cachear
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Solo cacheamos respuestas válidas del mismo origen
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return response;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
  );
});

// =============================================================
// PUSH NOTIFICATIONS
// -------------------------------------------------------------
// Cuando el servidor (Supabase Edge Function en la Sub-fase 3)
// envíe un push, llega aquí. Mostramos una notificación nativa
// del SO. Cuando el usuario toca la notificación, abrimos la
// app (o le damos foco si ya está abierta).
// =============================================================

self.addEventListener("push", (event) => {
  // El payload viene como JSON: { title, body, url, tag }.
  // Si por lo que sea no se puede parsear, usamos valores por
  // defecto para que la notificación nunca falle del todo.
  let payload = {};
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (_e) {
    try {
      payload = { body: event.data ? event.data.text() : "" };
    } catch (_e2) {
      payload = {};
    }
  }

  // ----------------------------------------------------------------
  // Rama especial: broadcast multi-dispositivo de "snooze confirmado"
  // (Sub-fases #27/#28). Lo dispara el backend cuando OTRO dispositivo
  // (o este mismo, en el camino in-app) acaba de posponer el recordatorio.
  //
  // Lo que hacemos:
  //   1. Cerrar la notificación original del recordatorio (tag: reminder-<id>)
  //      que sigue visible en este dispositivo si todavía no la habíamos
  //      pulsado.
  //   2. Mostrar la confirmación "Pospuesto +Xmin" con el mismo tag y misma
  //      lógica que la confirmación local — así son indistinguibles para la usuaria.
  //   3. Avisar a las pestañas abiertas (postMessage "reminder-snoozed") para
  //      que la app refresque los recordatorios desde BD.
  //
  // Este push NUNCA crea una notificación de recordatorio nueva.
  // ----------------------------------------------------------------
  if (payload && payload.type === "snooze-confirm") {
    const reminderId = payload.reminderId;
    const minutes = Number(payload.minutes) || 0;
    // Log de diagnóstico: nos dice qué minutos vinieron en el broadcast.
    // Útil para detectar si el bug está en el origen (móvil envió mal),
    // en el backend (Edge Function alteró el valor) o en el receptor.
    console.log(`[sw snooze-confirm] broadcast recibido reminderId=${reminderId} minutes=${minutes}`);
    event.waitUntil(
      (async () => {
        // 1. Cerrar el aviso del recordatorio original si sigue visible.
        try {
          const originals = await self.registration.getNotifications({
            tag: `reminder-${reminderId}`,
          });
          originals.forEach((n) => n.close());
        } catch (_e) {}
        // 2. Mostrar confirmación (mismo formato y tag por reminder que la local).
        await showSnoozeConfirmation(minutes, true, reminderId);
        // 3. Refrescar la app abierta si hay pestañas vivas.
        try {
          const allClients = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
          for (const client of allClients) {
            try {
              client.postMessage({ type: "reminder-snoozed", reminderId, minutes });
            } catch (_e) {}
          }
        } catch (_e) {}
      })()
    );
    return;
  }

  const title = payload.title || "Mis Clientes TMX";
  const body = payload.body || "Tienes un recordatorio pendiente.";
  const url = payload.url || "/?section=recordatorios";
  const tag = payload.tag || "recordatorio";

  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    renotify: true,
    // requireInteraction: true → la notificación NO se cierra sola; espera
    // a que el usuario la pulse o la descarte. Necesario para que dé tiempo
    // a leer y a pulsar los botones de Posponer.
    requireInteraction: true,
    // Si la Edge Function envió botones de acción ("+15min", "+1h"), los
    // mostramos. Si no, la notificación es la clásica de solo "abrir app".
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    // Guardamos toda la info útil en data para usarla en notificationclick.
    data: {
      url,
      reminderId: payload.reminderId,
      contactId: payload.contactId,
      snoozeToken: payload.snoozeToken,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Helper: posponer un recordatorio llamando a la Edge Function snooze-reminder.
// Devuelve true si fue exitoso, false si hubo cualquier error.
//
// Mandamos también el `endpoint` de NUESTRA suscripción Web Push, para que la
// Edge Function pueda excluirnos del broadcast a los demás dispositivos
// (Sub-fases #27/#28). Si no se puede leer el endpoint, mandamos null y el
// broadcast simplemente no excluirá a nadie — el dispositivo originario
// recibiría un duplicado, pero como usa el mismo tag `snooze-confirm-<id>`
// se reemplazaría sin parpadeo visible.
async function snoozeReminderViaApi(token, minutes) {
  if (!token) return false;
  let endpoint = null;
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) endpoint = sub.endpoint;
  } catch (_e) {
    // Si no podemos leer la suscripción, seguimos sin endpoint.
  }
  try {
    const res = await fetch(SNOOZE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header obligatorio para que Supabase enrute la petición a la function.
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ token, minutes, endpoint }),
    });
    if (!res.ok) {
      console.error("[sw snooze] respuesta no OK:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sw snooze] fetch falló:", err);
    return false;
  }
}

// Muestra una mini notificación de confirmación tras posponer.
// Auto-cierra a los 3s para que no moleste.
//
// El tag es por recordatorio (`snooze-confirm-<id>`) para:
//   1. Que la confirmación generada por el broadcast multi-dispositivo
//      (Sub-fases #27/#28) reemplace a esta sin duplicados visibles.
//   2. Que dos snoozes del mismo recordatorio no dejen dos avisos
//      apilados; siempre se ve el último.
//   3. Que dos snoozes de recordatorios distintos sí coexistan.
//
// `reminderId` es opcional por compatibilidad — si no llega, se cae a
// un tag genérico (comportamiento previo).
// Formatea una duración en minutos a una cadena humana ("15 min", "1h", "1h 30 min").
function formatSnoozeDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest} min`;
}

async function showSnoozeConfirmation(minutes, success, reminderId) {
  const durationText = formatSnoozeDuration(minutes);
  const title = success ? `Pospuesto ${durationText}` : "No se pudo posponer";
  // El cuerpo incluye explícitamente la duración para que siempre sea claro
  // qué intervalo se aplicó (útil tanto para la usuaria como para diagnosticar si la
  // confirmación del PC no coincidiera con lo que pulsó en el móvil).
  const body = success
    ? `Te volveré a avisar en ${durationText}.`
    : "Comprueba tu conexión y vuelve a intentarlo.";
  const tag = reminderId ? `snooze-confirm-${reminderId}` : "snooze-confirm";
  await self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    renotify: true,
    // silent: false → la confirmación es VISIBLE como heads-up en móvil.
    // Sin esto, en Android aparece silenciosa en el shade y la usuaria la pierde.
    silent: false,
  });
  // Cerramos la confirmación a los 3 segundos para que no se quede.
  setTimeout(async () => {
    const notes = await self.registration.getNotifications({ tag });
    notes.forEach((n) => n.close());
  }, 3000);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || "/?section=recordatorios";
  const reminderId = data.reminderId;
  const contactId = data.contactId;
  const snoozeToken = data.snoozeToken;
  const action = event.action;

  // Si el usuario pulsó uno de los botones de snooze, NO abrimos la app:
  // hacemos la llamada a la API y mostramos confirmación. Si falla la red,
  // como respaldo abrimos la app para que pueda posponer manualmente.
  // Extracción de minutos a partir del action ID. Soportamos dos formatos:
  //   1. Nuevo (recomendado): "snooze:<minutos>" — los minutos están en el ID.
  //      Ej. "snooze:15", "snooze:60". Se parsean directos del string.
  //   2. Viejo (backward compat): "snooze15" → 15 / "snooze1h" → 60. Por si
  //      todavía queda alguna notificación en cola de un envío previo.
  let snoozeMinutes = 0;
  if (typeof action === "string" && action.startsWith("snooze:")) {
    const parsed = parseInt(action.substring("snooze:".length), 10);
    if (Number.isFinite(parsed) && parsed > 0) snoozeMinutes = parsed;
  } else if (action === "snooze15") {
    snoozeMinutes = 15;
  } else if (action === "snooze1h") {
    snoozeMinutes = 60;
  }

  if (snoozeMinutes > 0) {
    const minutes = snoozeMinutes;
    // Log de diagnóstico: queda en la consola del Service Worker. Lo puedes
    // ver en DevTools → Application → Service Workers → click en el origen → Console.
    console.log(`[sw snooze] click action=${action} → minutes=${minutes} reminderId=${reminderId}`);
    event.waitUntil(
      (async () => {
        const ok = await snoozeReminderViaApi(snoozeToken, minutes);
        await showSnoozeConfirmation(minutes, ok, reminderId);
        if (ok) {
          // Avisar a las pestañas abiertas para que refresquen los
          // recordatorios desde BD y se vea la nueva fecha sin F5.
          try {
            const allClients = await self.clients.matchAll({
              type: "window",
              includeUncontrolled: true,
            });
            for (const client of allClients) {
              try {
                client.postMessage({ type: "reminder-snoozed", reminderId, minutes });
              } catch (_e) {}
            }
          } catch (_e) {}
        }
        if (!ok && self.clients.openWindow) {
          // Fallback: abrir la app para que pueda posponer manualmente.
          await self.clients.openWindow(targetUrl);
        }
      })()
    );
    return;
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Si ya hay una ventana de la app abierta, en lugar de recargarla
      // (lo que perdería estado y haría parpadear todo), le mandamos un
      // mensaje al main thread para que cambie de sección sin reload.
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            await client.focus();
            try {
              client.postMessage({
                type: "navigate",
                section: "recordatorios",
                reminderId,
                contactId,
              });
            } catch (_e) {
              // Si postMessage falla (raro), intentamos navigate como fallback.
              if ("navigate" in client) {
                try {
                  await client.navigate(targetUrl);
                } catch (_e2) {}
              }
            }
            return;
          }
        } catch (_e) {
          // Ignorar clientes con URLs raras.
        }
      }
      // Si no hay ninguna abierta, abrimos una nueva con la URL completa
      // (incluye los query params para que App.tsx los lea al arrancar).
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
