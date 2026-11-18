-- Migration 3a: a new source role. Kept in its own migration because Postgres does not allow using a new enum value
-- in the same transaction that adds it.
-- 'listing' = a page that is NOT confirmed to be the organiser's own page (e.g. the link an aggregator feed gives for an event).
alter type public.source_role add value if not exists 'listing';
