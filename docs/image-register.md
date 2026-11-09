# Image register

All images found in the prototype `Quartierjournal-standalone.html`, with their status.
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

## Referenced by the prototype but not embedded

The prototype maps event photos by organiser URL, but these files were **not** included in the bundle. They are probably in the earlier assets ZIP.

| File | Mapped to | Licence |
|---|---|---|
| `assets/event-02de10817a.jpg` | https://gz-zh.ch/gz-buchegg/ | unknown |
| `assets/event-7d706d4108.jpg` | https://qh6.ch/veranstaltung/spielgruppe-roeslichnopf/ | unknown |
| `assets/event-081eeafe8d.jpg` | https://gz-zh.ch/gz-hirzenbach/ | unknown |
| `assets/event-b73c528b42.jpg` | Josefwiese (stadt-zuerich.ch) | unknown |
| `assets/event-cc781b87f9.jpg` | https://qh6.ch/veranstaltung/pilates-ohne-mit-kinderbetreuung/ | unknown |
| `assets/event-45904c28d3.jpg` | https://www.activfitness.ch/studios/activ-fitness-zuerich-wipkingen/ | unknown |
| `assets/avatar-adult.png`, `assets/avatar-child.png` | default avatars | unknown (replaced by generated initials avatars) |

## To clear an image for use

1. Record where it came from (page URL) and who holds the rights.
2. Get written permission from the organiser (an email is enough; keep it), or use your own photo or a clearly licensed one (e.g. CC BY with credit).
3. Avoid identifiable children unless the organiser confirms consent for this use.
4. An admin uploads it to Supabase Storage and sets `licence_status = 'permitted'` with `credit` and `source_url`.
