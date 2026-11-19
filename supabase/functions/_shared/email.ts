// Builds the plan-confirmation email (subject, HTML, plain text, calendar link, .ics) in the user's language.
import { buildIcs, googleUrl, location, slotDate, type Card, type Labels, type Occurrence, type Template } from './calendar.ts'

export type Locale = 'de' | 'en' | 'it' | 'fr'
interface Strings { subject: string; hello: string; intro: string; when: string; where: string; weekly: string; weeklyNote: string; selected: string; noTime: string; at: string; notBooking: string; google: string; apple: string; view: string; organiser: string; footer: string; unconfirmed: string; selectedDates: string; endUnknown: string }
const T: Record<Locale, Strings> = {
  de: { subject: 'Im Plan: ', hello: 'Hallo', intro: 'Das hast du zu deinem Plan hinzugefügt:', when: 'Wann', where: 'Wo', weekly: 'Üblicherweise jeweils', weeklyNote: 'nicht für jedes Datum bestätigt – frag beim Anbieter nach.', selected: 'Nur an ausgewählten Terminen – frag beim Anbieter nach.', noTime: 'Uhrzeit nicht bekannt.', at: 'um',
    notBooking: 'Das ist keine Buchung und keine Anmeldung beim Anbieter.', google: 'Zu Google Kalender hinzufügen', apple: 'Apple Kalender oder Outlook: öffne die angehängte Datei (.ics).', view: 'Angebot ansehen', organiser: 'Anbieter',
    footer: 'Du bekommst diese E-Mail, weil du etwas zu deinem Plan hinzugefügt hast. Ausschalten: Profil → «E-Mail bei neuen Planeinträgen».',
    unconfirmed: 'Übliche Wochenzeit, nicht für jedes Datum bestätigt. Beim Anbieter nachfragen.', selectedDates: 'Nur an ausgewählten Terminen. Beim Anbieter nachfragen.', endUnknown: 'Ende nicht bekannt, es wird 1 Stunde angenommen.' },
  en: { subject: 'In your plan: ', hello: 'Hello', intro: 'You added this to your plan:', when: 'When', where: 'Where', weekly: 'Usually every', weeklyNote: 'not confirmed for each date – check with the organiser.', selected: 'Only on selected dates – check with the organiser.', noTime: 'Time not known.', at: 'at',
    notBooking: 'This is not a booking or a registration with the organiser.', google: 'Add to Google Calendar', apple: 'Apple Calendar or Outlook: open the attached file (.ics).', view: 'View the activity', organiser: 'Organiser',
    footer: 'You receive this email because you added something to your plan. Turn it off: Profile → “Email when I add to my plan”.',
    unconfirmed: 'Usual weekly time, not confirmed for each date. Check with the organiser.', selectedDates: 'Only on selected dates. Check with the organiser.', endUnknown: 'End time not known, 1 hour is assumed.' },
  it: { subject: 'Nel tuo piano: ', hello: 'Ciao', intro: 'Hai aggiunto questo al tuo piano:', when: 'Quando', where: 'Dove', weekly: 'Di solito ogni', weeklyNote: 'non confermato per ogni data – chiedi all’organizzatore.', selected: 'Solo in date selezionate – chiedi all’organizzatore.', noTime: 'Orario non noto.', at: 'alle',
    notBooking: 'Non è una prenotazione né un’iscrizione presso l’organizzatore.', google: 'Aggiungi a Google Calendar', apple: 'Apple Calendar o Outlook: apri il file allegato (.ics).', view: 'Vedi l’attività', organiser: 'Organizzatore',
    footer: 'Ricevi questa e-mail perché hai aggiunto qualcosa al tuo piano. Per disattivarla: Profilo → «E-mail quando aggiungo al piano».',
    unconfirmed: 'Orario settimanale abituale, non confermato per ogni data. Chiedi all’organizzatore.', selectedDates: 'Solo in date selezionate. Chiedi all’organizzatore.', endUnknown: 'Ora di fine non nota, si presume 1 ora.' },
  fr: { subject: 'Dans ton plan : ', hello: 'Bonjour', intro: 'Tu as ajouté ceci à ton plan :', when: 'Quand', where: 'Où', weekly: 'En général chaque', weeklyNote: 'non confirmé pour chaque date – demande à l’organisateur.', selected: 'Seulement à certaines dates – demande à l’organisateur.', noTime: 'Heure inconnue.', at: 'à',
    notBooking: 'Ce n’est ni une réservation ni une inscription auprès de l’organisateur.', google: 'Ajouter à Google Agenda', apple: 'Apple Calendar ou Outlook : ouvre le fichier joint (.ics).', view: 'Voir l’activité', organiser: 'Organisateur',
    footer: 'Tu reçois cet e-mail parce que tu as ajouté quelque chose à ton plan. Pour le désactiver : Profil → « E-mail quand j’ajoute au plan ».',
    unconfirmed: 'Horaire hebdomadaire habituel, non confirmé pour chaque date. Demande à l’organisateur.', selectedDates: 'Seulement à certaines dates. Demande à l’organisateur.', endUnknown: 'Heure de fin inconnue, 1 heure est supposée.' },
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null)

export interface Built { subject: string; html: string; text: string; google: string | null; ics: string | null }

export function buildEmail(o: { locale: Locale; name: string | null; card: Card; template?: Template; occurrence?: Occurrence; appUrl: string; contact: string | null; now?: Date }): Built {
  const L = T[o.locale] ?? T.de; const now = o.now ?? new Date()
  const labels: Labels = { unconfirmed: L.unconfirmed, selectedDates: L.selectedDates, organiser: L.organiser, endUnknown: L.endUnknown }
  const slot = o.template ?? o.occurrence
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(o.locale, { timeZone: 'Europe/Zurich', ...opts }).format(new Date(d + 'T12:00:00Z'))
  let when: string
  if (o.template) {
    const date = slotDate(o.template, undefined, now)
    when = o.template.recurrence === 'selected_dates' ? L.selected
      : `${L.weekly} ${fmt(date, { weekday: 'long' })}${slot?.start ? ` ${L.at} ${hhmm(slot.start)}${slot.end ? '–' + hhmm(slot.end) : ''}` : `. ${L.noTime}`} (${L.weeklyNote})`
  } else {
    const d = o.occurrence!.date
    when = `${fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${slot?.start ? `, ${hhmm(slot.start)}${slot.end ? '–' + hhmm(slot.end) : ''}` : `. ${L.noTime}`}`
  }
  const where = location(o.card)
  const link = `${o.appUrl}/a/${o.card.id}`
  const google = googleUrl(o.card, o.template, o.occurrence, labels, o.appUrl, now)
  const ics = buildIcs(o.card, o.template, o.occurrence, labels, o.appUrl, now)
  const hello = o.name ? `${L.hello} ${o.name}` : L.hello
  const btn = (href: string, label: string) => `<p><a href="${esc(href)}" style="display:inline-block;background:#fdd54f;color:#1d1d1b;text-decoration:none;padding:12px 22px;border-radius:24px;font-weight:600">${esc(label)}</a></p>`
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1d1d1b;max-width:560px;margin:auto;padding:16px;line-height:1.5">
<p>${esc(hello)},</p><p>${esc(L.intro)}</p>
<h2 style="margin:8px 0">${esc(o.card.title)}</h2>
<p><strong>${esc(L.when)}:</strong> ${esc(when)}<br><strong>${esc(L.where)}:</strong> ${esc(where)}</p>
<p style="color:#555">${esc(L.notBooking)}</p>
${google ? btn(google, L.google) : ''}${ics ? `<p style="color:#555">${esc(L.apple)}</p>` : ''}
<p><a href="${esc(link)}">${esc(L.view)}</a>${o.card.organiser_url ? ` · <a href="${esc(o.card.organiser_url)}">${esc(L.organiser)}</a>` : ''}</p>
<hr style="border:0;border-top:1px solid #ddd"><p style="color:#777;font-size:12px">${esc(L.footer)}${o.contact ? `<br>${esc(o.contact)}` : ''}</p></body></html>`
  const text = [`${hello},`, '', L.intro, '', o.card.title, `${L.when}: ${when}`, `${L.where}: ${where}`, '', L.notBooking, '', google ? `${L.google}: ${google}` : '', ics ? L.apple : '', '', `${L.view}: ${link}`, '', L.footer].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n')
  return { subject: L.subject + o.card.title, html, text, google, ics }
}
