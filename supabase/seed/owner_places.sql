-- Places added by the project owner (recommendations). Not checked with the venue: verification = unverified.
-- Kreis 4 / Langstrasse worked out from the street (swisstopo + Stadt Zürich quartier outlines). No house number is stated.
insert into public.venues (id, name, kind, quartier_id, address, features, status, verification, data_origin)
values ('0b8f3c5e-6d1a-5f0e-9a52-3c7d1e4f6a01', 'Guesthouse & Kafi Fürdich', 'Café', 12, 'Schreinerstrasse, 8004 Zürich', 'Guesthouse & Kafi', 'published', 'unverified', 'owner:recommendation')
on conflict (id) do nothing;
insert into public.images (id, venue_id, image_url, credit, licence_status, note)
values ('5c2e9a17-48d3-5b6f-8e21-7a0c4d9b3e02', '0b8f3c5e-6d1a-5f0e-9a52-3c7d1e4f6a01', 'https://quartierjournal.pages.dev/stock/cafe-fuerdich.webp', 'Quartierjournal', 'permitted', 'photo supplied by the project owner')
on conflict do nothing;
