// Draft e-mails to providers asking for permission to show their offers. The owner copies the text and sends it from her own mailbox.
export type Lang = 'de' | 'en' | 'fr' | 'it'
export type Kind = 'ask' | 'reminder'
export interface Ctx { name: string; examples: string[]; link: string; sender?: string }

const QUOTES: Record<Lang, [string, string]> = { de: ['«', '»'], en: ['"', '"'], fr: ['« ', ' »'], it: ['«', '»'] }
const LEAD_IN: Record<Lang, string> = { de: 'zum Beispiel', en: 'for example', fr: 'par exemple', it: 'ad esempio' }
/** " (for example "A", "B")" for up to two offer titles, or nothing if we have none. */
const ex = (lang: Lang, list: string[]) => {
  const l = list.slice(0, 2).map((x) => x.trim()).filter(Boolean)
  if (!l.length) return ''
  const [o, c] = QUOTES[lang]
  return ` (${LEAD_IN[lang]} ${l.map((x) => `${o}${x}${c}`).join(', ')})`
}

const T: Record<Lang, Record<Kind, (c: Ctx) => { subject: string; body: string }>> = {
  de: {
    ask: (c) => ({ subject: 'Darf ich Ihr Angebot auf Quartierjournal Zürich zeigen?', body: `Guten Tag ${c.name}

Mein Name ist Alicia. Ich bin Mutter und habe Quartierjournal Zürich gebaut: eine kleine, unabhängige Plattform von einer Mutter für andere Mütter und Betreuungspersonen. Sie hilft Familien mit Kindern von 0 bis 4 Jahren, Angebote im Quartier zu finden und ihre Woche zu planen.

Als Pilot hat die Plattform bisher mit einer kleinen Gruppe von Familien funktioniert. Jetzt möchte ich sie für mehr Familien öffnen.

Dabei sind mir Ihre Angebote aufgefallen${ex('de', c.examples)}. Ich habe dafür Angaben von Ihrer eigenen Website übernommen (Titel, Datum, Zeit, Ort, Alter, Preis) und verlinke jeweils zurück auf Ihre Seite.

Meine Frage: Sind Sie damit einverstanden, dass Ihre Angebote so auf Quartierjournal erscheinen? Ein kurzes «Ja» genügt. Wenn Sie es nicht möchten, nehme ich alles sofort heraus.

Gut zu wissen:
• Ich zeige nur, was auf Ihrer Website steht. Anmeldung und Buchung bleiben bei Ihnen.
• Fehler korrigiere ich sofort. Sie können mir jederzeit Änderungen oder neue Termine schicken.
• Im Moment ist alles kostenlos, für Familien und für Anbieter. Ich baue gerade die Community auf, darum ist es für mich zuerst wichtig, dass Sie dabei sein dürfen.
• Auf lange Sicht muss das Projekt seine Kosten decken (Domain, Hosting). Die Familien sollen nichts zahlen. Ich überlege deshalb einen freiwilligen, sehr günstigen Beitrag für Anbieter. Mit Ihrer Zusage gehen Sie keine Verpflichtung ein, und ich melde mich dazu erst, wenn es ein konkretes Angebot gibt.

Hier können Sie die Plattform ansehen: ${c.link}

Herzlichen Dank und freundliche Grüsse
${c.sender ?? 'Alicia'}

Wenn Sie keine weiteren Nachrichten von mir möchten, antworten Sie einfach mit «Nein danke».` }),
    reminder: (c) => ({ subject: 'Kurze Erinnerung: Quartierjournal Zürich und Ihre Angebote', body: `Guten Tag ${c.name}

Ich erlaube mir eine kurze Nachfrage zu meiner früheren Nachricht: Dürfen Ihre Angebote auf Quartierjournal Zürich erscheinen (mit Link zu Ihrer Website)? Ein «Ja» oder «Nein» genügt. Ohne Antwort nehme ich Ihre Angebote vorsichtshalber wieder heraus.

Freundliche Grüsse
${c.sender ?? 'Alicia'}` }),
  },
  en: {
    ask: (c) => ({ subject: 'May I show your programme on Quartierjournal Zürich?', body: `Hello ${c.name}

My name is Alicia. I am a mother and I built Quartierjournal Zürich: a small, independent platform made by a mother for other mothers and caregivers. It helps families with children aged 0 to 4 find offers in their neighbourhood and plan their week.

So far the platform has run as a pilot with a small group of families. Now I would like to open it to more families.

While building it I came across your offers${ex('en', c.examples)}. I took the details from your own website (title, date, time, place, age, price) and always link back to your page.

My question: are you happy for your offers to appear on Quartierjournal like this? A short "yes" is enough. If you would rather not, I will remove everything straight away.

Good to know:
• I show only what is on your website. Registration and booking stay with you.
• I correct mistakes immediately, and you can send me changes or new dates any time.
• For now everything is free, for families and providers. I am building the community first, so what matters most to me is that you are part of it.
• In the long run the project has to cover its costs (domain, hosting). Families should not pay, so I am thinking about a voluntary, very low contribution for providers. Saying yes now does not commit you to anything, and I will only come back to this when there is a concrete offer.

You can see the platform here: ${c.link}

Thank you and kind regards
${c.sender ?? 'Alicia'}

If you do not want further messages from me, just reply "no thanks".` }),
    reminder: (c) => ({ subject: 'Quick reminder: Quartierjournal Zürich and your offers', body: `Hello ${c.name}

A short follow-up to my earlier message: may your offers appear on Quartierjournal Zürich (with a link to your website)? A "yes" or "no" is enough. If I do not hear back, I will take your offers off for now.

Kind regards
${c.sender ?? 'Alicia'}` }),
  },
  fr: {
    ask: (c) => ({ subject: 'Puis-je présenter votre programme sur Quartierjournal Zürich ?', body: `Bonjour ${c.name}

Je m’appelle Alicia. Je suis maman et j’ai créé Quartierjournal Zürich : une petite plateforme indépendante, faite par une mère pour d’autres mères et personnes qui s’occupent d’enfants. Elle aide les familles avec des enfants de 0 à 4 ans à trouver des offres dans leur quartier et à organiser leur semaine.

La plateforme a fonctionné jusqu’ici comme projet pilote avec un petit groupe de familles. Je souhaite maintenant l’ouvrir à davantage de familles.

J’ai remarqué vos offres${ex('fr', c.examples)}. J’ai repris les informations de votre propre site (titre, date, heure, lieu, âge, prix) avec, à chaque fois, un lien vers votre page.

Ma question : êtes-vous d’accord que vos offres apparaissent ainsi sur Quartierjournal ? Un simple « oui » suffit. Sinon, je retire tout immédiatement.

Bon à savoir :
• Je ne montre que ce qui figure sur votre site. L’inscription et la réservation restent chez vous.
• Je corrige les erreurs tout de suite, et vous pouvez m’envoyer des modifications ou de nouvelles dates à tout moment.
• Pour l’instant tout est gratuit, pour les familles comme pour les prestataires. Je construis d’abord la communauté ; le plus important pour moi est que vous en fassiez partie.
• À long terme, le projet devra couvrir ses frais (domaine, hébergement). Les familles ne doivent pas payer ; j’envisage donc une contribution volontaire et très modeste pour les prestataires. Votre accord ne vous engage à rien, et je ne reviendrai sur ce sujet que lorsqu’il y aura une offre concrète.

Vous pouvez voir la plateforme ici : ${c.link}

Merci beaucoup et cordialement
${c.sender ?? 'Alicia'}

Si vous ne souhaitez plus recevoir de messages de ma part, répondez simplement « non merci ».` }),
    reminder: (c) => ({ subject: 'Petit rappel : Quartierjournal Zürich et vos offres', body: `Bonjour ${c.name}

Un petit rappel à propos de mon message précédent : vos offres peuvent-elles apparaître sur Quartierjournal Zürich (avec un lien vers votre site) ? Un « oui » ou un « non » suffit. Sans réponse, je retire vos offres par précaution.

Cordialement
${c.sender ?? 'Alicia'}` }),
  },
  it: {
    ask: (c) => ({ subject: 'Posso mostrare la vostra offerta su Quartierjournal Zürich?', body: `Buongiorno ${c.name}

Mi chiamo Alicia. Sono una mamma e ho creato Quartierjournal Zürich: una piccola piattaforma indipendente, fatta da una madre per altre madri e persone che si prendono cura dei bambini. Aiuta le famiglie con bambini da 0 a 4 anni a trovare offerte nel quartiere e a organizzare la settimana.

Finora la piattaforma ha funzionato come progetto pilota con un piccolo gruppo di famiglie. Ora vorrei aprirla a più famiglie.

Ho notato le vostre offerte${ex('it', c.examples)}. Ho preso le informazioni dal vostro sito (titolo, data, orario, luogo, età, prezzo) con un link alla vostra pagina.

La mia domanda: siete d’accordo che le vostre offerte compaiano così su Quartierjournal? Basta un breve «sì». Altrimenti tolgo tutto subito.

Da sapere:
• Mostro solo ciò che c’è sul vostro sito. Iscrizione e prenotazione restano da voi.
• Correggo subito gli errori e potete inviarmi modifiche o nuove date in ogni momento.
• Per ora tutto è gratuito, per le famiglie e per i fornitori. Sto costruendo la comunità; per me conta soprattutto che ne facciate parte.
• A lungo termine il progetto dovrà coprire i costi (dominio, hosting). Le famiglie non devono pagare, perciò penso a un contributo volontario e molto contenuto per i fornitori. Il vostro sì non vi vincola e ne riparlerò solo quando ci sarà un’offerta concreta.

Potete vedere la piattaforma qui: ${c.link}

Grazie e cordiali saluti
${c.sender ?? 'Alicia'}

Se non desiderate altri messaggi da parte mia, rispondete semplicemente «no grazie».` }),
    reminder: (c) => ({ subject: 'Breve promemoria: Quartierjournal Zürich e le vostre offerte', body: `Buongiorno ${c.name}

Un breve promemoria sul mio messaggio precedente: le vostre offerte possono comparire su Quartierjournal Zürich (con un link al vostro sito)? Basta un «sì» o un «no». Senza risposta, per prudenza tolgo le vostre offerte.

Cordiali saluti
${c.sender ?? 'Alicia'}` }),
  },
}
export const buildEmail = (lang: Lang, kind: Kind, ctx: Ctx) => T[lang][kind](ctx)
