// Extra interface text for the redesigned screens. Namespaced under `ui.` and merged in index.ts.
// (Prototype copy that already exists in design.ts is reused from there, not repeated here.)
const en = {
  made: 'Made with ♥ by Alicia',
  places: { title: 'Places in the neighbourhood', sub: 'Places that have offers in the list. Opening times: please check with the organiser.', map: 'Open on map ↗', none: 'No places yet.' },
  moreCount: 'Show more ({n})',
  tileAdd: 'Choose time',
  about: { pilot: 'This is a pilot with a small group of families in Zürich. Listings come from the organisers: please confirm with them before you go.', who: 'Made for parents, grandparents, nannies and everyone who looks after children aged 0–4.' },
  contact: { write: 'Write an email', soon: 'The contact address will appear here soon.' },
  home: {
    hello: 'Hello {name}', helloNoName: 'Hello', today: 'Today', upcoming: 'Coming up',
    nothingToday: 'Nothing planned today yet. You’ll find ideas below.', nothingPlanned: 'Nothing planned yet. Add activities from Discover to your week.',
    ideasToday: 'Ideas for today', ideasNote: 'Usual times as published by the organisers, not confirmed for every date.',
    careToday: 'Who is with your child today', noCare: 'No care times entered yet.', setUp: 'Set up my week',
    onToday: 'Today in Zürich', onTomorrow: 'Tomorrow in Zürich', onNext: 'Coming up in Zürich',
  },
  week: {
    note: 'Weekdays follow the organisers’ programmes; individual dates are not yet confirmed. A plan is not a booking.',
    tabWeek: 'My week', tabMonth: 'My month', addTime: '+ Care time', addPerson: '+ Person', hint: 'Tap a block to edit it.',
    prev: 'Previous', next: 'Next', editTime: 'Edit care time', saveBlock: 'Save', deleteBlock: 'Delete', newPerson: 'New person or daycare',
    mobilePage: 'Mon–Thu', mobilePage2: 'Fri–Sun', emptyGrid: 'Add your first care time with “+ Care time”.', open: 'Open',
    monthNone: 'Nothing planned this month.', weeklyShort: 'every week', thisWeek: 'This week',
  },
  profile: { aboutMe: 'About me', favourites: 'Favourites', noFavs: 'No favourites yet. Tap the heart on an activity.', myPlan: 'My plan', noPlan: 'Nothing in your plan yet.', change: 'Change', remove: 'Remove', logout: 'Log out' },
}
const de: typeof en = {
  made: 'Mit ♥ gemacht von Alicia',
  places: { title: 'Orte im Quartier', sub: 'Orte, zu denen es Angebote in der Liste gibt. Öffnungszeiten bitte beim Anbieter prüfen.', map: 'Auf der Karte öffnen ↗', none: 'Noch keine Orte.' },
  moreCount: 'Mehr anzeigen ({n})',
  tileAdd: 'Zeit wählen',
  about: { pilot: 'Das ist ein Pilot mit einer kleinen Gruppe von Familien in Zürich. Die Einträge stammen von den Anbietern: bitte vor dem Besuch dort bestätigen.', who: 'Für Eltern, Grosseltern, Nannys und alle, die Kinder von 0–4 Jahren betreuen.' },
  contact: { write: 'E-Mail schreiben', soon: 'Die Kontaktadresse erscheint hier bald.' },
  home: {
    hello: 'Hallo {name}', helloNoName: 'Hallo', today: 'Heute', upcoming: 'Demnächst',
    nothingToday: 'Heute ist noch nichts geplant. Unten findest du Ideen.', nothingPlanned: 'Noch nichts geplant. Füge in Entdecken Aktivitäten zu deiner Woche hinzu.',
    ideasToday: 'Ideen für heute', ideasNote: 'Übliche Zeiten laut Anbieter, nicht für jedes Datum bestätigt.',
    careToday: 'Wer heute bei deinem Kind ist', noCare: 'Noch keine Betreuungszeiten eingetragen.', setUp: 'Meine Woche einrichten',
    onToday: 'Heute in Zürich', onTomorrow: 'Morgen in Zürich', onNext: 'Als Nächstes in Zürich',
  },
  week: {
    note: 'Wochentage nach Anbieter-Programm; einzelne Daten sind noch nicht bestätigt. Ein Plan ist keine Buchung.',
    tabWeek: 'Meine Woche', tabMonth: 'Mein Monat', addTime: '+ Betreuungszeit', addPerson: '+ Betreuer:in', hint: 'Tippe auf einen Block, um ihn zu bearbeiten.',
    prev: 'Zurück', next: 'Weiter', editTime: 'Betreuungszeit bearbeiten', saveBlock: 'Speichern', deleteBlock: 'Löschen', newPerson: 'Neue Person oder Kita',
    mobilePage: 'Mo–Do', mobilePage2: 'Fr–So', emptyGrid: 'Trag deine erste Betreuungszeit mit «+ Betreuungszeit» ein.', open: 'Öffnen',
    monthNone: 'In diesem Monat ist nichts geplant.', weeklyShort: 'jede Woche', thisWeek: 'Diese Woche',
  },
  profile: { aboutMe: 'Über mich', favourites: 'Favoriten', noFavs: 'Noch keine Favoriten. Tippe bei einem Angebot auf das Herz.', myPlan: 'Meine Termine', noPlan: 'Noch nichts in deinem Plan.', change: 'Ändern', remove: 'Entfernen', logout: 'Abmelden' },
}
const it: typeof en = {
  made: 'Fatto con ♥ da Alicia',
  places: { title: 'Luoghi del quartiere', sub: 'Luoghi con offerte nell’elenco. Orari di apertura: verifica presso l’organizzatore.', map: 'Apri sulla mappa ↗', none: 'Ancora nessun luogo.' },
  moreCount: 'Mostra altro ({n})',
  tileAdd: 'Scegli l’orario',
  about: { pilot: 'Questo è un progetto pilota con un piccolo gruppo di famiglie a Zurigo. Le voci provengono dagli organizzatori: confermale con loro prima di andare.', who: 'Per genitori, nonni, tate e tutti coloro che si occupano di bambini da 0 a 4 anni.' },
  contact: { write: 'Scrivi un’e-mail', soon: 'L’indirizzo di contatto comparirà presto qui.' },
  home: {
    hello: 'Ciao {name}', helloNoName: 'Ciao', today: 'Oggi', upcoming: 'Prossimamente',
    nothingToday: 'Oggi non c’è ancora nulla in programma. Qui sotto trovi delle idee.', nothingPlanned: 'Ancora nulla in programma. Aggiungi attività da Scopri alla tua settimana.',
    ideasToday: 'Idee per oggi', ideasNote: 'Orari abituali indicati dagli organizzatori, non confermati per ogni data.',
    careToday: 'Chi è oggi con il tuo bambino', noCare: 'Nessun orario di accudimento inserito.', setUp: 'Imposta la mia settimana',
    onToday: 'Oggi a Zurigo', onTomorrow: 'Domani a Zurigo', onNext: 'Prossimamente a Zurigo',
  },
  week: {
    note: 'I giorni seguono i programmi degli organizzatori; le singole date non sono ancora confermate. Un piano non è una prenotazione.',
    tabWeek: 'La mia settimana', tabMonth: 'Il mio mese', addTime: '+ Orario', addPerson: '+ Persona', hint: 'Tocca un blocco per modificarlo.',
    prev: 'Indietro', next: 'Avanti', editTime: 'Modifica orario', saveBlock: 'Salva', deleteBlock: 'Elimina', newPerson: 'Nuova persona o asilo',
    mobilePage: 'Lun–Gio', mobilePage2: 'Ven–Dom', emptyGrid: 'Aggiungi il tuo primo orario con «+ Orario».', open: 'Apri',
    monthNone: 'Questo mese non c’è nulla in programma.', weeklyShort: 'ogni settimana', thisWeek: 'Questa settimana',
  },
  profile: { aboutMe: 'Su di me', favourites: 'Preferiti', noFavs: 'Ancora nessun preferito. Tocca il cuore su un’attività.', myPlan: 'I miei appuntamenti', noPlan: 'Ancora nulla nel tuo piano.', change: 'Cambia', remove: 'Rimuovi', logout: 'Esci' },
}
const fr: typeof en = {
  made: 'Fait avec ♥ par Alicia',
  places: { title: 'Lieux du quartier', sub: 'Lieux avec des offres dans la liste. Horaires d’ouverture : à vérifier auprès de l’organisateur.', map: 'Ouvrir sur la carte ↗', none: 'Pas encore de lieux.' },
  moreCount: 'Afficher plus ({n})',
  tileAdd: 'Choisir l’horaire',
  about: { pilot: 'Ceci est un projet pilote avec un petit groupe de familles à Zurich. Les entrées proviennent des organisateurs : confirmez-les auprès d’eux avant de vous déplacer.', who: 'Pour les parents, grands-parents, nounous et toutes les personnes qui s’occupent d’enfants de 0 à 4 ans.' },
  contact: { write: 'Écrire un e-mail', soon: 'L’adresse de contact apparaîtra bientôt ici.' },
  home: {
    hello: 'Bonjour {name}', helloNoName: 'Bonjour', today: 'Aujourd’hui', upcoming: 'À venir',
    nothingToday: 'Rien de prévu aujourd’hui. Vous trouverez des idées ci-dessous.', nothingPlanned: 'Rien de prévu pour l’instant. Ajoutez des activités depuis Découvrir à votre semaine.',
    ideasToday: 'Idées pour aujourd’hui', ideasNote: 'Horaires habituels publiés par les organisateurs, non confirmés pour chaque date.',
    careToday: 'Qui est avec votre enfant aujourd’hui', noCare: 'Aucun horaire de garde saisi.', setUp: 'Préparer ma semaine',
    onToday: 'Aujourd’hui à Zurich', onTomorrow: 'Demain à Zurich', onNext: 'À venir à Zurich',
  },
  week: {
    note: 'Les jours suivent les programmes des organisateurs ; les dates ne sont pas encore confirmées. Un plan n’est pas une réservation.',
    tabWeek: 'Ma semaine', tabMonth: 'Mon mois', addTime: '+ Horaire', addPerson: '+ Personne', hint: 'Touchez un bloc pour le modifier.',
    prev: 'Précédent', next: 'Suivant', editTime: 'Modifier l’horaire', saveBlock: 'Enregistrer', deleteBlock: 'Supprimer', newPerson: 'Nouvelle personne ou crèche',
    mobilePage: 'Lun–Jeu', mobilePage2: 'Ven–Dim', emptyGrid: 'Ajoutez votre premier horaire avec « + Horaire ».', open: 'Ouvrir',
    monthNone: 'Rien de prévu ce mois-ci.', weeklyShort: 'chaque semaine', thisWeek: 'Cette semaine',
  },
  profile: { aboutMe: 'À propos de moi', favourites: 'Favoris', noFavs: 'Pas encore de favoris. Touchez le cœur sur une activité.', myPlan: 'Mes rendez-vous', noPlan: 'Rien dans votre plan pour l’instant.', change: 'Modifier', remove: 'Retirer', logout: 'Se déconnecter' },
}
export const ui = { de, en, it, fr }
