create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'trustkaki-proactive-check-ins',
  '*/5 * * * *',
  $job$
    with scheduler_config as (
      select
        max(decrypted_secret) filter (where name = 'trustkaki_base_url') as base_url,
        max(decrypted_secret) filter (where name = 'trustkaki_cron_secret') as cron_secret
      from vault.decrypted_secrets
      where name in ('trustkaki_base_url', 'trustkaki_cron_secret')
    )
    select net.http_get(
      url := rtrim(base_url, '/') || '/api/internal/check-ins/process-due',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || cron_secret
      ),
      timeout_milliseconds := 50000
    ) as request_id
    from scheduler_config
    where base_url is not null
      and cron_secret is not null;
  $job$
);
