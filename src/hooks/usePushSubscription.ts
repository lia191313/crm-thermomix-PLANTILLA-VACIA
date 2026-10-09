import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// =============================================================
// usePushSubscription
// -------------------------------------------------------------
// Hook que gestiona la suscripción de este dispositivo a las
// notificaciones push del navegador.
//
// Flujo:
//   1. Comprueba si el navegador soporta Push API + Notifications.
//   2. Lee el estado actual del permiso (default / granted / denied).
//   3. subscribe() pide permiso → se suscribe al PushManager →
//      guarda { endpoint, p256dh, auth } en la tabla
//      `push_subscriptions` de Supabase (upsert por endpoint).
//   4. unsubscribe() borra la suscripción local y la fila en BD.
//
// IMPORTANTE: el envío real de las notificaciones lo hará un
// servicio en Supabase (Edge Function + pg_cron) en la Sub-fase 3.
// Este hook solo se encarga del lado cliente.
// =============================================================

// Clave VAPID pública: se pone en Netlify como VITE_VAPID_PUBLIC_KEY (la
// privada va como secret de Supabase). Es PÚBLICA por diseño. Si no está
// puesta, las notificaciones al móvil simplemente no se activan (opcional).
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "").trim();

export type PushPermissionStatus =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

// ---------- helpers ----------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function guessDeviceLabel(ua: string): string {
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "PC Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Otro";
}

// ---------- hook ----------

export function usePushSubscription() {
  const [permission, setPermission] = useState<PushPermissionStatus>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado inicial al montar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        if (!cancelled) setPermission("unsupported");
        return;
      }
      if (!cancelled) setPermission(Notification.permission as PushPermissionStatus);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!sub);
      } catch (_e) {
        // Service worker no disponible aún. No es error grave.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Tu navegador no soporta notificaciones push.");
      }

      if (!VAPID_PUBLIC_KEY) {
        throw new Error(
          "Las notificaciones al móvil aún no están configuradas (es un paso opcional de la guía)."
        );
      }

      // Pedir permiso si aún no se ha decidido.
      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
      }
      setPermission(perm as PushPermissionStatus);
      if (perm !== "granted") {
        throw new Error(
          "Permiso de notificaciones denegado. Actívalo desde los ajustes del navegador."
        );
      }

      // Suscribirse al PushManager.
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // Guardar en Supabase (upsert por endpoint para idempotencia).
      const subJson = sub.toJSON() as PushSubscriptionJSON;
      const p256dh = subJson.keys?.p256dh ?? "";
      const auth = subJson.keys?.auth ?? "";
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
      const deviceLabel = guessDeviceLabel(userAgent || "");

      const { error: upsertErr } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            endpoint: sub.endpoint,
            p256dh,
            auth,
            device_label: deviceLabel,
            user_agent: userAgent,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" }
        );

      if (upsertErr) throw upsertErr;
      setSubscribed(true);
    } catch (e: any) {
      console.error("[usePushSubscription] subscribe error:", e);
      setError(e?.message || "Error desconocido al activar notificaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Primero borramos la fila en Supabase para que el servidor deje
        // de intentar enviarle pushes; después, anulamos la suscripción local.
        const { error: deleteErr } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);
        if (deleteErr) {
          console.warn(
            "[usePushSubscription] no se pudo borrar la fila en Supabase:",
            deleteErr
          );
          // Continuamos igual: lo importante es desuscribir el navegador.
        }
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e: any) {
      console.error("[usePushSubscription] unsubscribe error:", e);
      setError(e?.message || "Error al desactivar notificaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permission,
    subscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}
