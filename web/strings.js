// Multilanguage UI (English / Spanish / French) for the web layer.
//
// The selected language drives everything: the static page (data-i18n attributes)
// and every module that builds text with t(). The choice is kept in localStorage
// ('gta2-port-lang') and mirrored in <html lang>.
//
// HTML convention: data-i18n="key" (text content), data-i18n-title, data-i18n-placeholder
// and data-i18n-aria (aria-label); data-i18n-alt for images. A translation may carry inline
// markup (<code>, links) and then owns the element's content.
//
// Keys: ui.* belongs to the web layer; the game side registers shell.* / game.* with
// registerDict(). Each module registers its own strings (see the registerDict calls).

export const LANGS = ['en', 'es', 'fr'];
const STORAGE_KEY = 'gta2-port-lang';

const dicts = { en: {}, es: {}, fr: {} };
const listeners = new Set();
let current = readStored();

function readStored() {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(code) ? code : 'en';
  } catch {
    return 'en'; // storage unavailable (private window): default language
  }
}

export function lang() {
  return current;
}

/** Sets the language, persists it, updates the page and notifies subscribers. */
export function setLang(code) {
  if (!LANGS.includes(code) || code === current) return;
  current = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage unavailable */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    applyDom(document);
  }
  for (const fn of [...listeners]) fn(code);
}

/** fn(code) on every change; returns the unsubscribe function. */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translates a key with optional {name} variables. Fallback: current language, 'en', the key. */
export function t(key, vars) {
  const text = dicts[current][key] ?? dicts.en[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

/** Merges { en: {key: str}, es: {...}, fr: {...} } into the dictionaries. */
export function registerDict(dict) {
  for (const code of LANGS) Object.assign(dicts[code], dict[code] || {});
}

const ATTRS = { title: 'title', placeholder: 'placeholder', aria: 'aria-label', alt: 'alt' };
const MARKUP = /<[a-z/]/i;

const all = (root, selector) =>
  (root.matches && root.matches(selector) ? [root] : []).concat([...root.querySelectorAll(selector)]);

/** Rewrites [data-i18n] (text) and the [data-i18n-title|placeholder|aria|alt] attributes. */
export function applyDom(root = document) {
  for (const el of all(root, '[data-i18n]')) {
    const text = t(el.getAttribute('data-i18n'));
    if (MARKUP.test(text)) el.innerHTML = text;
    else el.textContent = text;
  }
  for (const [suffix, attr] of Object.entries(ATTRS)) {
    for (const el of all(root, `[data-i18n-${suffix}]`)) el.setAttribute(attr, t(el.getAttribute(`data-i18n-${suffix}`)));
  }
}

// ---- the web layer's own strings (index.html) --------------------------

const UI = {
  en: {
    'ui.docTitle': 'GTA2 in your browser',
    'ui.logo.tagline': 'in your browser',
    'ui.nav.sections': 'Sections',
    'ui.nav.play': 'Play',
    'ui.nav.crews': 'Crews',
    'ui.nav.controls': 'Controls',
    'ui.nav.options': 'Options',
    'ui.nav.help': 'Help',
    'ui.playNow': 'Play now',
    'ui.play': 'Play',

    'ui.hero.tag': 'Respect is everything',
    'ui.hero.shotAlt': "GTA2's Downtown district in widescreen, with the round radar",
    'ui.hero.title': 'GTA2 in your <span>browser</span>',
    'ui.hero.lead': "The real 1999 game, running in your browser on any computer. Nothing to install. Widescreen, smooth at your screen's refresh rate, a full map, and co-op with friends.",
    'ui.files.preparing': 'Getting GTA2 ready…',

    'ui.mode.single': 'Single player',
    'ui.mode.singlePillDistricts': '3 districts',
    'ui.mode.singlePillSaves': 'Saves in your browser',
    'ui.mode.singleLead': 'The full story: Downtown, Residential and Industrial. Earn respect with the gangs, take their jobs, and keep the cops off your back.',
    'ui.mode.friends': 'Play with friends',
    'ui.mode.friendsPillPlayers': 'Up to 6 players',
    'ui.mode.friendsLead': 'Host a room and send your friends the link. Everyone sees each other on the map, shares waypoints, and keeps score.',
    'ui.mode.hostOrJoin': 'Host or join',
    'ui.mode.map': 'The map',
    'ui.mode.mapPillWaypoints': 'Waypoints',
    'ui.mode.mapLead': 'A full map of each district that fills in as you explore, with gang jobs, phones, garages and save points. Click anywhere to set a waypoint.',
    'ui.mode.seeControls': 'See controls',
    'ui.mode.roam': 'Free roam',
    'ui.mode.wars': 'Gang Wars',
    'ui.mode.ffa': 'Free-for-all',

    'ui.crews.title': 'Crew leaderboard',
    'ui.crews.sub': 'Gang Wars crews on this server. Win matches, rack up kills and points to climb. A win is worth 50 reputation, each kill 5, each death −2, and every $10,000 of points 1.',
    'ui.crews.empty': 'No crews yet. Start a Gang War: "Play with friends", then mode "Gang Wars".',

    'ui.controls.title': 'Controls',
    'ui.controls.keyboard': 'Keyboard',
    'ui.controller': 'Controller',
    'ui.controls.changeNote': 'Change any of them in the game: Options on the main menu, or the Controls button under the game.',
    'ui.controls.padNote': "In the game's menus and on the map: ✕ confirms, ○ goes back, the left stick or d-pad moves, L1 / R1 zoom the map.",

    'ui.options.title': 'Options',
    'ui.options.intro': 'Saved in this browser and used next time you start. The buttons at the bottom of the game screen change most of them while you play.',

    'ui.help.title': 'Help and FAQ',
    'ui.help.q1': 'What is this?',
    'ui.help.a1': "Grand Theft Auto 2 (DMA Design, 1999), running from the community's reconstruction of its original code, compiled for the web. It plays like the original, with modern extras: widescreen, a smoother camera, smooth motion on high-refresh screens, a map with waypoints, and co-op.",
    'ui.help.q2': 'Do I need to install anything?',
    'ui.help.a2': 'No. The first visit downloads the game once (about 355 MB) and keeps it in your browser, so later visits start straight away. Use a desktop browser: Chrome, Edge, Firefox, Safari or Brave, on Windows, macOS, Linux or ChromeOS.',
    'ui.help.q3': 'How does co-op work?',
    'ui.help.a3': 'Press "Host or join", host a room, and send your friends the link the lobby shows. When everyone is in, pick a district and start. Every player\'s browser runs the whole game; only key presses travel between you. Hold Tab for the scoreboard; your friends show on the map and radar in their own colours.',
    'ui.help.q4': 'Where are my saves?',
    'ui.help.a4': 'In this browser. Use "Export saves" at the bottom of the game screen to keep a copy, and "Import saves" to bring them to another browser.',
    'ui.help.q5': 'It runs slowly or looks wrong',
    'ui.help.a5': 'Turn on the FPS counter in Options. Close other heavy tabs, and try another browser if it stays low. "Motion: Original 30 fps" and "Screen shape: 4:3 original" are the lightest settings.',
    'ui.help.q6': 'Is it legal?',
    'ui.help.a6': 'GTA2 was released as freeware by Rockstar Games in 2004. This is an unofficial, non-commercial fan project, not affiliated with Rockstar Games or Take-Two Interactive. GTA2 is © Rockstar Games.',
    'ui.help.q7': 'Which languages are there?',
    'ui.help.a7': "English, Spanish and French, for this page and for the game itself: menus, HUD and status messages. Mission briefs are only translated when your game files include the game's own Spanish or French texts; otherwise they stay in English.",
    'ui.help.q8': 'Do you track me?',
    'ui.help.a8': 'No cookies and no personal data. This site counts visits, games started, how long games run (in steps such as "over 30 minutes") and first-time downloads, anonymously with <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a>, so we know how many people play.',

    'ui.foot.credit': '<a href="https://github.com/M1sterMo/gta2-browser" target="_blank" rel="noopener">Source and credits on GitHub</a> · Grand Theft Auto 2 © Rockstar Games',

    'ui.picker.title': 'GTA2 in the browser',
    'ui.picker.intro': 'Choose your installed GTA2 folder (the one containing <code>data</code>). Your game files are read locally and never leave this computer.',
    'ui.picker.choose': 'Choose GTA2 folder',
    'ui.picker.forget': 'Forget game files',

    'ui.coop.lead': "Free roam with friends in a story district, using GTA2's own multiplayer. Everyone runs the game; only key presses travel between players.",
    'ui.coop.p2p': 'They go directly from browser to browser (peer to peer, no game server). Each player needs their own copy of the game files.',
    'ui.coop.yourName': 'Your name',
    'ui.coop.namePlaceholder': 'Player',
    'ui.coop.host': 'Host a game',
    'ui.coop.or': 'or',
    'ui.coop.roomCode': 'Room code',
    'ui.coop.join': 'Join',
    'ui.coop.invite': 'Send your friends this link:',
    'ui.coop.inviteLink': 'Invite link',
    'ui.coop.copy': 'Copy',
    'ui.coop.mode': 'Mode',
    'ui.coop.district': 'District',
    'ui.coop.timeLimit': 'Time limit (min, 0 = none)',
    'ui.coop.killsToWin': 'Kills to win (0 = no limit)',
    'ui.coop.pointsToWin': 'Points to win ($, 0 = no target)',
    'ui.coop.friendlyFire': 'Friendly fire',
    'ui.coop.ffHint': 'players can hurt each other',
    'ui.coop.newCrew': 'New crew (or join one below)',
    'ui.coop.crewPlaceholder': 'Crew name, e.g. Hexen',
    'ui.coop.start': 'Start',

    'ui.freeware.lead': 'No GTA2 installed? Rockstar released it free in 2004. Download that release from the Internet Archive straight into this browser (346 MB); it is unpacked here and kept for next time.',
    'ui.freeware.download': 'Download GTA2 (free, 346 MB)',
    'ui.freeware.pick': 'Or download <code>GTA2INSTALLER.exe</code> from the <a href="https://archive.org/details/gta2_rockstar-classics" target="_blank" rel="noopener">Internet Archive</a> yourself and choose it here:',
    'ui.freeware.choose': 'Choose GTA2INSTALLER.exe',

    'ui.tools.cameraModern': 'Camera: Modern',
    'ui.tools.cameraTitle': 'Modern: smooth zoom (no pumping). Classic: the original camera.',
    'ui.tools.viewNormal': 'View: Normal',
    'ui.tools.map': 'Map (M)',
    'ui.tools.mapTitle': 'Full map (M): set a waypoint',
    'ui.tools.minimap': 'Minimap',
    'ui.tools.fullscreen': 'Full screen',
    'ui.tools.mute': 'Mute',
    'ui.tools.saves': 'Saves',
    'ui.tools.export': 'Export saves',
    'ui.tools.import': 'Import saves',
    'ui.tools.controls': 'Controls',
    'ui.tools.controlsTitle': "Change the game's keys",

    'ui.district.downtown': 'Downtown',
    'ui.district.residential': 'Residential',
    'ui.district.industrial': 'Industrial',
  },

  es: {
    'ui.docTitle': 'GTA2 en tu navegador',
    'ui.logo.tagline': 'en tu navegador',
    'ui.nav.sections': 'Secciones',
    'ui.nav.play': 'Jugar',
    'ui.nav.crews': 'Clanes',
    'ui.nav.controls': 'Controles',
    'ui.nav.options': 'Opciones',
    'ui.nav.help': 'Ayuda',
    'ui.playNow': 'Jugar ahora',
    'ui.play': 'Jugar',

    'ui.hero.tag': 'El respeto lo es todo',
    'ui.hero.shotAlt': 'El distrito Centro de GTA2 en pantalla panorámica, con el radar redondo',
    'ui.hero.title': 'GTA2 en tu <span>navegador</span>',
    'ui.hero.lead': 'El juego original de 1999, en tu navegador y en cualquier equipo. Nada que instalar. Pantalla panorámica, fluidez a la frecuencia de tu pantalla, un mapa completo y cooperativo con amigos.',
    'ui.files.preparing': 'Preparando GTA2…',

    'ui.mode.single': 'Un jugador',
    'ui.mode.singlePillDistricts': '3 distritos',
    'ui.mode.singlePillSaves': 'Guardado en tu navegador',
    'ui.mode.singleLead': 'La historia completa: Centro, Residencial e Industrial. Gánate el respeto de las bandas, acepta sus trabajos y mantén a la policía lejos.',
    'ui.mode.friends': 'Juega con amigos',
    'ui.mode.friendsPillPlayers': 'Hasta 6 jugadores',
    'ui.mode.friendsLead': 'Crea una sala y envía el enlace a tus amigos. Todos se ven en el mapa, comparten puntos de ruta y llevan la puntuación.',
    'ui.mode.hostOrJoin': 'Crear o unirse',
    'ui.mode.map': 'El mapa',
    'ui.mode.mapPillWaypoints': 'Puntos de ruta',
    'ui.mode.mapLead': 'Un mapa completo de cada distrito que se descubre al explorar, con trabajos de las bandas, teléfonos, talleres y puntos de guardado. Haz clic en cualquier lugar para fijar un punto de ruta.',
    'ui.mode.seeControls': 'Ver controles',
    'ui.mode.roam': 'Recorrido libre',
    'ui.mode.wars': 'Guerras de bandas',
    'ui.mode.ffa': 'Todos contra todos',

    'ui.crews.title': 'Clasificación de clanes',
    'ui.crews.sub': 'Los clanes de Guerras de bandas de este servidor. Gana partidas, acumula asesinatos y puntos para escalar. Una victoria vale 50 de reputación, cada asesinato 5, cada muerte −2 y cada 10.000 $ en puntos, 1.',
    'ui.crews.empty': 'Todavía no hay clanes. Empieza una Guerra de bandas: «Juega con amigos» y elige el modo «Guerras de bandas».',

    'ui.controls.title': 'Controles',
    'ui.controls.keyboard': 'Teclado',
    'ui.controller': 'Mando',
    'ui.controls.changeNote': 'Puedes cambiar cualquiera de ellos en el juego: en Opciones, en el menú principal, o con el botón Controles bajo el juego.',
    'ui.controls.padNote': 'En los menús del juego y en el mapa: ✕ confirma, ○ vuelve, el stick izquierdo o la cruceta mueve, L1 / R1 hacen zoom en el mapa.',

    'ui.options.title': 'Opciones',
    'ui.options.intro': 'Se guardan en este navegador y se usan la próxima vez que inicies. Los botones de la pantalla de juego cambian la mayoría mientras juegas.',

    'ui.help.title': 'Ayuda y preguntas frecuentes',
    'ui.help.q1': '¿Qué es esto?',
    'ui.help.a1': 'Grand Theft Auto 2 (DMA Design, 1999), ejecutándose con la reconstrucción que hizo la comunidad de su código original, compilada para la web. Se juega como el original, con extras modernos: pantalla panorámica, una cámara más suave, movimiento fluido en pantallas de alta frecuencia, un mapa con puntos de ruta y cooperativo.',
    'ui.help.q2': '¿Necesito instalar algo?',
    'ui.help.a2': 'No. La primera visita descarga el juego una vez (unos 355 MB) y lo guarda en tu navegador, así que las siguientes visitas empiezan al instante. Usa un navegador de escritorio: Chrome, Edge, Firefox, Safari o Brave, en Windows, macOS, Linux o ChromeOS.',
    'ui.help.q3': '¿Cómo funciona el cooperativo?',
    'ui.help.a3': 'Pulsa «Crear o unirse», crea una sala y envía a tus amigos el enlace que muestra la sala. Cuando estén todos, elige un distrito y empieza. El navegador de cada jugador ejecuta el juego completo; solo viajan las pulsaciones de teclas. Mantén pulsado Tab para la tabla de puntuaciones; tus amigos aparecen en el mapa y el radar con sus propios colores.',
    'ui.help.q4': '¿Dónde están mis partidas guardadas?',
    'ui.help.a4': 'En este navegador. Usa «Exportar partidas» en la pantalla de juego para guardar una copia, y «Importar partidas» para llevarlas a otro navegador.',
    'ui.help.q5': 'Va lento o se ve mal',
    'ui.help.a5': 'Activa el contador de FPS en Opciones. Cierra otras pestañas pesadas y prueba otro navegador si sigue bajo. «Movimiento: 30 fps original» y «Formato de pantalla: 4:3 original» son los ajustes más ligeros.',
    'ui.help.q6': '¿Es legal?',
    'ui.help.a6': 'Rockstar Games publicó GTA2 como freeware en 2004. Este es un proyecto de fans, no oficial y sin ánimo de lucro, no afiliado a Rockstar Games ni a Take-Two Interactive. GTA2 es © Rockstar Games.',
    'ui.help.q7': '¿Qué idiomas hay?',
    'ui.help.a7': 'Inglés, español y francés, para esta página y para el juego: menús, HUD y mensajes de estado. Los resúmenes de las misiones solo se traducen si tus archivos de juego incluyen los textos propios en español o francés del juego; si no, siguen en inglés.',
    'ui.help.q8': '¿Me rastreáis?',
    'ui.help.a8': 'Sin cookies ni datos personales. Este sitio cuenta las visitas, las partidas iniciadas, cuánto duran (en tramos como «más de 30 minutos») y las primeras descargas, de forma anónima con <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a>, para saber cuánta gente juega.',

    'ui.foot.credit': '<a href="https://github.com/M1sterMo/gta2-browser" target="_blank" rel="noopener">Código y créditos en GitHub</a> · Grand Theft Auto 2 © Rockstar Games',

    'ui.picker.title': 'GTA2 en el navegador',
    'ui.picker.intro': 'Elige la carpeta de GTA2 instalada (la que contiene <code>data</code>). Tus archivos de juego se leen en este equipo y nunca salen de él.',
    'ui.picker.choose': 'Elegir carpeta de GTA2',
    'ui.picker.forget': 'Olvidar los archivos de juego',

    'ui.coop.lead': 'Recorrido libre con amigos en un distrito de la historia, con el multijugador propio de GTA2. Todos ejecutan el juego; solo viajan las pulsaciones de teclas.',
    'ui.coop.p2p': 'Viajan directamente de navegador a navegador (peer to peer, sin servidor de juego). Cada jugador necesita su propia copia de los archivos de juego.',
    'ui.coop.yourName': 'Tu nombre',
    'ui.coop.namePlaceholder': 'Jugador',
    'ui.coop.host': 'Crear una partida',
    'ui.coop.or': 'o',
    'ui.coop.roomCode': 'Código de sala',
    'ui.coop.join': 'Unirse',
    'ui.coop.invite': 'Envía este enlace a tus amigos:',
    'ui.coop.inviteLink': 'Enlace de invitación',
    'ui.coop.copy': 'Copiar',
    'ui.coop.mode': 'Modo',
    'ui.coop.district': 'Distrito',
    'ui.coop.timeLimit': 'Límite de tiempo (min, 0 = sin límite)',
    'ui.coop.killsToWin': 'Asesinatos para ganar (0 = sin límite)',
    'ui.coop.pointsToWin': 'Puntos para ganar ($, 0 = sin objetivo)',
    'ui.coop.friendlyFire': 'Fuego amigo',
    'ui.coop.ffHint': 'los jugadores pueden hacerse daño',
    'ui.coop.newCrew': 'Nuevo clan (o únete a uno de abajo)',
    'ui.coop.crewPlaceholder': 'Nombre del clan, p. ej. Hexen',
    'ui.coop.start': 'Empezar',

    'ui.freeware.lead': '¿No tienes GTA2 instalado? Rockstar lo publicó gratis en 2004. Descarga esa edición del Internet Archive directamente a este navegador (346 MB); se descomprime aquí y se guarda para la próxima vez.',
    'ui.freeware.download': 'Descargar GTA2 (gratis, 346 MB)',
    'ui.freeware.pick': 'O descarga <code>GTA2INSTALLER.exe</code> del <a href="https://archive.org/details/gta2_rockstar-classics" target="_blank" rel="noopener">Internet Archive</a> tú mismo y elígelo aquí:',
    'ui.freeware.choose': 'Elegir GTA2INSTALLER.exe',

    'ui.tools.cameraModern': 'Cámara: Moderna',
    'ui.tools.cameraTitle': 'Moderna: zoom suave (sin bombeo). Clásica: la cámara original.',
    'ui.tools.viewNormal': 'Vista: Normal',
    'ui.tools.map': 'Mapa (M)',
    'ui.tools.mapTitle': 'Mapa completo (M): fija un punto de ruta',
    'ui.tools.minimap': 'Minimapa',
    'ui.tools.fullscreen': 'Pantalla completa',
    'ui.tools.mute': 'Silenciar',
    'ui.tools.saves': 'Partidas',
    'ui.tools.export': 'Exportar partidas',
    'ui.tools.import': 'Importar partidas',
    'ui.tools.controls': 'Controles',
    'ui.tools.controlsTitle': 'Cambiar las teclas del juego',

    'ui.district.downtown': 'Centro',
    'ui.district.residential': 'Residencial',
    'ui.district.industrial': 'Industrial',
  },

  fr: {
    'ui.docTitle': 'GTA2 dans votre navigateur',
    'ui.logo.tagline': 'dans votre navigateur',
    'ui.nav.sections': 'Sections',
    'ui.nav.play': 'Jouer',
    'ui.nav.crews': 'Équipes',
    'ui.nav.controls': 'Commandes',
    'ui.nav.options': 'Options',
    'ui.nav.help': 'Aide',
    'ui.playNow': 'Jouer maintenant',
    'ui.play': 'Jouer',

    'ui.hero.tag': 'Le respect, c’est tout',
    'ui.hero.shotAlt': 'Le quartier Centre-ville de GTA2 en écran large, avec le radar rond',
    'ui.hero.title': 'GTA2 dans votre <span>navigateur</span>',
    'ui.hero.lead': "Le vrai jeu de 1999, dans votre navigateur et sur n'importe quel ordinateur. Rien à installer. Écran large, fluide au rythme de votre écran, une carte complète et le coopératif entre amis.",
    'ui.files.preparing': 'Préparation de GTA2…',

    'ui.mode.single': 'Solo',
    'ui.mode.singlePillDistricts': '3 quartiers',
    'ui.mode.singlePillSaves': 'Sauvegardes dans votre navigateur',
    'ui.mode.singleLead': "Toute l'histoire : Centre-ville, Résidentiel et Industriel. Gagnez le respect des gangs, prenez leurs contrats et tenez la police à distance.",
    'ui.mode.friends': 'Jouer avec des amis',
    'ui.mode.friendsPillPlayers': "Jusqu'à 6 joueurs",
    'ui.mode.friendsLead': 'Créez une salle et envoyez le lien à vos amis. Tout le monde se voit sur la carte, partage des points de passage et marque des points.',
    'ui.mode.hostOrJoin': 'Créer ou rejoindre',
    'ui.mode.map': 'La carte',
    'ui.mode.mapPillWaypoints': 'Points de passage',
    'ui.mode.mapLead': "Une carte complète de chaque quartier qui se révèle à mesure que vous explorez, avec les contrats des gangs, les téléphones, les garages et les points de sauvegarde. Cliquez n'importe où pour placer un point de passage.",
    'ui.mode.seeControls': 'Voir les commandes',
    'ui.mode.roam': 'Balade libre',
    'ui.mode.wars': 'Guerres de gangs',
    'ui.mode.ffa': 'Chacun pour soi',

    'ui.crews.title': 'Classement des équipes',
    'ui.crews.sub': "Les équipes de Guerres de gangs de ce serveur. Remportez des matchs, enchaînez les éliminations et les points pour monter. Une victoire vaut 50 de réputation, chaque élimination 5, chaque mort −2, et chaque 10 000 $ de points 1.",
    'ui.crews.empty': "Pas encore d'équipes. Lancez une Guerre de gangs : « Jouer avec des amis », puis le mode « Guerres de gangs ».",

    'ui.controls.title': 'Commandes',
    'ui.controls.keyboard': 'Clavier',
    'ui.controller': 'Manette',
    'ui.controls.changeNote': "Vous pouvez toutes les modifier dans le jeu : dans Options, au menu principal, ou avec le bouton Commandes sous le jeu.",
    'ui.controls.padNote': "Dans les menus du jeu et sur la carte : ✕ confirme, ○ revient, le stick gauche ou la croix directionnelle déplace, L1 / R1 zooment sur la carte.",

    'ui.options.title': 'Options',
    'ui.options.intro': "Enregistrées dans ce navigateur et utilisées au prochain démarrage. Les boutons en bas de l'écran de jeu en modifient la plupart pendant que vous jouez.",

    'ui.help.title': 'Aide et FAQ',
    'ui.help.q1': 'Qu’est-ce que c’est ?',
    'ui.help.a1': "Grand Theft Auto 2 (DMA Design, 1999), exécuté grâce à la reconstruction par la communauté de son code d'origine, compilée pour le web. Il se joue comme l'original, avec des extras modernes : écran large, caméra plus douce, mouvement fluide sur les écrans à haute fréquence, une carte avec des points de passage, et le coopératif.",
    'ui.help.q2': 'Dois-je installer quelque chose ?',
    'ui.help.a2': "Non. La première visite télécharge le jeu une fois (environ 355 Mo) et le garde dans votre navigateur, pour que les visites suivantes démarrent tout de suite. Utilisez un navigateur de bureau : Chrome, Edge, Firefox, Safari ou Brave, sous Windows, macOS, Linux ou ChromeOS.",
    'ui.help.q3': 'Comment marche le coopératif ?',
    'ui.help.a3': "Appuyez sur « Créer ou rejoindre », créez une salle et envoyez à vos amis le lien affiché. Quand tout le monde est là, choisissez un quartier et démarrez. Le navigateur de chaque joueur exécute tout le jeu ; seules les touches enfoncées circulent. Maintenez Tab pour le tableau des scores ; vos amis apparaissent sur la carte et le radar avec leurs couleurs.",
    'ui.help.q4': 'Où sont mes sauvegardes ?',
    'ui.help.a4': "Dans ce navigateur. Utilisez « Exporter les sauvegardes » en bas de l'écran de jeu pour garder une copie, et « Importer les sauvegardes » pour les emmener dans un autre navigateur.",
    'ui.help.q5': 'Ça rame ou ça s’affiche mal',
    'ui.help.a5': "Activez le compteur FPS dans Options. Fermez les autres onglets lourds et essayez un autre navigateur si le taux reste bas. « Mouvement : 30 fps d'origine » et « Format d'écran : 4:3 d'origine » sont les réglages les plus légers.",
    'ui.help.q6': 'Est-ce légal ?',
    'ui.help.a6': 'GTA2 a été publié en freeware par Rockstar Games en 2004. C’est un projet de fans non officiel et non commercial, sans affiliation avec Rockstar Games ni Take-Two Interactive. GTA2 est © Rockstar Games.',
    'ui.help.q7': 'Quelles langues sont disponibles ?',
    'ui.help.a7': "L'anglais, l'espagnol et le français, pour cette page et pour le jeu lui-même : menus, HUD et messages d'état. Les briefings des missions ne sont traduits que si vos fichiers de jeu incluent les textes espagnols ou français d'origine du jeu ; sinon, ils restent en anglais.",
    'ui.help.q8': 'Est-ce que vous me pistez ?',
    'ui.help.a8': "Ni cookies ni données personnelles. Ce site compte les visites, les parties lancées, leur durée (par paliers comme « plus de 30 minutes ») et les premiers téléchargements, anonymement avec <a href=\"https://www.goatcounter.com\" target=\"_blank\" rel=\"noopener\">GoatCounter</a>, pour savoir combien de personnes jouent.",

    'ui.foot.credit': '<a href="https://github.com/M1sterMo/gta2-browser" target="_blank" rel="noopener">Code et crédits sur GitHub</a> · Grand Theft Auto 2 © Rockstar Games',

    'ui.picker.title': 'GTA2 dans le navigateur',
    'ui.picker.intro': 'Choisissez le dossier GTA2 installé (celui qui contient <code>data</code>). Vos fichiers de jeu sont lus localement et ne quittent jamais cet ordinateur.',
    'ui.picker.choose': 'Choisir le dossier GTA2',
    'ui.picker.forget': 'Oublier les fichiers de jeu',

    'ui.coop.lead': "Balade libre entre amis dans un quartier de l'histoire, avec le multijoueur de GTA2. Tout le monde exécute le jeu ; seules les touches enfoncées circulent.",
    'ui.coop.p2p': "Elles vont directement d'un navigateur à l'autre (pair à pair, sans serveur de jeu). Chaque joueur a besoin de sa propre copie des fichiers de jeu.",
    'ui.coop.yourName': 'Votre nom',
    'ui.coop.namePlaceholder': 'Joueur',
    'ui.coop.host': 'Créer une partie',
    'ui.coop.or': 'ou',
    'ui.coop.roomCode': 'Code de la salle',
    'ui.coop.join': 'Rejoindre',
    'ui.coop.invite': 'Envoyez ce lien à vos amis :',
    'ui.coop.inviteLink': "Lien d'invitation",
    'ui.coop.copy': 'Copier',
    'ui.coop.mode': 'Mode',
    'ui.coop.district': 'Quartier',
    'ui.coop.timeLimit': 'Limite de temps (min, 0 = aucun)',
    'ui.coop.killsToWin': 'Éliminations pour gagner (0 = illimité)',
    'ui.coop.pointsToWin': 'Points pour gagner ($, 0 = aucun objectif)',
    'ui.coop.friendlyFire': 'Tir allié',
    'ui.coop.ffHint': 'les joueurs peuvent se blesser',
    'ui.coop.newCrew': "Nouvelle équipe (ou rejoignez-en une ci-dessous)",
    'ui.coop.crewPlaceholder': "Nom de l'équipe, ex. Hexen",
    'ui.coop.start': 'Démarrer',

    'ui.freeware.lead': "Pas de GTA2 installé ? Rockstar l'a publié gratuitement en 2004. Téléchargez cette édition depuis l'Internet Archive directement dans ce navigateur (346 Mo) ; elle est décompressée ici et gardée pour la prochaine fois.",
    'ui.freeware.download': 'Télécharger GTA2 (gratuit, 346 Mo)',
    'ui.freeware.pick': 'Ou téléchargez vous-même <code>GTA2INSTALLER.exe</code> depuis <a href="https://archive.org/details/gta2_rockstar-classics" target="_blank" rel="noopener">Internet Archive</a> et choisissez-le ici :',
    'ui.freeware.choose': 'Choisir GTA2INSTALLER.exe',

    'ui.tools.cameraModern': 'Caméra : Moderne',
    'ui.tools.cameraTitle': "Moderne : zoom doux (sans pompage). Classique : la caméra d'origine.",
    'ui.tools.viewNormal': 'Vue : Normale',
    'ui.tools.map': 'Carte (M)',
    'ui.tools.mapTitle': 'Carte complète (M) : placer un point de passage',
    'ui.tools.minimap': 'Minicarte',
    'ui.tools.fullscreen': 'Plein écran',
    'ui.tools.mute': 'Couper le son',
    'ui.tools.saves': 'Sauvegardes',
    'ui.tools.export': 'Exporter les sauvegardes',
    'ui.tools.import': 'Importer les sauvegardes',
    'ui.tools.controls': 'Commandes',
    'ui.tools.controlsTitle': 'Modifier les touches du jeu',

    'ui.district.downtown': 'Centre-ville',
    'ui.district.residential': 'Résidentiel',
    'ui.district.industrial': 'Industriel',
  },
};

registerDict(UI);

// In the browser: apply the stored language as soon as the page's markup is parsed.
if (typeof document !== 'undefined') {
  document.documentElement.lang = current;
  applyDom(document);
}
