# Image register

All images found in the prototype `Quartierjournal-standalone.html` (both uploads), with their status.
**No image below is cleared for publication.** None of them are used in the app; they are recorded here so their origin can be traced.

The app shows a neutral illustrated placeholder (generated, no photo) wherever no `permitted` or `own` image exists. In the database, `images.licence_status` must be `permitted` or `own` before an image becomes publicly readable; this is enforced by RLS.

## Embedded in the prototype (hero carousel)

| # | Prototype alt text | Size | SHA-256 (prefix) | Notes | Licence |
|---|---|---|---|---|---|
| H1 | Families at Josefwiese | 1194×600 PNG | `6532a35c8c25` | Looks like a stylised (filtered) photo. Source unknown | unknown |
| H2 | Children at a Zürich playground | 516×387 JPG | `e10c61ebee5c` | Playground with nest swings. Source unknown | unknown |
| H3 | Child at an indoor playground | 516×387 JPG | `43b100c7ee24` | **Identifiable child, face visible.** Source unknown | unknown |
| H4 | Playgroup at Quartierhaus Kreis 6 | 640×480 JPG | `a26adc949fa3` | **Identifiable children.** EXIF: iPhone 5, 2013-09-30. Possibly from qh6.ch | unknown |
| H5 | Child at a water playground | 640×480 JPG | `6788d331aff3` | Water-play area. Source unknown | unknown |

The originals are not committed to the repository (identifiable children, unknown rights). The hashes let you match them against the files you have.

## Event photos and avatars (embedded in the second prototype file)

The second upload of `Quartierjournal-standalone.html` (SHA-256 prefix `56e36e497090`) has the same screens and logic as the first. The only difference is that it embeds the 8 files below, which the first file referenced but didn't contain. The prototype matched each photo to an organiser URL.

| File | Matched to (prototype) | Size | SHA-256 (prefix) | Metadata | Notes | Licence |
|---|---|---|---|---|---|---|
| `event-02de10817a.jpg` | GZ Buchegg | 1200×600 | `fd035a957551` | Samsung SM-G781B, 2022-04-27 | Building exterior, no people | unknown |
| `event-081eeafe8d.jpg` | GZ Hirzenbach | 1200×600 | `c2ee0826ca4c` | iPhone 13 mini, 2025-07-10 | Building and garden, no identifiable people | unknown |
| `event-7d706d4108.jpg` | QH6 Spielgruppe Röslichnopf | 640×480 | `a26adc949fa3` | iPhone 5, 2013-09-30 | **Same file as hero H4. Identifiable children** | unknown |
| `event-cc781b87f9.jpg` | QH6 Pilates | 732×572 | `ad4e8ccd20e3` | none | Adult exercising, face not shown | unknown |
| `event-45904c28d3.jpg` | ACTIV FITNESS Wipkingen | 1560×975 | `09e88457ba5c` | Canon EOS 6D Mark II, 2022-05-25 | Gym interior, professional photo (likely the company's marketing image) | unknown |
| `event-b73c528b42.jpg` | Josefwiese (stadt-zuerich.ch) | 2000×1333 | `6648d9972686` | 2024-05-26 | Park avenue, one distant person | unknown |
| `avatar-adult.png` | default adult avatar | 1254×1254 | `df6595bf9925` | none | Illustration | unknown (who made it?) |
| `avatar-child.png` | default child avatar | 1254×1254 | `41d60beb1e82` | none | Illustration | unknown (who made it?) |

The photos look like they were taken from the organisers' own websites. The prototype's photo-to-organiser matches look correct, but appearing on an organiser's site does not mean we may republish them. They stay unused until permission is recorded. The originals are kept outside the repository.

## To clear an image for use

1. Record where it came from (page URL) and who holds the rights.
2. Get written permission from the organiser (an email is enough; keep it), or use your own photo or a clearly licensed one (e.g. CC BY with credit).
3. Avoid identifiable children unless the organiser confirms consent for this use.
4. An admin uploads it to Supabase Storage and sets `licence_status = 'permitted'` with `credit` and `source_url`.

## Provider preview images (added 2026-11-18)
- What: for listings whose provider page offers a preview picture (og:image / twitter:image), the site **links** to that picture on the provider's own server, with credit (the provider's website) and, on the detail page, a link back. Nothing is copied or stored by us.
- How: `worker/crawl_images.py` (robots.txt respected, 1 request per host every 1.5 s, own user agent) → `worker/images_sql.py` → `supabase/seed/provider_images.sql`. Logos/icons and any picture repeated on 3+ pages are dropped as generic.
- Status: `images.licence_status = 'embedded_preview'` = **no explicit licence**. 86 of 873 listings have one (mostly stadt-zuerich.ch, seebach.ch). The Chreis+ licence excludes images.
- Decision (owner, 2026-11-18): use them for the pilot; ask the providers for permission after the pilot was successful. An admin can set any image to `rejected` and it disappears at once.
- Privacy: images load with `referrerpolicy="no-referrer"`, but the provider's server still sees the visitor's IP address. Mention in the privacy page before wider launch.

## Category tiles (the owner's label set, 2026-11-18)
- Entries without a provider image show the designed tile of their main category: 11 tiles × 4 languages, supplied by the project owner as SVG/PNG (`Quartierjournal-all-labels-DE-EN-FR-IT.zip`), stored as `public/labels/<lang>/<slug>.webp`. Their wording is also used for the main category labels (`src/i18n/taxonomy.ts`). Flat colour and text only: no photos, no licence issue.
- Entries that match no category keep the neutral placeholder. The earlier stock photos were removed.
- The café photo (`public/stock/cafe-fuerdich.webp`, Guesthouse & Kafi Fürdich) is used for that place only (Orte), added at the owner's request via `supabase/seed/owner_places.sql`. Source/licence of the photo to be confirmed; ideally ask the café.
