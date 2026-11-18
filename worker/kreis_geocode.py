#!/usr/bin/env python3
"""Allocates addresses to a Zürich Kreis: swisstopo address search (api3.geo.admin.ch) -> point in the official
Stadtkreis outlines (Stadt Zürich open data). Usage: kreis_geocode.py all.json kreise.json out.json [--check]
Only exact street addresses (street + number + postal code) are used; anything else stays unknown."""
import json, re, sys, time, urllib.parse, urllib.request
UA = 'QuartierjournalBot/0.1 (pilot; family events guide for Zuerich)'

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)

def address_of(loc):
    parts = [p.strip() for p in (loc or '').split(',')]
    for i in range(len(parts) - 1):
        if re.search(r'\d', parts[i]) and re.match(r'^\d{4}\b', parts[i + 1]) and re.match(r'^[^\d]+\s+\d+\w?(\s*[-/]\s*\d+\w?)?$', re.sub(r'\s+', ' ', parts[i])):
            return f'{re.sub(chr(32)+"+", " ", parts[i])} {parts[i + 1]}'
    return None

def inside(pt, ring):
    x, y = pt; c = False
    for i in range(len(ring)):
        (x1, y1), (x2, y2) = ring[i], ring[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

def kreis_of(pt, feats):
    for f in feats:
        g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            if inside(pt, poly[0]) and not any(inside(pt, h) for h in poly[1:]): return int(f['properties']['name'])
    return None

def geocode(addr):
    q = urllib.parse.urlencode({'searchText': addr, 'type': 'locations', 'origins': 'address', 'sr': 4326, 'limit': 1})
    r = get(f'https://api3.geo.admin.ch/rest/services/api/SearchServer?{q}')['results']
    time.sleep(0.4)
    if not r: return None
    a = r[0]['attrs']; return (a['lon'], a['lat'], re.sub('<[^>]+>', '', a['label']))

if __name__ == '__main__':
    allr = json.load(open(sys.argv[1]))[0]['r']; feats = json.load(open(sys.argv[2]))['features']
    check = '--check' in sys.argv
    rows = [x for x in allr if (x['kreis'] is not None) == check and address_of(x['loc'])]
    if check: rows = rows[:60]
    out, cache = [], {}
    for x in rows:
        a = address_of(x['loc'])
        if a not in cache:
            g = geocode(a); cache[a] = (g, kreis_of((g[0], g[1]), feats) if g else None)
        g, k = cache[a]
        out.append({'id': x['id'], 'address': a, 'found': g[2] if g else None, 'kreis': k, 'known': x['kreis']})
    json.dump(out, open(sys.argv[3], 'w'), indent=1, ensure_ascii=False)
    if check: print('agree', sum(o['kreis'] == o['known'] for o in out), 'of', len(out), '| no result', sum(o['kreis'] is None for o in out), '| differ', [(o['address'], o['kreis'], o['known']) for o in out if o['kreis'] not in (None, o['known'])][:8])
    else: print('allocated', sum(o['kreis'] is not None for o in out), 'of', len(out))
