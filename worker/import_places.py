#!/usr/bin/env python3
"""Places (museums, zoo) with visit information taken from each place's OWN website (checked 2026-11-18).
Writes supabase/seed/places_attractions.sql. Kreis comes from the address (swisstopo address search + official quartier outlines).
Usage: import_places.py quartiere.json out.sql"""
import json, re, sys, uuid
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kreis_geocode import geocode, inside
NS = uuid.UUID('6f1c2c0e-0b1e-4c53-9a47-5d2f2f7a1a99')
CHECKED = '2026-11-18'
uid = lambda *p: str(uuid.uuid5(NS, ':'.join(map(str, p))))
def q(v):
    if v is None: return 'null'
    return "'" + str(v).replace("'", "''") + "'"
PLACES = [
 dict(name='Kunsthaus Zürich', kind='Museum', address='Heimplatz 1, 8001 Zürich', url='https://www.kunsthaus.ch/besuch-planen/besucherinfos/',
  hours='Di–Mi und Fr–So 10–18 Uhr · Do 10–20 Uhr · Montag geschlossen. Geschlossen am 25.12.2026 und 1.1.2027.',
  admission='Kinder und Jugendliche unter 14 Jahren: gratis. Erwachsene: Sammlung CHF 24 (ermässigt 17), grosse Ausstellung CHF 31 (ermässigt 22).',
  free='Mittwochs ist der Eintritt in die Sammlung für alle kostenlos (Ausstellungen kosten extra).',
  tips='Kinderwagen sind erlaubt (mit Auflagen). Essen und Trinken, auch Babynahrung und Milchflaschen, nur im Café beim Eingang. Der Kinder-Audioguide ist kostenlos. Die Kinderworkshops am Mittwoch sind für Kinder ab 6 Jahren.'),
 dict(name='Landesmuseum Zürich', kind='Museum', address='Museumstrasse 2, 8001 Zürich', url='https://www.landesmuseum.ch/familien',
  hours='Di–So 10–17 Uhr · Montag geschlossen. 24.12.2026 bis 14 Uhr. Geschlossen am 19.4.2027 (Sechseläuten) und 13.9.2027 (Knabenschiessen).',
  admission='Kinder und Jugendliche bis 16 Jahre: Eintritt frei. Erwachsene: Preise auf landesmuseum.ch/tickets.',
  free='Kinder und Jugendliche bis 16 Jahre haben immer freien Eintritt.',
  tips='Familienausstellung mit drei Themenräumen (Orient, Schifffahrt, Eisenbahn). Mittwoch- und Samstagnachmittag: interaktiv erzählte Geschichte auf Sitzkissen. Mit dem Entdeckungskoffer können Kinder das Museum auf eigene Faust erkunden. Hinweise zum Kinderwagen: auf der Website unter «Mit dem Kinderwagen ins Museum».'),
 dict(name='Naturhistorisches Museum der Universität Zürich', kind='Museum', address='Karl-Schmid-Strasse 4, 8006 Zürich', url='https://www.nmz.uzh.ch/de/besucherinformation.html',
  hours='Di–So 10–17 Uhr · Donnerstagabend 17.30–20 Uhr (nur für Erwachsene) · Montag geschlossen. Geschlossen: 24.–26.12., 31.12.–2.1., Ostermontag, Pfingstmontag, 1. Mai, 1. August.',
  admission='Eintritt frei (eine Spende in die «Exit-Pricing-Box» ist erwünscht).',
  free='Immer gratis.',
  tips='Kinder unter 12 Jahren haben nur in Begleitung Erwachsener Zutritt. Wegen der begrenzten Platzverhältnisse bittet das Museum, wenn möglich auf Kinderwagen und grössere Kindertransportmittel zu verzichten. Familienworkshops: siehe Website.'),
 dict(name='Kulturama – Museum des Menschen', kind='Museum', address='Englischviertelstrasse 9, 8032 Zürich', url='https://www.kulturama.ch/besuchen/',
  hours='Di, Do, Fr 13–17 Uhr · Mi 13–20 Uhr · Sa, So 13–18 Uhr.',
  admission='Erwachsene CHF 14 · Kinder und Jugendliche 6–16 Jahre CHF 9. Ein Preis für jüngere Kinder ist auf der Website nicht aufgeführt: bitte beim Museum nachfragen.',
  free='Freier Eintritt gegen Vorweisen bestimmter Karten (Liste auf kulturama.ch/besuchen).',
  tips='Für einen ruhigen Besuch empfiehlt das Museum Dienstag bis Freitag am späteren Nachmittag, Mittwochabend bis 20 Uhr oder schönes Wetter. Im Eintritt inbegriffen: Entdeckungstour und Parcours für Kinder (selbständig).'),
 dict(name='NONAM – Nordamerika Native Museum', kind='Museum', address='Seefeldstrasse 317, 8008 Zürich', url='https://www.stadt-zuerich.ch/nonam/de/museumsbesuch.html',
  hours='Di–Sa 13–17 Uhr · So 10–17 Uhr · Montag geschlossen. Im November 2026 nur am Wochenende geöffnet (Di–Fr geschlossen wegen Aufbau der neuen Sonderausstellung; 30 % Rabatt auf den Eintritt). Geschlossen am Pfingstmontag.',
  admission='Erwachsene CHF 17 (ermässigt 9) · Kinder 6–18 Jahre CHF 6 · Familien CHF 30. Ein Preis für Kinder unter 6 Jahren ist auf der Website nicht aufgeführt.',
  free=None,
  tips='Haltestelle Wildbachstrasse empfohlen. Bauarbeiten an der Seefeldstrasse können die Anreise erschweren.'),
 dict(name='Mühlerama', kind='Museum', address='Seefeldstrasse 231, 8008 Zürich', url='https://www.muehlerama.ch/ihr-besuch',
  hours='Di, Do, Fr, Sa 14–18 Uhr · Mi 14–21 Uhr · So 10–17 Uhr. Backwerkstatt: Di–Sa 14–16.30 Uhr, So und Feiertage 10–15.30 Uhr. Geschlossen am 24., 25., 26. und 31.12.2026 und am 1.1.2027.',
  admission='Erwachsene CHF 15 · Kinder und Jugendliche 6–18 Jahre CHF 9 · Kinder 2–5 Jahre CHF 5 (Preise ab 1.1.2025). Ein Preis für Kinder unter 2 Jahren ist auf der Website nicht aufgeführt.',
  free='Freier Eintritt mit ZürichCARD, Kulturlegi, Schweizerischem Museumspass und Raiffeisen Member Plus Karte.',
  tips='Kinder unter 16 Jahren nur mit erwachsener Begleitung. In der Backwerkstatt kann es zu Wartezeiten kommen: das Museum empfiehlt, den Besuch am Empfang zu planen. Mittwochs bis 21 Uhr geöffnet.'),
 dict(name='Tram-Museum Zürich', kind='Museum', address='Forchstrasse 260, 8008 Zürich', url='https://www.tram-museum.ch/museum/preise',
  hours='Mo, Mi, Sa, So 13–18 Uhr.',
  admission='Kinder 0–5 Jahre: gratis · Kinder 6–16 Jahre CHF 7 · Erwachsene CHF 14 · Familieneintritt CHF 28 (max. 2 Erwachsene mit eigenen Kindern oder Enkeln).',
  free='Kinder bis 5 Jahre immer gratis. Freier Eintritt auch mit ZürichCard und Museumspässen.',
  tips='Anreise mit Tram 4 Richtung Rehalp bis Burgwies. Das Museum ist teilweise rollstuhlgängig. Fahrten der Museumslinie 21: siehe Website.'),
 dict(name='Uetliberg (Uto Kulm)', kind='Ausflugsziel', address=None, url='https://utokulm.ch/anreise',
  hours=None,
  admission='Zugfahrt: Tarif des ZVV, siehe szu.ch.',
  free=None,
  tips='Anreise: Ab Zürich HB mit der Uetliberg-Bahn SZU (S10) von Gleis 22, 20 Minuten bis zur Endstation Uetliberg; der Fahrplan steht auf szu.ch. Der Gipfel Uto Kulm liegt auf 871 m ü. M. Auf dem Planetenweg (Angebot der SZU) sind «Sonne, Mond und Sterne zum Greifen nah». Zu Fuss ab Uitikon-Waldegg oder ab Albisgüetli etwa 45 Minuten. Das Hotel Uto Kulm empfiehlt den kostenlosen Parkplatz Feldermoos in Uitikon-Waldegg. Ob der Weg mit Kinderwagen geeignet ist, haben wir nicht geprüft.'),
 dict(name='Zoo Zürich', kind='Zoo', address='Zürichbergstrasse 221, 8044 Zürich', url='https://zoo.ch/zoobesuch/oeffnungszeiten',
  hours='März bis Oktober 9–18 Uhr (Masoala Regenwald 10–18 Uhr) · November bis Februar 9–17 Uhr (Masoala Regenwald 10–17 Uhr). Am 24. Dezember schliesst der Zoo um 16 Uhr.',
  admission='Preise für Tageseintritt und Jahreskarte: siehe zoo.ch/zoobesuch/tickets-preise (auf der Website laufend aktualisiert). IV-Beziehende und Kulturlegi-Inhabende erhalten reduzierte Preise an der Tageskasse.',
  free=None,
  tips='Gruppen ab 10 Personen haben separate Preise und Bedingungen.'),
]
if __name__ == '__main__':
    quartiere = json.load(open(sys.argv[1]))['features']
    E = ['-- Generated by worker/import_places.py. Visit information read from each place\'s own website on ' + CHECKED + '. Safe to re-run (updates the info columns).']
    for p in PLACES:
        g = geocode(p['address']) if p['address'] else None; qn = None
        if g:
            for f in quartiere:
                geom = f['geometry']; polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
                if any(inside((g[0], g[1]), pl[0]) for pl in polys): qn = f['properties']['qname']; break
        print(f"{p['name']}: {p['address']} -> {g[2] if g else None} -> {qn}", file=sys.stderr)
        vid = uid('venue', p['name'])
        qsel = f"(select q.id from public.quartiers q join public.districts d on d.id = q.district_id where d.city_id = 'zurich' and q.name = {q(qn)})" if qn else 'null'
        E.append("insert into public.venues (id, name, kind, quartier_id, address, status, verification, data_origin, opening_hours, admission, free_when, visit_tips, info_checked_on) values "
                 f"({q(vid)}, {q(p['name'])}, {q(p['kind'])}, {qsel}, {q(p['address'])}, 'published', 'provider_verified', 'provider:site', {q(p['hours'])}, {q(p['admission'])}, {q(p['free'])}, {q(p['tips'])}, {q(CHECKED)}) "
                 "on conflict (id) do update set opening_hours = excluded.opening_hours, admission = excluded.admission, free_when = excluded.free_when, visit_tips = excluded.visit_tips, info_checked_on = excluded.info_checked_on;")
        E.append(f"insert into public.sources (id, url) values ({q(uid('source', p['url']))}, {q(p['url'])}) on conflict (url) do nothing;")
        E.append(f"insert into public.source_links (source_id, role, venue_id) select id, 'organiser', {q(vid)} from public.sources where url = {q(p['url'])} on conflict do nothing;")
    open(sys.argv[2], 'w', encoding='utf8').write('\n'.join(E) + '\n')
