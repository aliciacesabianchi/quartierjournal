// Admin-only screens (CRM and funding): German and English; French and Italian fall back to English.
const en = {
  tab: 'Outreach (CRM)', providers: 'Providers', funding: 'Funding', search: 'Search organisation or address', all: 'All',
  status: { open: 'Open', qualified: 'Qualified', contacted: 'Contacted', yes: 'Said yes', no: 'Said no', no_reply: 'No reply', later: 'Ask later' },
  contacts: 'Contacts', noContacts: 'No contact address yet. Add one from the organisation’s own contact or imprint page.', addContact: 'Add contact', email: 'E-mail', name: 'Name', role: 'Role',
  sourceUrl: 'Where did you find it? (page address)', save: 'Save', copy: 'Copy', copied: 'Copied', doNotContact: 'Do not contact', undoDnc: 'Contact allowed again',
  prepare: 'Prepare e-mail', subject: 'Subject', text: 'Text', language: 'Language', kindAsk: 'Permission request', kindReminder: 'Reminder', copyAll: 'Copy subject and text', markSent: 'I sent it', 
  copyTo: 'Copy address', sentHint: 'Copy the address, subject and text into your own mail program. Nothing is sent from here.',
  log: 'History', addNote: 'Add note', note: 'Note', replyYes: 'They said yes', replyNo: 'They said no', replyLater: 'Ask later', noteSaved: 'Saved',
  examples: 'Offers of theirs on the site', offers: '{n} offers', lastContact: 'Last contact',
  funder: 'Funder', fit: 'Fit', fits: { good: 'Good fit', maybe: 'Maybe', unclear: 'Not clear' }, fstatus: { idea: 'Idea', checking: 'Checking', preparing: 'Preparing application', submitted: 'Submitted', granted: 'Granted', declined: 'Declined', not_eligible: 'Not eligible' },
  whatFunds: 'What it funds', eligibility: 'Who can apply', nextStep: 'Next step', checkedOn: 'Checked on {date}', legalEntity: 'Needs a legal entity (association, foundation …)', open: 'Open page',
  verifyNote: 'Always confirm current rules, forms and deadlines on the funder’s own page. Entries here are a starting point, not advice.',
  privacy: 'These are public business addresses read from each organisation’s own contact page. Only you can see this list. Remove an entry on request.',
  none: 'Nothing here yet.',
}
type Crm = typeof en
const de: Crm = {
  tab: 'Anfragen (CRM)', providers: 'Anbieter', funding: 'Förderungen', search: 'Organisation oder Adresse suchen', all: 'Alle',
  status: { open: 'Offen', qualified: 'Qualifiziert', contacted: 'Kontaktiert', yes: 'Zusage', no: 'Absage', no_reply: 'Keine Antwort', later: 'Später fragen' },
  contacts: 'Kontakte', noContacts: 'Noch keine Kontaktadresse. Ergänze eine von der Kontakt- oder Impressumsseite der Organisation.', addContact: 'Kontakt hinzufügen', email: 'E-Mail', name: 'Name', role: 'Funktion',
  sourceUrl: 'Wo gefunden? (Seitenadresse)', save: 'Speichern', copy: 'Kopieren', copied: 'Kopiert', doNotContact: 'Nicht kontaktieren', undoDnc: 'Kontakt wieder erlaubt',
  prepare: 'E-Mail vorbereiten', subject: 'Betreff', text: 'Text', language: 'Sprache', kindAsk: 'Anfrage um Erlaubnis', kindReminder: 'Erinnerung', copyAll: 'Betreff und Text kopieren', markSent: 'Ich habe es gesendet',
  copyTo: 'Adresse kopieren', sentHint: 'Kopiere Adresse, Betreff und Text in dein eigenes E-Mail-Programm. Von hier wird nichts gesendet.',
  log: 'Verlauf', addNote: 'Notiz hinzufügen', note: 'Notiz', replyYes: 'Hat zugesagt', replyNo: 'Hat abgesagt', replyLater: 'Später fragen', noteSaved: 'Gespeichert',
  examples: 'Ihre Angebote auf der Seite', offers: '{n} Angebote', lastContact: 'Letzter Kontakt',
  funder: 'Geldgeber', fit: 'Passung', fits: { good: 'Passt gut', maybe: 'Vielleicht', unclear: 'Unklar' }, fstatus: { idea: 'Idee', checking: 'In Prüfung', preparing: 'Gesuch in Arbeit', submitted: 'Eingereicht', granted: 'Zugesprochen', declined: 'Abgelehnt', not_eligible: 'Nicht berechtigt' },
  whatFunds: 'Was gefördert wird', eligibility: 'Wer sich bewerben kann', nextStep: 'Nächster Schritt', checkedOn: 'Geprüft am {date}', legalEntity: 'Braucht eine juristische Person (Verein, Stiftung …)', open: 'Seite öffnen',
  verifyNote: 'Aktuelle Regeln, Formulare und Fristen immer auf der Seite des Geldgebers bestätigen. Die Einträge sind ein Ausgangspunkt, keine Beratung.',
  privacy: 'Das sind öffentliche Geschäftsadressen von der eigenen Kontaktseite der Organisation. Nur du siehst diese Liste. Einträge auf Wunsch löschen.',
  none: 'Noch nichts hier.',
}
export const crm = { de, en, it: en, fr: en }
