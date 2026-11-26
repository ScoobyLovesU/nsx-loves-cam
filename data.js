/* ==========================================================================
   📅  DATA.JS — Fichier de configuration du calendrier de l'Avent
   --------------------------------------------------------------------------
   👉 C'est le SEUL fichier à modifier pour personnaliser le calendrier.
      Aucune logique ici : uniquement des textes, des photos et des réglages.

   TYPES DE SURPRISES DISPONIBLES (champ `type`) :

   1. "message"  → { title, text, signature }
   2. "photo"    → { src, alt, caption, date }
                    (src = chemin local, ex: "assets/img/jour-03.jpg")
   3. "coupon"   → { title, offer, details, validity }
                    (title = "Bon pour" par défaut ; offer = le contenu du bon)
   4. "quiz"     → { question, choices: [a, b, c], answer, successMessage, reward }
                    (answer = index de la bonne réponse : 0, 1 ou 2)
                    (reward = n'importe quelle autre surprise : message, photo,
                     coupon ou indice, révélée après la bonne réponse)
   5. "indice"   → { label, title, clue, hint, note }
                    (hint = coup de pouce caché derrière un bouton, optionnel)

   Champ optionnel pour toutes les surprises :
   - teaser : texte affiché sous la zone à gratter (sinon texte par défaut)

   Astuce : les textes longs utilisent des `backticks`. Chaque retour à la
   ligne est conservé tel quel à l'affichage : écris un paragraphe sur une
   seule ligne (il se coupera tout seul à l'écran), et ne reviens à la ligne
   que pour un vrai saut de ligne (poème, liste, nouveau paragraphe).
   ========================================================================== */

const CONFIG = {
  // 🧪 MODE DEBUG — pendant le développement uniquement.
  // true  → toutes les cases s'ouvrent + panneau « 🧪 Debug » (date simulée,
  //         réinitialisation, test du SMS) + raccourcis console (advent.help()).
  // ⚠ REPASSE À false AVANT DE LUI ENVOYER LE LIEN.
  // (Avec false, tu peux toujours ajouter ?debug=true à l'URL pour tester.)
  debug: true,

  // Année du calendrier (les cases se débloquent du 1er au 24 décembre)
  year: 2026,

  // Titre affiché en haut de la page
  title: "Le Calendrier de l'Avent",
  name: "Prénom", // ← remplace par son prénom (« de Léa », « d'Emma »… géré automatiquement)
  subtitle: "24 petites surprises, une par jour, rien que pour toi.",

  // Ton numéro pour réclamer les bons par SMS (format international)
  phoneNumber: "+33600000000",
  // {coupon} sera remplacé par le nom du bon
  smsTemplate: "Coucou mon cœur 💌 Je réclame mon bon : « {coupon} » ! Tu es dispo quand ? 😘",

  // Pourcentage de la zone à gratter à effacer pour révéler la surprise (0.5 = 50 %)
  scratchThreshold: 0.5,

  // Clé de sauvegarde dans le navigateur (change-la pour tout remettre à zéro)
  storageKey: "advent-calendar-2026",

  // Messages taquins quand elle clique sur une case pas encore disponible
  // {n} = nombre de jours restants · {s} = « s » du pluriel · {jour} = numéro de la case
  teasingMessages: [
    "Pas de triche ! Reviens dans {n} jour{s} 😏",
    "Hé ho, petite curieuse ! Encore {n} jour{s} de patience 🙈",
    "Cette case dort encore… Réveil prévu dans {n} jour{s} 😴",
    "Bien essayé ! Mais le Père Noël surveille 🎅 (encore {n} jour{s})",
    "Patience, mon cœur… J-{n} avant cette surprise ❤️",
    "Accès refusé 🔒 Le lutin en chef dit : reviens dans {n} jour{s}.",
    "Tu croyais vraiment que ça allait marcher ? 😂 Rendez-vous le {jour} décembre !",
  ],

  // Messages quand elle se trompe au quiz
  quizWrongMessages: [
    "Raté ! Essaie encore 😘",
    "Hmm… tu es sûre de toi ? 🤨",
    "Non non non ! Réfléchis avec ton cœur ❤️",
    "Presque… ou alors pas du tout 😅",
  ],

  // Écran d'attente affiché par-dessus le calendrier (flouté) avant le 1er décembre
  waitingTitle: "Ton calendrier s'ouvre dans",
  waitingNote: "Rendez-vous le 1er décembre à minuit ✨",

  // Affiché dans la pastille du bas à partir du 24 décembre
  finalMessage: "Joyeux Noël mon amour ❤️",

  // Pied de page
  footer: "Fait avec beaucoup d'amour, rien que pour toi",

  /* ------------------------------------------------------------------------
     📧 MAIL DE RAPPEL DU SOIR (envoyé par GitHub Actions, ~20h30)
     Les identifiants et son adresse mail ne sont PAS ici : ils sont rangés
     dans les « Secrets » du dépôt GitHub (voir .github/workflows/rappel-quotidien.yml).

     Variables utilisables : {jour} = numéro de la case · {indice} = type de
     surprise (« une petite lettre », « un bon cadeau »…) · {prenom} = son prénom
     ------------------------------------------------------------------------ */
  reminder: {
    enabled: true, // false = plus aucun mail
    siteUrl: "https://ton-pseudo.github.io/calendrier-avent/", // ← l'adresse de ton GitHub Pages
    fromName: "Ton calendrier de l'Avent", // nom affiché comme expéditeur
    subject: "🎁 Case n°{jour} : tu l'as ouverte ?",
    // Message par défaut (pour les soirs sans message personnalisé)
    message: "Petit rappel du soir : la case du {jour} décembre t'attend… Si ce n'est pas déjà fait, c'est le moment de gratter ✨\n\nIndice : ce soir, c'est {indice} 😉",
    // Messages personnalisés pour certains soirs (facultatif)
    messages: {
      1: "C'est le grand jour {prenom} ! La toute première case de ton calendrier est ouverte depuis ce matin… Tu as déjà gratté ? ✨",
      6: "Saint-Nicolas est passé… et il a laissé un indice dans ta case du jour 🧦 Une petite chasse au trésor t'attend !",
      24: "Dernière case, dernière chasse au trésor 🎄 Ouvre-la vite : ton vrai cadeau t'attend quelque part dans la maison…",
    },
    buttonLabel: "Ouvrir mon calendrier",
    signature: "Ton chéri",
  },
};

/* --------------------------------------------------------------------------
   ORDRE D'AFFICHAGE DES CASES DANS LA GRILLE
   Mélangé « comme un vrai calendrier », mais fixe. Chaque numéro de 1 à 24
   doit apparaître une seule fois (sinon le script complète automatiquement).
   -------------------------------------------------------------------------- */
const GRID_ORDER = [
  7, 18, 3, 22, 11, 1,
  15, 9, 24, 5, 13, 20,
  2, 17, 10, 23, 6, 14,
  19, 4, 12, 21, 8, 16,
];

/* --------------------------------------------------------------------------
   LES 24 SURPRISES
   -------------------------------------------------------------------------- */
const SURPRISES = [
  {
    day: 1,
    type: "message",
    title: "Bienvenue dans ton calendrier ✨",
    text: `Mon amour,

      Pendant 24 jours, chaque matin, une petite case t'attend ici. Des souvenirs, des surprises, des bons à utiliser sans modération… et peut-être quelques vrais cadeaux cachés pas très loin.

      J'ai préparé tout ça en pensant à toi, à nous, et à tous ces moments qui font que je t'aime un peu plus chaque jour.

      Prête ? Alors c'est parti.`,
    signature: "Ton chéri",
  },
  {
    day: 2,
    type: "coupon",
    title: "Bon pour",
    offer: "Un petit-déjeuner au lit",
    details: "Croissants tout chauds, jus d'orange pressé, café comme tu l'aimes… câlins inclus.",
    validity: "Valable un week-end au choix · jusqu'au 31 janvier 2027",
  },
  {
    day: 3,
    type: "photo",
    src: "assets/img/jour-03.jpg",
    alt: "Notre première photo ensemble",
    caption: "Notre toute première photo ensemble",
    date: "Juin 2023",
  },
  {
    day: 4,
    type: "quiz",
    question: "Où a eu lieu notre tout premier rendez-vous ?",
    choices: [
      "Au café en bas de chez toi",
      "Au cinéma",
      "Sur les quais, au bord de l'eau",
    ],
    answer: 2,
    successMessage: "Bonne réponse ! Tu t'en souviens aussi bien que moi 🥰",
    reward: {
      type: "message",
      title: "Ce soir-là…",
      text: `J'étais tellement stressé que j'ai changé trois fois de t-shirt. Et puis tu es arrivée, tu as souri, et tout le stress s'est envolé.

        On a marché pendant des heures sans voir le temps passer. Je crois que c'est ce soir-là que j'ai su.`,
      signature: "Ton chéri",
    },
  },
  {
    day: 5,
    type: "coupon",
    title: "Bon pour",
    offer: "Un massage de 30 minutes",
    details: "Huile chaude, bougies, playlist douce. Prolongation possible si tu fais les yeux doux.",
    validity: "Valable n'importe quel soir de la semaine",
  },
  {
    day: 6,
    type: "indice",
    label: "Chasse au trésor · Spécial Saint-Nicolas",
    title: "Le petit cadeau de Saint-Nicolas",
    clue: `Je garde tes pieds au chaud l'hiver,
      je vis rangée par paires dans un tiroir…
      Mais l'une d'entre nous cache aujourd'hui
      quelque chose qui n'est pas en laine.`,
    hint: "Va voir dans le tiroir à chaussettes 🧦",
    note: "Quand tu l'as trouvé, envoie-moi une photo !",
  },
  {
    day: 7,
    type: "photo",
    src: "assets/img/jour-07.jpg",
    alt: "Notre escapade en amoureux",
    caption: "Notre première escapade, rien que nous deux",
    date: "Octobre 2023",
  },
  {
    day: 8,
    type: "message",
    title: "8 choses que j'aime chez toi",
    text: `1. Ton rire, surtout quand tu ne peux plus t'arrêter.
      2. La façon dont tu fronces le nez quand tu réfléchis.
      3. Ta gentillesse avec absolument tout le monde.
      4. Tes messages pleins d'emojis à 7 h du matin.
      5. Ta manière de voler la couverture (oui, je l'ai remarqué).
      6. Ton courage, même quand tu doutes.
      7. Tes câlins qui réparent les mauvaises journées.
      8. Le simple fait que tu sois toi.`,
    signature: "Et la liste continue…",
  },
  {
    day: 9,
    type: "coupon",
    title: "Bon pour",
    offer: "Une soirée film de ton choix",
    details: "Même une comédie romantique que j'ai déjà vue trois fois. Sans soupirer. Promis. Pop-corn compris.",
    validity: "Valable tout l'hiver",
  },
  {
    day: 10,
    type: "quiz",
    question: "Quel est mon plat préféré quand c'est toi qui cuisines ?",
    choices: [
      "Tes pâtes carbonara",
      "Ton curry maison",
      "Ta tarte aux poireaux",
    ],
    answer: 1,
    successMessage: "Exactement ! Et pour te remercier de tous ces bons petits plats…",
    reward: {
      type: "coupon",
      title: "Bon pour",
      offer: "Un dîner au restaurant de ton choix",
      details: "Tu choisis l'endroit, je m'occupe de réserver (et de l'addition).",
      validity: "Valable jusqu'au 14 février 2027",
    },
  },
  {
    day: 11,
    type: "photo",
    src: "assets/img/jour-11.jpg",
    alt: "Toi en plein fou rire",
    caption: "Ton plus beau fou rire",
    date: "Été 2024",
  },
  {
    day: 12,
    type: "indice",
    label: "Chasse au trésor · Étape 1/2",
    title: "Là où les histoires dorment",
    clue: `Entre deux romans que tu adores,
      glissé là où tu ne cherches jamais…
      un secret de papier attend
      que tu tournes la bonne page.`,
    hint: "Regarde dans la bibliothèque du salon, derrière ton livre préféré 📚",
  },
  {
    day: 13,
    type: "message",
    title: "Un souvenir que je n'oublierai jamais",
    text: `Tu te souviens de cette fois où on s'est retrouvés trempés sous l'orage, sans parapluie, à des kilomètres de la maison ?

      Tu aurais pu râler. À la place, tu as éclaté de rire et tu m'as pris la main pour courir sous la pluie.

      C'est l'un de mes souvenirs préférés. Avec toi, même les galères deviennent de belles histoires.`,
    signature: "Ton chéri",
  },
  {
    day: 14,
    type: "coupon",
    title: "Bon pour",
    offer: "Un joker « Tu as raison »",
    details: "À dégainer pendant n'importe quel débat : je capitule immédiatement et je te donne raison. Sans discuter.",
    validity: "Usage unique · utilisation stratégique recommandée",
  },
  {
    day: 15,
    type: "quiz",
    question: "Quelle chanson est devenue « notre » chanson ?",
    choices: [
      "La Vie en rose",
      "Perfect",
      "Je te promets",
    ],
    answer: 0,
    successMessage: "Oui ! Rien que d'y penser, je l'ai dans la tête 🎶",
    reward: {
      type: "photo",
      src: "assets/img/jour-15.jpg",
      alt: "Nous deux en train de danser",
      caption: "Le soir où on a dansé dessus pour la première fois",
      date: "Décembre 2023",
    },
  },
  {
    day: 16,
    type: "photo",
    src: "assets/img/jour-16.jpg",
    alt: "Coucher de soleil à deux",
    caption: "Ce coucher de soleil, toi, et moi",
    date: "Août 2024",
  },
  {
    day: 17,
    type: "message",
    title: "Un petit poème (fait maison)",
    text: `Il y a ton rire le matin,
      qui fait fondre le givre aux fenêtres,
      il y a ta main dans ma main
      quand le monde se fait trop bête.

      Il y a nos dimanches sans fin,
      nos plaids, nos films, nos tasses de thé…
      Et moi qui compte, chaque matin,
      la chance de t'avoir trouvée.`,
    signature: "Ton poète du dimanche",
  },
  {
    day: 18,
    type: "indice",
    label: "Chasse au trésor · Étape 2/2",
    title: "Froid comme l'hiver",
    clue: `Je suis toujours glacé mais j'ai le cœur tendre,
      tu m'ouvres souvent sans rien attendre…
      Aujourd'hui, entre le beurre et la confiture,
      une douceur t'attend, c'est sûr.`,
    hint: "Ouvre le frigo, étagère du milieu 🧊",
  },
  {
    day: 19,
    type: "coupon",
    title: "Bon pour",
    offer: "Une journée sans tâches ménagères",
    details: "Vaisselle, lessive, courses, aspirateur : je m'occupe de tout. Toi, tu te reposes.",
    validity: "Valable un jour au choix · prévenir 24 h à l'avance",
  },
  {
    day: 20,
    type: "quiz",
    question: "Quel surnom je t'ai donné en tout premier ?",
    choices: [
      "Ma puce",
      "Mon cœur",
      "Princesse",
    ],
    answer: 0,
    successMessage: "Bien joué ! Tu sais pourquoi ? 👇",
    reward: {
      type: "message",
      title: "Pourquoi « ma puce » ?",
      text: `Parce que le jour où je l'ai dit pour la première fois, tu sautillais partout en attendant le début du concert.

        C'est sorti tout seul, tu as rougi… et c'est resté.`,
      signature: "Ton chéri",
    },
  },
  {
    day: 21,
    type: "photo",
    src: "assets/img/jour-21.jpg",
    alt: "Notre premier Noël ensemble",
    caption: "Notre premier Noël ensemble",
    date: "Décembre 2023",
  },
  {
    day: 22,
    type: "coupon",
    title: "Bon pour",
    offer: "Une escapade en amoureux",
    details: "Un week-end surprise : destination secrète, tu prépares juste ta valise, je m'occupe de tout le reste.",
    validity: "À planifier ensemble en 2027",
  },
  {
    day: 23,
    type: "message",
    title: "La veille de la veille",
    text: `Plus qu'une case après celle-ci…

      Merci d'avoir joué le jeu chaque matin. Merci pour cette année, pour ta patience, pour tes fous rires, pour tous ces petits riens qui font un grand tout.

      Demain, une dernière chasse au trésor t'attend. Garde des forces 😉`,
    signature: "Ton chéri, qui t'aime",
  },
  {
    day: 24,
    type: "indice",
    label: "Chasse au trésor · Étape finale 🎄",
    title: "Ton vrai cadeau de Noël",
    clue: `Tu as suivi les indices, ouvert toutes les cases…
      Il ne te reste qu'un dernier pas.
      Là où brillent les guirlandes
      et où l'on se retrouvera demain matin,
      cherche le paquet qui porte ton prénom.`,
    hint: "Sous le sapin, tout au fond, derrière les autres paquets 🎁",
    note: "Joyeux Noël mon amour. Je t'aime.",
  },
];