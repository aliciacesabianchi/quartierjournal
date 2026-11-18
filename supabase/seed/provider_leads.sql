-- Provider leads to check on the providers' own pages (found 2026-11-18 via the Canton of Zurich family-offers overview and web search).
-- Leads are NOT entries: nothing is published until dates, ages and prices are confirmed on the provider's own page.
insert into public.leads (id, url, name, note, origin, status)
select * from (values
 ('a1000000-0000-5000-8000-000000000001'::uuid, 'https://babyschwimmen.ch/', 'Babyschwimmen', 'Listed on the canton page. Check courses in the City of Zurich (pools, dates, ages, price, registration).', 'worker', 'new'),
 ('a1000000-0000-5000-8000-000000000002'::uuid, 'https://firstflow.wassererleben.ch/de/', 'First Flow (Wasser erleben)', 'Listed on the canton page as water experience for babies. Check locations in Zurich.', 'worker', 'new'),
 ('a1000000-0000-5000-8000-000000000003'::uuid, 'https://eltern-kind-singen.ch/', 'Verein Eltern-Kind-Singen', 'Listed on the canton page. Check groups in the City of Zurich (a source for Musik & Singen).', 'worker', 'new'),
 ('a1000000-0000-5000-8000-000000000004'::uuid, 'https://indoorspielplaetze.ch/zuerich/', 'Indoor-Spielplätze Zürich (Verzeichnis)', 'Directory page. Check each indoor playground (opening hours, entry price) on its own page.', 'worker', 'new'),
 ('a1000000-0000-5000-8000-000000000005'::uuid, 'https://kinderregion.ch/de/liste/abenteuerspielplatz/', 'Abenteuerspielplätze (Liste)', 'List of adventure playgrounds on the canton page. Check Zurich ones and their open hours.', 'worker', 'new'),
 ('a1000000-0000-5000-8000-000000000006'::uuid, 'https://www.playgrounds.ch/de/', 'PLAYGROUNDS.ch (Spielplatz-Verzeichnis)', 'Playground directory on the canton page. Possible source for playgrounds as places.', 'worker', 'new'),
 ('a1000000-0000-5000-8000-000000000007'::uuid, 'https://www.zh.ch/de/familie/angebote-fuer-familien-mit-kindern/kinder-und-jugendhilfezentren/veranstaltungen-kurse-kjz/babymassage.html', 'Babymassage-Kurse (kjz Kanton Zürich)', 'kjz course page. Check Zurich city dates; also ElKi-/MuKi-/VaKi-Treffs at the kjz.', 'worker', 'new'),
 ('a1000000-0000-5000-8000-000000000008'::uuid, null, 'Kinderzirkus Robinson (Oberstrass)', 'Found via a third-party directory: Eltern-Kind- and Vorkindergarten course, ages 2-5, paid course (registration). Find the own website. Probably not a drop-in offer.', 'worker', 'new'),
 ('a1000000-0000-5000-8000-000000000009'::uuid, null, 'Ludothek Zürich 7 / Nord / Kreis 6 / Schwamendingen / Zürich 2 / Seebach', 'Found via third-party directories (hours and addresses unreliable). Find each Ludothek''s own website; category: Shopping & Secondhand > Ludothek.', 'worker', 'new'),
 ('a1000000-0000-5000-8000-00000000000a'::uuid, null, 'Waldspiel Allmend/Brunau', 'Forest playgroup for 2.5 years to Kindergarten, Mondays (registration, quarterly fee). Probably not a drop-in offer; not shown unless open sessions exist.', 'worker', 'rejected')
) as v(id, url, name, note, origin, status)
where not exists (select 1 from public.leads l where l.id = v.id);
