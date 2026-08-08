// Contenu du pilote, structuré selon les 4 piliers officiels du Portail UNICEF
// consacré à la parentalité (unicef.org/parenting) : Développement de l'enfant,
// Soins attentifs, Santé et bien-être, Alimentation et nutrition.
// Aligner Parent+237 sur cette taxonomie montre au jury une cohérence directe
// avec le cadre de référence mondial de l'UNICEF, pas une structure inventée.
// `icon` = nom de classe Font Awesome (sans le préfixe fa-solid/fa-regular).
export const pillars = [
  { id: 'developpement', label: 'Développement de l\u2019enfant', icon: 'fa-brain' },
  { id: 'soins', label: 'Soins attentifs', icon: 'fa-hands-holding-child' },
  { id: 'sante', label: 'Santé et bien-être', icon: 'fa-stethoscope' },
  { id: 'nutrition', label: 'Alimentation et nutrition', icon: 'fa-bowl-food' }
];

// Chaque scénario = une mini-leçon de 5 minutes.
// `narration` est lu à voix haute via l'API Web Speech (gratuite, embarquée, hors-ligne).
//
// IMPORTANT : ce tableau sert de SEED (contenu initial à insérer en base, voir
// supabase.sql) et de SECOURS hors-ligne si l'app n'a jamais pu contacter Supabase.
// En fonctionnement normal, le contenu réellement affiché vient de la table
// `scenarios` en base, gérée par le rôle Éditeur — pas de ce fichier.
export const seedScenarios = [
  {
    id: 'crise-marche',
    pillar: 'soins',
    theme: 'Gérer une crise en public',
    level: 1,
    situation: "Au marché, votre enfant de 4 ans se jette au sol et hurle parce que vous refusez de lui acheter un jouet.",
    narration: "Voici une situation fréquente. Votre enfant hurle au marché parce que vous avez dit non. Que faites-vous ?",
    choices: [
      {
        text: "Je crie plus fort pour qu'il arrête",
        correct: false,
        feedback: "Crier ajoute de la tension et apprend à l'enfant que les cris sont la solution. Essayons une autre option."
      },
      {
        text: "Je m'accroupis à sa hauteur, je reste calme et je nomme ce qu'il ressent",
        correct: true,
        feedback: "Excellent choix. En restant calme et en nommant l'émotion (« je vois que tu es déçu »), vous aidez l'enfant à se calmer sans céder."
      },
      {
        text: "Je cède et j'achète le jouet pour que ça s'arrête",
        correct: false,
        feedback: "Céder soulage sur le moment mais renforce la crise la prochaine fois. Mieux vaut rester ferme et calme."
      }
    ]
  },
  {
    id: 'sans-cris-coups',
    pillar: 'soins',
    theme: 'Communiquer sans crier ni frapper',
    level: 1,
    situation: "Votre enfant a encore renversé de l'eau sur le tapis après un avertissement.",
    narration: "Votre enfant a désobéi une nouvelle fois. Comment réagissez-vous, sans crier ni frapper ?",
    choices: [
      {
        text: "Je le corrige physiquement pour qu'il comprenne",
        correct: false,
        feedback: "La correction physique fait peur mais n'enseigne pas le bon comportement, et abîme la confiance."
      },
      {
        text: "Je respire, j'explique calmement la conséquence et je fais nettoyer ensemble",
        correct: true,
        feedback: "C'est la bonne approche : une conséquence liée à l'acte, expliquée calmement, apprend la responsabilité."
      },
      {
        text: "J'ignore complètement, ça n'a pas d'importance",
        correct: false,
        feedback: "Ignorer ne pose pas de limite claire. L'enfant a besoin de comprendre les conséquences de ses actes."
      }
    ]
  },
  {
    id: 'ado-communication',
    pillar: 'soins',
    theme: 'Communiquer avec son adolescent',
    level: 2,
    situation: "Votre adolescent rentre tard sans prévenir et refuse de répondre à vos questions.",
    narration: "Votre adolescent rentre tard et se ferme. Comment ouvrir le dialogue ?",
    choices: [
      {
        text: "Je le punis immédiatement et j'interdis les sorties",
        correct: false,
        feedback: "Une punition immédiate sans dialogue renforce souvent le silence et la distance."
      },
      {
        text: "J'attends un moment calme puis je pose des questions ouvertes, sans juger",
        correct: true,
        feedback: "Très bien. Choisir le bon moment et poser des questions ouvertes favorise la confiance et la sincérité."
      },
      {
        text: "Je ne dis rien, de peur de le braquer",
        correct: false,
        feedback: "Le silence total prive l'ado d'un cadre. Il a besoin de sentir que vous êtes présent et attentif."
      }
    ]
  },
  {
    id: 'signes-stress',
    pillar: 'sante',
    theme: 'Reconnaître les signes de stress',
    level: 1,
    situation: "Votre enfant devient irritable, dort mal et ne veut plus aller à l'école depuis quelques jours.",
    narration: "Votre enfant montre des signes inhabituels depuis quelques jours. Que faites-vous ?",
    choices: [
      {
        text: "Je le punis parce qu'il refuse d'aller à l'école",
        correct: false,
        feedback: "Punir un changement de comportement sans en chercher la cause peut aggraver un mal-être déjà présent."
      },
      {
        text: "J'observe, je reste disponible, et j'en parle calmement avec lui",
        correct: true,
        feedback: "Bonne réaction. Ces signes (irritabilité, sommeil perturbé, évitement) peuvent traduire un stress. En parler calmement aide à comprendre la cause."
      },
      {
        text: "Je considère que ça va passer tout seul",
        correct: false,
        feedback: "Ignorer des signes répétés retarde une aide dont l'enfant pourrait avoir besoin."
      }
    ]
  },
  {
    id: 'diversification',
    pillar: 'nutrition',
    theme: 'Diversification alimentaire',
    level: 1,
    situation: "Votre bébé de 6 mois repousse systématiquement les nouveaux aliments que vous lui proposez.",
    narration: "Votre bébé refuse un nouvel aliment. Comment réagissez-vous ?",
    choices: [
      {
        text: "Je force un peu, pour qu'il apprenne à goûter",
        correct: false,
        feedback: "Forcer crée souvent un rejet encore plus fort et associe le repas à une tension."
      },
      {
        text: "Je retire l'aliment et je n'y reviens plus",
        correct: false,
        feedback: "Abandonner après un seul essai prive l'enfant de la chance de s'habituer au goût avec le temps."
      },
      {
        text: "Je continue à proposer le même aliment, sans forcer, sur plusieurs jours",
        correct: true,
        feedback: "C'est la bonne approche : un enfant a souvent besoin de plusieurs présentations avant d'accepter un nouvel aliment."
      }
    ]
  },
  {
    id: 'langage-18-mois',
    pillar: 'developpement',
    theme: 'Le langage qui tarde à venir',
    level: 1,
    situation: "Votre enfant de 18 mois ne dit encore aucun mot clair, contrairement à d'autres enfants du même âge.",
    narration: "Votre enfant de 18 mois ne parle pas encore. Que faites-vous ?",
    choices: [
      {
        text: "Je compare avec les autres enfants et je m'inquiète en silence",
        correct: false,
        feedback: "Comparer sans agir n'aide ni vous ni l'enfant. Chaque enfant a son rythme, mais un accompagnement reste utile."
      },
      {
        text: "Je stimule le langage par le jeu et la lecture, et j'en parle à un professionnel de santé si le doute persiste",
        correct: true,
        feedback: "Exactement l'approche recommandée : stimuler au quotidien, et consulter si l'inquiétude persiste, sans attendre."
      },
      {
        text: "Je ne fais rien, ça vient toujours avec le temps",
        correct: false,
        feedback: "Attendre passivement fait perdre un temps précieux pour la stimulation précoce, qui a un vrai impact."
      }
    ]
  }
];

export const languages = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'ff', label: 'Fulfulde (pilote)' },
  { code: 'ew', label: 'Ewondo (pilote)' }
];

