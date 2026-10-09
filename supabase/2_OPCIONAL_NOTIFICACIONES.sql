-- =====================================================================
--  OPCIONAL · AVISOS AL MÓVIL DE LOS RECORDATORIOS
--
--  NO hace falta para usar la app. Sin esto, los recordatorios salen
--  igualmente en la app (aviso al abrirla y en el panel de inicio).
--
--  Ejecutar SOLO cuando ya estén hechos los pasos de la parte opcional
--  de la guía (claves VAPID y las 3 funciones de Supabase publicadas).
--  Antes de ejecutar, cambiar las 2 cosas marcadas con  <<< CAMBIAR >>>.
-- =====================================================================

-- 1) Función que devuelve los recordatorios que ya tocan (hora de España).
--    Solo la puede usar el servidor (service_role), nadie desde fuera.
create or replace function public.get_due_reminders()
returns table (
  id              bigint,
  contacto_id     bigint,
  contacto_nombre text,
  tipo            text,
  notas           text,
  fecha           timestamp
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.contacto_id, r.contacto_nombre, r.tipo, r.notas, r.fecha
  from public.recordatorios r
  where r.completado = false
    and r.notified_at is null
    and r.tipo is not null
    and (r.fecha at time zone 'Europe/Madrid') <= now()
    and (r.fecha at time zone 'Europe/Madrid') > (now() - interval '1 day')
  order by r.fecha asc
  limit 50;
$$;

revoke all on function public.get_due_reminders() from public, anon, authenticated;
grant execute on function public.get_due_reminders() to service_role;

-- 2) Cada minuto, Supabase mira si hay recordatorios y manda el aviso.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notify-due-reminders-every-minute') then
    perform cron.unschedule('notify-due-reminders-every-minute');
  end if;
end $$;

select cron.schedule(
  'notify-due-reminders-every-minute',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://TU_PROJECT_REF.supabase.co/functions/v1/notify-due-reminders',  -- <<< CAMBIAR >>>
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', 'PON_AQUI_TU_CRON_SECRET'                                   -- <<< CAMBIAR >>>
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

-- Comprobación: debe salir una fila con schedule '* * * * *'.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'notify-due-reminders-every-minute';
