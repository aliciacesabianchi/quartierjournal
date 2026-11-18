-- Migration 6: a district can also be derived from the exact street address (geocoded, tested against the official Kreis outlines).
alter table public.activities drop constraint if exists activities_district_basis_check;
alter table public.activities add constraint activities_district_basis_check
  check (district_basis in ('postal_code', 'street', 'organiser_area', 'address'));
