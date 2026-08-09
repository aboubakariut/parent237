// Traductions RÉELLES pour français et anglais. Pour fulfulde/ewondo, on
// affiche honnêtement un bandeau "en préparation" plutôt que d'improviser une
// traduction potentiellement fausse ou maladroite — un contenu destiné à des
// familles camerounaises mérite une validation par un locuteur natif
// (MINPROFF ou un facilitateur local), pas une traduction générée à l'aveugle.
const dict = {
  fr: {
    welcome: 'Bienvenue',
    app_title: 'Le coach parental accessible à tous',
    app_tagline: 'Un mini-parcours de 5 minutes par semaine. Fonctionne même sans connexion.',
    progress_label: 'Votre progression',
    modules_done: 'Modules terminés',
    modules_todo: 'À découvrir',
    start_module: 'Commencer un module',
    edit_info: 'Modifier mes informations',
    nav_home: 'Accueil',
    nav_journey: 'Parcours',
    nav_badge: 'Mon badge',
    choose_theme: 'Choisissez un thème',
    taxonomy_note: "Organisé selon les 4 piliers du Portail UNICEF consacré à la parentalité.",
    listen: 'Écouter',
    continue_btn: 'Continuer',
    well_done: 'Bien vu',
    lets_think: "On y réfléchit",
    congrats_eyebrow: 'Bravo',
    certificate_ready: 'Votre certificat est prêt',
    share_whatsapp: 'Partager sur WhatsApp',
    share_note: 'Chaque partage aide un autre parent à découvrir Parent+237.',
    online: 'En ligne',
    offline: 'Hors ligne · sauvegardé',
    onboarding_title: 'Faisons connaissance',
    onboarding_edit_title: 'Modifier mes informations',
    onboarding_note: "Ces informations personnalisent votre certificat et permettent au facilitateur de votre région de suivre l'impact du programme. Elles restent privées.",
    name_label: 'Votre nom',
    phone_label: 'Numéro de téléphone',
    region_label: 'Région',
    region_placeholder: 'Choisissez votre région',
    region_none: 'Aucune région disponible',
    start_btn: 'Commencer',
    save_btn: 'Enregistrer',
    cancel_btn: 'Annuler'
  },
  en: {
    welcome: 'Welcome',
    app_title: 'The parenting coach, accessible to everyone',
    app_tagline: 'A 5-minute mini-course every week. Works even without a connection.',
    progress_label: 'Your progress',
    modules_done: 'Modules completed',
    modules_todo: 'To discover',
    start_module: 'Start a module',
    edit_info: 'Edit my information',
    nav_home: 'Home',
    nav_journey: 'Journey',
    nav_badge: 'My badge',
    choose_theme: 'Choose a topic',
    taxonomy_note: "Organised around the 4 pillars of the UNICEF Parenting Portal.",
    listen: 'Listen',
    continue_btn: 'Continue',
    well_done: 'Well spotted',
    lets_think: "Let's think about it",
    congrats_eyebrow: 'Well done',
    certificate_ready: 'Your certificate is ready',
    share_whatsapp: 'Share on WhatsApp',
    share_note: 'Every share helps another parent discover Parent+237.',
    online: 'Online',
    offline: 'Offline · saved',
    onboarding_title: "Let's get acquainted",
    onboarding_edit_title: 'Edit my information',
    onboarding_note: 'This information personalises your certificate and lets your local facilitator track the programme\u2019s impact. It stays private.',
    name_label: 'Your name',
    phone_label: 'Phone number',
    region_label: 'Region',
    region_placeholder: 'Choose your region',
    region_none: 'No region available',
    start_btn: 'Start',
    save_btn: 'Save',
    cancel_btn: 'Cancel'
  }
};

// Langues dont l'interface n'est pas encore traduite : on retombe sur le
// français, mais l'app le signale au lieu de faire semblant.
const pendingLanguages = new Set(['ff', 'ew']);

export function t(key, lang = 'fr') {
  const table = dict[lang] || dict.fr;
  return table[key] ?? dict.fr[key] ?? key;
}

export function isTranslationPending(lang) {
  return pendingLanguages.has(lang);
}

// Tag BCP47 pour la synthèse vocale (Web Speech API).
export function voiceLangTag(lang) {
  const map = { fr: 'fr-FR', en: 'en-US' };
  return map[lang] || 'fr-FR'; // ff/ew : pas de voix dédiée fiable, on garde le français
}

// Renvoie une version du scénario traduite dans `lang` si disponible,
// sinon la version française de base (jamais de champ vide).
export function localizeScenario(scenario, lang) {
  if (lang === 'fr') return scenario;
  const tr = scenario.translations?.[lang];
  if (!tr) return scenario;
  return {
    ...scenario,
    theme: tr.theme || scenario.theme,
    situation: tr.situation || scenario.situation,
    narration: tr.narration || scenario.narration,
    choices: tr.choices?.length ? tr.choices : scenario.choices
  };
}
