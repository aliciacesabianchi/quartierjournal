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

-- Added at the owner's request: Instagram account of Little Locals Zurich. Instagram cannot be read automatically (login wall, terms of use):
-- dates have to come from the organiser's own website/newsletter or be sent by the organiser or the owner.
insert into public.leads (id, url, name, note, origin, status)
select 'a1000000-0000-5000-8000-00000000000b'::uuid, 'https://www.instagram.com/littlelocals.zurich/', 'Little Locals Zurich',
       'Sent by the project owner. Instagram only: find the organiser''s own website or newsletter, or ask them for their programme. Do not scrape Instagram.', 'worker', 'new'
where not exists (select 1 from public.leads where id = 'a1000000-0000-5000-8000-00000000000b');

-- From the Zürich Tourismus children's pages (https://www.zuerich.com/en/zurich-for-children and /en/childrens-museums), sent by the owner.
-- Attractions in the city of Zurich, as PLACES (opening hours/prices to be confirmed on each place's own website; the tourism page is only the pointer).
insert into public.leads (id, url, name, note, origin, status)
select v.id::uuid, v.url, v.name, 'From the Zürich Tourismus children page. Add as a place (Natur & Tiere / Kunst, Geschichten & Theater) after checking opening hours, entry price and child ages on the place''s own website.', 'worker', 'new'
from (values
 ('a1000000-0000-5000-8000-00000000000c', 'https://www.zuerich.com/en/visit/place/zoo-zurich', 'Zoo Zürich'),
 ('a1000000-0000-5000-8000-00000000000d', 'https://www.zuerich.com/en/visit/culture/kulturama-museum-of-human-evolution', 'Kulturama (Museum des Menschen)'),
 ('a1000000-0000-5000-8000-00000000000e', 'https://www.zuerich.com/en/visit/culture/natural-history-museum-of-the-university-of-zurich', 'Naturhistorisches Museum der Universität Zürich'),
 ('a1000000-0000-5000-8000-00000000000f', 'https://www.zuerich.com/en/visit/culture/nonam-north-america-native-museum-zurich', 'NONAM (Nordamerika Native Museum)'),
 ('a1000000-0000-5000-8000-000000000010', 'https://www.zuerich.com/en/visit/culture/muhlerama-the-tireless-mill-on-lake-zurich', 'Mühlerama'),
 ('a1000000-0000-5000-8000-000000000011', 'https://www.zuerich.com/en/visit/culture/tram-museum-zurich', 'Tram-Museum Zürich'),
 ('a1000000-0000-5000-8000-000000000012', 'https://www.zuerich.com/en/visit/nature/uetliberg-zurichs-very-own-mountain', 'Uetliberg (Spazieren, Natur)')
) as v(id, url, name)
where not exists (select 1 from public.leads l where l.id = v.id::uuid);

-- Tourism-page attractions now added as places (see places_attractions.sql); kinderregion.ch is a directory (its list loads by script and its terms are unclear): lead only.
update public.leads set status = 'accepted', status_note = 'Added as a place with visit info from the place''s own website (2026-11-18)', checked_on = '2026-11-18'
 where id in ('a1000000-0000-5000-8000-00000000000c','a1000000-0000-5000-8000-00000000000d','a1000000-0000-5000-8000-00000000000e','a1000000-0000-5000-8000-00000000000f','a1000000-0000-5000-8000-000000000010','a1000000-0000-5000-8000-000000000011');
insert into public.leads (id, url, name, note, origin, status)
select 'a1000000-0000-5000-8000-000000000013'::uuid, 'https://kinderregion.ch/en/filter/?view=list&filter%5B%5D=zurich', 'Kinderregion.ch – Zürich (Verzeichnis)', 'Sent by the project owner. Directory of family places/activities; the list is loaded by script. Use it to find providers, then take dates and prices from each provider''s own page. Do not copy the directory.', 'worker', 'new'
where not exists (select 1 from public.leads where id = 'a1000000-0000-5000-8000-000000000013');

-- Shops sent by the owner (2026-11-24, from a Google Maps list). Sites that could not be read from here (check by hand or send addresses/hours):
insert into public.leads (id, url, name, note, origin, status)
select v.id::uuid, v.url, v.name, v.note, 'worker', 'new' from (values
 ('a1000000-0000-5000-8000-000000000014','https://www.rosaquartier.ch/','Rosa Quartier','Website refused the connection. Check by hand.'),
 ('a1000000-0000-5000-8000-000000000015','https://www.babycomeback.ch/','Baby Come Back (neu und Secondhand)','Page shows hours Mo-Fr 10-18.30, Sa 10-17 but the Zurich address is unclear (a Basel address appears). Confirm the Zurich store.'),
 ('a1000000-0000-5000-8000-000000000016','https://zvrich.com/','ZVRICH, Limmatquai 94','Could not confirm what it sells (looks like clothing). Confirm if it belongs to the guide.'),
 ('a1000000-0000-5000-8000-000000000017','https://ch.namuk.com/','Namuk (Outdoor-Kinderkleidung)','Online shop; no Zurich store address found.'),
 ('a1000000-0000-5000-8000-000000000018','https://zemabell.ch/','Zemabell (Babymode)','Online shop; no Zurich store address found.'),
 ('a1000000-0000-5000-8000-000000000019','https://www.smythstoys.com/ch/de-ch/','Smyths Toys','Site blocks automated reading; check the store locator by hand.'),
 ('a1000000-0000-5000-8000-00000000001a','https://www.de.okaidi.ch/','Okaïdi (Zürich Letzipark)','Site did not respond. Check by hand.'),
 ('a1000000-0000-5000-8000-00000000001b','http://www.nook-zh.ch/','Nook Zürich','Web address does not exist any more. Possibly closed or moved.'),
 ('a1000000-0000-5000-8000-00000000001c','http://www.mogli-chinderlade.ch/','Mogli Chinderlade','Web address does not exist any more. Possibly closed or moved.'),
 ('a1000000-0000-5000-8000-00000000001d','http://www.zero-7.ch/','Zero-7','Web address does not exist any more. Possibly closed or moved.'),
 ('a1000000-0000-5000-8000-00000000001e','http://kndkids.ch/','KND Kids','Web address does not exist any more. Possibly closed or moved.'),
 ('a1000000-0000-5000-8000-00000000001f','http://www.makingthings.ch/','Making Things','Web address does not exist any more. Possibly closed or moved.')
) as v(id, url, name, note) where not exists (select 1 from public.leads l where l.id = v.id::uuid);

-- 2026-11-24: leads that were found on platform/tourism pages now point to the provider's OWN page (the platform is only for finding providers).
update public.leads set url = 'https://www.kulturama.ch/besuchen/', status_note = 'Details taken from the museum''s own website (found via the tourism page).' where name like 'Kulturama%';
update public.leads set url = 'https://www.muehlerama.ch/ihr-besuch', status_note = 'Details taken from the museum''s own website (found via the tourism page).' where name = 'Mühlerama';
update public.leads set url = 'https://www.nmz.uzh.ch/de/besucherinformation.html', status_note = 'Details taken from the museum''s own website (found via the tourism page).' where name like 'Naturhistorisches Museum%';
update public.leads set url = 'https://www.stadt-zuerich.ch/nonam/de/museumsbesuch.html', status_note = 'Details taken from the museum''s own website (found via the tourism page).' where name like 'NONAM%';
update public.leads set url = 'https://www.tram-museum.ch/museum/preise', status_note = 'Details taken from the museum''s own website (found via the tourism page).' where name like 'Tram-Museum%';
update public.leads set url = 'https://zoo.ch/zoobesuch/oeffnungszeiten', status_note = 'Hours from the zoo''s own website; prices load dynamically there (link given).' where name = 'Zoo Zürich';
update public.leads set url = 'https://utokulm.ch/anreise', status = 'accepted', checked_on = '2026-11-24', status_note = 'Added as a place from the SZU and Uto Kulm websites.' where name like 'Uetliberg%';
update public.leads set status = 'rejected', status_note = 'Directory / platform, not a provider. Use only to find providers; never copy its listings.' where name in ('Abenteuerspielplätze (Liste)', 'Indoor-Spielplätze Zürich (Verzeichnis)', 'PLAYGROUNDS.ch (Spielplatz-Verzeichnis)', 'Kinderregion.ch – Zürich (Verzeichnis)');
