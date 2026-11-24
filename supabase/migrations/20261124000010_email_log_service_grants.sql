-- Migration 10: the email function (service role) must be able to read and write the private send log.
-- Clients (anon/authenticated) still have no access at all.
grant select, insert on public.email_log to service_role;
