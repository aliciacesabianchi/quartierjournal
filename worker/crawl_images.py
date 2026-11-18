#!/usr/bin/env python3
"""Finds each provider's own preview image (og:image / twitter:image) for the listed pages.
Polite: robots.txt respected, one request per host every 1.5 s, first 300 KB of a page only, own user agent.
Nothing is downloaded or stored except the image ADDRESS; the website links to the provider's server.
Usage: crawl_images.py pages.json out.json    then: images_sql.py out.json out.sql  (same file, --sql)
"""
import json, re, sys, time, uuid, collections, threading, urllib.request, urllib.robotparser
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

UA = 'QuartierjournalBot/0.1 (pilot; family events guide for Zuerich; reads public preview images)'
NS = uuid.UUID('6f1c2c0e-0b1e-4c53-9a47-5d2f2f7a1a10')
DELAY = 1.5

class Meta(HTMLParser):
    def __init__(s): super().__init__(); s.img = {}
    def handle_starttag(s, tag, attrs):
        if tag != 'meta': return
        a = {k.lower(): (v or '') for k, v in attrs}
        key = (a.get('property') or a.get('name') or '').lower()
        if key in ('og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src') and a.get('content'):
            s.img.setdefault(key, a['content'].strip())

robots = {}
def allowed(url):
    host = urlparse(url).netloc
    if host not in robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(f'https://{host}/robots.txt', headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=15) as r: rp.parse(r.read(200000).decode('utf-8', 'ignore').splitlines())
        except urllib.error.HTTPError as e:
            if e.code in (401, 403): rp.disallow_all = True
            else: rp.allow_all = True
        except Exception: rp.allow_all = True
        robots[host] = rp
    return robots[host].can_fetch(UA, url)

def fetch_one(url):
    if not allowed(url): return {'status': 'robots'}
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
        with urllib.request.urlopen(req, timeout=20) as r:
            if 'html' not in (r.headers.get('Content-Type') or ''): return {'status': 'not_html'}
            html = r.read(300000).decode('utf-8', 'ignore')
            final = r.geturl()
    except Exception as e:
        return {'status': 'error', 'note': str(e)[:80]}
    p = Meta()
    try: p.feed(html)
    except Exception: pass
    for k in ('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'):
        if k in p.img:
            img = urljoin(final, p.img[k])
            if img.startswith('https://') and len(img) < 600: return {'status': 'ok', 'image': img}
    return {'status': 'none'}

def host_job(items):
    out = {}
    for url in items:
        out[url] = fetch_one(url); time.sleep(DELAY)
    return out

if __name__ == '__main__':
    raw = json.load(open(sys.argv[1]))
    pages = collections.defaultdict(set)
    for r in raw: pages[r['url']].add(r['activity_id'])
    byhost = collections.defaultdict(list)
    for u in pages: byhost[urlparse(u).netloc].append(u)
    res = {}
    with ThreadPoolExecutor(max_workers=len(byhost)) as ex:
        for part in ex.map(host_job, byhost.values()): res.update(part)
    json.dump({'pages': {u: {**res[u], 'activities': sorted(pages[u])} for u in pages}}, open(sys.argv[2], 'w'), indent=1)
    print(collections.Counter(v['status'] for v in res.values()))
