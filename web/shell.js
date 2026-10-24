// Browser shell for the GTA2 port: loads the player's own game files into the
// in-memory filesystem, wires input and the renderer, and starts the core.
// No game file leaves the device (R01); nothing is fetched from the network
// except the port itself, or local files in ?devdata=1 developer mode.
import createGta2 from './gta2.js';
import { SAVE_KEY, SaveStates, exportSaves, importSaves, listSaves, toast } from './savestate.js';
import { SavesScreen } from './saves.js';
import { ControlsScreen } from './controls.js';
import { Gta2Renderer } from './renderer.js';
import { SaveStorage } from './storage.js';
import { Gta2Audio } from './audio.js';
import { GameFileCache, downloadFreeware, unpackInstallerFile } from './gamefiles.js';
import { Gta2Map, exportDiscovery, importDiscovery } from './map.js';
import { hideLanding, landingProgress, showContinue, showLanding, showLeaderboard } from './landing.js';
import { count, initStats, startPlayClock } from './stats.js';
import { CoopChat } from './chat.js';
import { GamepadInput } from './gamepad.js';
import { CoopLobby, DISTRICTS, GANGS, LocalTransport, MODES, ServerTransport, WebRtcTransport } from './net.js';
import { LANGS, lang as currentLang, onLangChange, registerDict, setLang, t } from './strings.js';
import { money } from './savestate.js';
import { ensureGameLanguage, gxtLetterFor, initGameLanguage } from './gamelang.js';

// The shell's own user-facing text, in the web languages (namespace shell.*).
// Game text lives in data/*.gxt, translated by web/gxt-translations.js.
registerDict({
  en: {
    'shell.crash': 'The game stopped with an error: {message}',
    'shell.loginExpired': 'your login has expired. Open the invite link again, or enter the password',
    'shell.serverStatus': 'the server answered {status}',
    'shell.serverUnreachable': 'the game server could not be reached. Check your connection and reload',
    'shell.downloadInterrupted': 'the download was interrupted. Check your connection and reload the page',
    'shell.serverSendFailed': 'the server could not send {file} (error {status})',
    'shell.readyProgress': 'Getting GTA2 ready… {done} of {total} MB',
    'shell.loadingFiles': 'Loading game files… {done}/{total}',
    'shell.notAnInstall': 'That folder is not a GTA2 installation. Missing: {missing}. ' +
      'Pick the folder that contains the "data" folder.',
    'shell.preparing': 'Preparing game files… {done}/{total}',
    'shell.viewNormal': 'Normal',
    'shell.viewFar': 'Far',
    'shell.viewFarther': 'Farther',
    'shell.viewFarthest': 'Farthest',
    'shell.cameraModern': 'Camera: Modern',
    'shell.cameraClassic': 'Camera: Classic',
    'shell.viewLabel': 'View: {view}',
    'shell.viewTitle': 'How much of the city you see (− / = keys)',
    'shell.viewTitleDisabled': 'View distance needs the Modern camera',
    'shell.mapDuringPlay': 'The map opens during play.',
    'shell.minimap': 'Minimap',
    'shell.minimapOff': 'Minimap off',
    'shell.fps': '{fps} fps',
    'shell.fpsWait': '… fps',
    'shell.fullscreenUnavailable': 'Full screen is not available here ({message}).',
    'shell.fullscreen': 'Full screen',
    'shell.exitFullscreen': 'Exit full screen',
    'shell.controllerConnected': 'Controller connected',
    'shell.controllerUnsupported': 'This controller is not supported by the browser',
    'shell.mute': 'Mute',
    'shell.unmute': 'Unmute',
    'shell.radioOn': 'Radio on',
    'shell.radioOff': 'Radio off (R to turn it back on)',
    'shell.imported': 'Imported {saves} game save file(s), {states} Saves-screen save(s) and map progress for ' +
      '{districts} district(s). Reload the page to use them.',
    'shell.caching': 'Saving your game files in this browser, so next time you can just press Play…',
    'shell.cached': 'Game files saved in this browser ({mb} MB). Next time, press Play.',
    'shell.cacheFailed': 'Could not keep the game files in this browser ({message}); ' +
      'you will need to choose the folder again next time.',
    'shell.playerN': 'Player {n}',
    'shell.defaultName': 'Player',
    'shell.gangWarWon': '{crew} win the Gang War!',
    'shell.desync': 'The games have drifted apart (tick {tick}, with {player}): what you see may no longer match. ' +
      'Start a new match to fix it.',
    'shell.waitingFor': 'Waiting for {players}…',
    'shell.you': '{name} (you)',
    'shell.warsTied': 'Gang Wars: level',
    'shell.warsLead': 'Gang Wars: {crew} leads with {points}',
    'shell.warsWon': 'Gang Wars: {crew} won with {points}',
    'shell.warsDraw': 'Gang Wars: a draw',
    'shell.colCrewPlayer': 'Crew / player',
    'shell.colPlayer': 'Player',
    'shell.colKills': 'Kills',
    'shell.colDeaths': 'Deaths',
    'shell.colPoints': 'Points',
    'shell.ffaLeadOne': 'Free-for-all: {name} leads with 1 kill',
    'shell.ffaLeadMany': 'Free-for-all: {name} leads with {kills} kills',
    'shell.ffaWonOne': 'Free-for-all: {name} won with 1 kill',
    'shell.ffaWonMany': 'Free-for-all: {name} won with {kills} kills',
    'shell.roamTitle': 'Free roam',
    'shell.coopTitle': 'Co-op',
    'shell.starting': 'Starting…',
    'shell.gameMessage': '{caption}: {text}',
    'shell.gameExited': 'The game exited (code {code}). Reload the page to play again.',
    'shell.matchEnded': 'The match has ended. Back to the lobby…',
    'shell.waitingLoad': 'Waiting for everyone to load…',
    'shell.couldNotStart': 'Could not start (code {code}).',
    'shell.savesTitle': 'Save (20% of your cash, at least $10,000) or load ({key} or F5)',
    'shell.readingInstaller': 'Reading the installer…',
    'shell.checkingInstaller': 'Checking the installer…',
    'shell.unpacking': 'Unpacking GTA2 in this browser…',
    'shell.checkingDownload': 'Checking the download…',
    'shell.downloading': 'Downloading GTA2 from the Internet Archive… {done} / {total} MB',
    'shell.downloadingSecs': 'Downloading GTA2 from the Internet Archive… {done} / {total} MB (about {secs} s left)',
    'shell.downloadingMins': 'Downloading GTA2 from the Internet Archive… {done} / {total} MB (about {mins} min left)',
    'shell.fromServer': 'Getting GTA2 from the game server…',
    'shell.connectingArchive': 'Connecting to the Internet Archive…',
    'shell.ready': 'GTA2 is ready.',
    'shell.filesFailed': 'Could not get the game files: {message}. Press Play to try again.',
    'shell.coopNeedFolder': 'Choose your GTA2 folder once on the normal start page first, then come back to co-op.',
    'shell.crewReputation': 'Crew reputation: {list}',
    'shell.crewRepRow': '{name} {delta} (now {reputation})',
    'shell.crewRepShort': 'reputation {reputation}, {wins} wins',
    'shell.newCrew': 'new crew',
    'shell.playWithFriends': 'Play with friends',
    'shell.helpRoam': 'Explore and cause trouble together. Friendly fire is your choice.',
    'shell.helpWars': 'Crews fight crews. Each crew sides with one of the district\'s gangs: its members leave you ' +
      'alone, the rival gangs hunt you. No friendly fire inside a crew. The crew with the most points wins.',
    'shell.helpFfa': 'Everyone against everyone, GTA2\'s own frag game: first to the kill limit wins.',
    'shell.tagHost': '(host)',
    'shell.tagYou': '— you',
    'shell.pickGang': 'Pick a gang…',
    'shell.gangTaken': '{gang} (taken)',
    'shell.sidesWith': 'sides with {gang}',
    'shell.noGang': 'has not picked a gang',
    'shell.leave': 'Leave',
    'shell.join': 'Join',
    'shell.noCrewYet': 'No crew yet: {players}. Join a crew above, or type a new crew name.',
    'shell.roomHost': 'Room {code}: share the code. {count} of 6 players. Start when everyone is here.',
    'shell.roomGuest': 'In room {code}. Waiting for the host to start.',
    'shell.roomLooking': 'Looking for room {code}… Finding each other through the public trackers can take up to a minute.',
    'shell.enterCode': 'Enter the room code you were given.',
    'shell.connectFailed': 'Could not set up the connection: {message}',
    'shell.startingMatch': 'Starting {mode} in {district} with {count} players…',
    'shell.copied': 'Copied',
    'shell.loadingFromComputer': 'Loading game files from this computer…',
    'shell.loadingFromBrowser': 'Loading game files from this browser…',
    'shell.savedInfo': 'Your GTA2 files are saved in this browser ({mb} MB).',
    'shell.filesForgotten': 'Game files removed from this browser.',
  },
  es: {
    'shell.crash': 'El juego se detuvo por un error: {message}',
    'shell.loginExpired': 'tu sesión ha caducado. Abre de nuevo el enlace de invitación o escribe la contraseña',
    'shell.serverStatus': 'el servidor respondió {status}',
    'shell.serverUnreachable': 'no se pudo contactar con el servidor del juego. Comprueba tu conexión y recarga',
    'shell.downloadInterrupted': 'la descarga se interrumpió. Comprueba tu conexión y recarga la página',
    'shell.serverSendFailed': 'el servidor no pudo enviar {file} (error {status})',
    'shell.readyProgress': 'Preparando GTA2… {done} de {total} MB',
    'shell.loadingFiles': 'Cargando archivos del juego… {done}/{total}',
    'shell.notAnInstall': 'Esa carpeta no es una instalación de GTA2. Faltan: {missing}. ' +
      'Elige la carpeta que contiene la carpeta "data".',
    'shell.preparing': 'Preparando los archivos del juego… {done}/{total}',
    'shell.viewNormal': 'Normal',
    'shell.viewFar': 'Lejos',
    'shell.viewFarther': 'Más lejos',
    'shell.viewFarthest': 'Lo más lejos',
    'shell.cameraModern': 'Cámara: moderna',
    'shell.cameraClassic': 'Cámara: clásica',
    'shell.viewLabel': 'Vista: {view}',
    'shell.viewTitle': 'Cuánta ciudad ves (teclas − / =)',
    'shell.viewTitleDisabled': 'La distancia de vista necesita la cámara moderna',
    'shell.mapDuringPlay': 'El mapa se abre durante la partida.',
    'shell.minimap': 'Minimapa',
    'shell.minimapOff': 'Sin minimapa',
    'shell.fps': '{fps} fps',
    'shell.fpsWait': '… fps',
    'shell.fullscreenUnavailable': 'La pantalla completa no está disponible aquí ({message}).',
    'shell.fullscreen': 'Pantalla completa',
    'shell.exitFullscreen': 'Salir de pantalla completa',
    'shell.controllerConnected': 'Mando conectado',
    'shell.controllerUnsupported': 'Este mando no es compatible con el navegador',
    'shell.mute': 'Silenciar',
    'shell.unmute': 'Activar sonido',
    'shell.radioOn': 'Radio encendida',
    'shell.radioOff': 'Radio apagada (R para encenderla)',
    'shell.imported': 'Se importaron {saves} partida(s) guardada(s), {states} guardado(s) de la pantalla Guardar ' +
      'y progreso del mapa de {districts} distrito(s). Recarga la página para usarlos.',
    'shell.caching': 'Guardando tus archivos de juego en este navegador, para que la próxima vez solo pulses Jugar…',
    'shell.cached': 'Archivos de juego guardados en este navegador ({mb} MB). La próxima vez, pulsa Jugar.',
    'shell.cacheFailed': 'No se pudieron guardar los archivos de juego en este navegador ({message}); ' +
      'tendrás que elegir la carpeta de nuevo la próxima vez.',
    'shell.playerN': 'Jugador {n}',
    'shell.defaultName': 'Jugador',
    'shell.gangWarWon': '¡{crew} gana la Guerra de bandas!',
    'shell.desync': 'Las partidas se han desincronizado (tic {tick}, con {player}): lo que ves puede no coincidir. ' +
      'Empieza otra partida para solucionarlo.',
    'shell.waitingFor': 'Esperando a {players}…',
    'shell.you': '{name} (tú)',
    'shell.warsTied': 'Guerra de bandas: empate',
    'shell.warsLead': 'Guerra de bandas: {crew} lidera con {points}',
    'shell.warsWon': 'Guerra de bandas: {crew} ganó con {points}',
    'shell.warsDraw': 'Guerra de bandas: empate',
    'shell.colCrewPlayer': 'Clan / jugador',
    'shell.colPlayer': 'Jugador',
    'shell.colKills': 'Asesinatos',
    'shell.colDeaths': 'Muertes',
    'shell.colPoints': 'Puntos',
    'shell.ffaLeadOne': 'Todos contra todos: {name} lidera con 1 asesinato',
    'shell.ffaLeadMany': 'Todos contra todos: {name} lidera con {kills} asesinatos',
    'shell.ffaWonOne': 'Todos contra todos: {name} ganó con 1 asesinato',
    'shell.ffaWonMany': 'Todos contra todos: {name} ganó con {kills} asesinatos',
    'shell.roamTitle': 'Recorrido libre',
    'shell.coopTitle': 'Cooperativo',
    'shell.starting': 'Empezando…',
    'shell.gameMessage': '{caption}: {text}',
    'shell.gameExited': 'El juego terminó (código {code}). Recarga la página para jugar de nuevo.',
    'shell.matchEnded': 'La partida ha terminado. De vuelta a la sala…',
    'shell.waitingLoad': 'Esperando a que todos carguen…',
    'shell.couldNotStart': 'No se pudo empezar (código {code}).',
    'shell.savesTitle': 'Guardar (20% de tu dinero, mínimo $10,000) o cargar ({key} o F5)',
    'shell.readingInstaller': 'Leyendo el instalador…',
    'shell.checkingInstaller': 'Comprobando el instalador…',
    'shell.unpacking': 'Descomprimiendo GTA2 en este navegador…',
    'shell.checkingDownload': 'Comprobando la descarga…',
    'shell.downloading': 'Descargando GTA2 del Internet Archive… {done} / {total} MB',
    'shell.downloadingSecs': 'Descargando GTA2 del Internet Archive… {done} / {total} MB (quedan unos {secs} s)',
    'shell.downloadingMins': 'Descargando GTA2 del Internet Archive… {done} / {total} MB (quedan unos {mins} min)',
    'shell.fromServer': 'Obteniendo GTA2 del servidor del juego…',
    'shell.connectingArchive': 'Conectando con el Internet Archive…',
    'shell.ready': 'GTA2 está listo.',
    'shell.filesFailed': 'No se pudieron obtener los archivos del juego: {message}. Pulsa Jugar para intentarlo de nuevo.',
    'shell.coopNeedFolder': 'Elige primero tu carpeta de GTA2 una vez en la página de inicio y vuelve al modo cooperativo.',
    'shell.crewReputation': 'Reputación del clan: {list}',
    'shell.crewRepRow': '{name} {delta} (ahora {reputation})',
    'shell.crewRepShort': 'reputación {reputation}, {wins} victorias',
    'shell.newCrew': 'clan nuevo',
    'shell.playWithFriends': 'Jugar con amigos',
    'shell.helpRoam': 'Explorar y causar problemas juntos. El fuego amigo es decisión tuya.',
    'shell.helpWars': 'Clanes contra clanes. Cada clan se alía con una de las bandas del distrito: sus miembros ' +
      'te dejan en paz, las bandas rivales te cazan. Sin fuego amigo dentro del clan. Gana el clan con más puntos.',
    'shell.helpFfa': 'Todos contra todos, el modo clásico de GTA2: gana el primero que llegue al límite de asesinatos.',
    'shell.tagHost': '(anfitrión)',
    'shell.tagYou': '— tú',
    'shell.pickGang': 'Elige una banda…',
    'shell.gangTaken': '{gang} (ocupada)',
    'shell.sidesWith': 'se alía con {gang}',
    'shell.noGang': 'no ha elegido banda',
    'shell.leave': 'Salir',
    'shell.join': 'Unirse',
    'shell.noCrewYet': 'Sin clan todavía: {players}. Únete a un clan arriba o escribe un nombre nuevo.',
    'shell.roomHost': 'Sala {code}: comparte el código. {count} de 6 jugadores. Empieza cuando estén todos.',
    'shell.roomGuest': 'En la sala {code}. Esperando a que el anfitrión empiece.',
    'shell.roomLooking': 'Buscando la sala {code}… Encontrarse a través de los trackers públicos puede tardar un minuto.',
    'shell.enterCode': 'Escribe el código de la sala que te dieron.',
    'shell.connectFailed': 'No se pudo establecer la conexión: {message}',
    'shell.startingMatch': 'Empezando {mode} en {district} con {count} jugadores…',
    'shell.copied': 'Copiado',
    'shell.loadingFromComputer': 'Cargando los archivos del juego de este ordenador…',
    'shell.loadingFromBrowser': 'Cargando los archivos del juego de este navegador…',
    'shell.savedInfo': 'Tus archivos de GTA2 están guardados en este navegador ({mb} MB).',
    'shell.filesForgotten': 'Archivos de juego eliminados de este navegador.',
  },
  fr: {
    'shell.crash': 'Le jeu s\'est arrêté à cause d\'une erreur : {message}',
    'shell.loginExpired': 'votre session a expiré. Rouvrez le lien d\'invitation ou saisissez le mot de passe',
    'shell.serverStatus': 'le serveur a répondu {status}',
    'shell.serverUnreachable': 'impossible de joindre le serveur du jeu. Vérifiez votre connexion et rechargez',
    'shell.downloadInterrupted': 'le téléchargement a été interrompu. Vérifiez votre connexion et rechargez la page',
    'shell.serverSendFailed': 'le serveur n\'a pas pu envoyer {file} (erreur {status})',
    'shell.readyProgress': 'Préparation de GTA2… {done} sur {total} Mo',
    'shell.loadingFiles': 'Chargement des fichiers du jeu… {done}/{total}',
    'shell.notAnInstall': 'Ce dossier n\'est pas une installation de GTA2. Il manque : {missing}. ' +
      'Choisissez le dossier qui contient le dossier "data".',
    'shell.preparing': 'Préparation des fichiers du jeu… {done}/{total}',
    'shell.viewNormal': 'Normal',
    'shell.viewFar': 'Loin',
    'shell.viewFarther': 'Plus loin',
    'shell.viewFarthest': 'Le plus loin',
    'shell.cameraModern': 'Caméra : Moderne',
    'shell.cameraClassic': 'Caméra : Classique',
    'shell.viewLabel': 'Vue : {view}',
    'shell.viewTitle': 'Combien de ville vous voyez (touches − / =)',
    'shell.viewTitleDisabled': 'La distance de vue demande la caméra moderne',
    'shell.mapDuringPlay': 'La carte s\'ouvre pendant la partie.',
    'shell.minimap': 'Minicarte',
    'shell.minimapOff': 'Minicarte désactivée',
    'shell.fps': '{fps} fps',
    'shell.fpsWait': '… fps',
    'shell.fullscreenUnavailable': 'Le plein écran n\'est pas disponible ici ({message}).',
    'shell.fullscreen': 'Plein écran',
    'shell.exitFullscreen': 'Quitter le plein écran',
    'shell.controllerConnected': 'Manette connectée',
    'shell.controllerUnsupported': 'Cette manette n\'est pas prise en charge par le navigateur',
    'shell.mute': 'Couper le son',
    'shell.unmute': 'Rétablir le son',
    'shell.radioOn': 'Radio allumée',
    'shell.radioOff': 'Radio éteinte (R pour la rallumer)',
    'shell.imported': '{saves} sauvegarde(s) de jeu, {states} sauvegarde(s) de l\'écran Sauvegardes et la progression ' +
      'de la carte pour {districts} district(s) importés. Rechargez la page pour les utiliser.',
    'shell.caching': 'Sauvegarde de vos fichiers de jeu dans ce navigateur, pour qu\'il suffise d\'appuyer sur Jouer ' +
      'la prochaine fois…',
    'shell.cached': 'Fichiers de jeu sauvegardés dans ce navigateur ({mb} Mo). La prochaine fois, appuyez sur Jouer.',
    'shell.cacheFailed': 'Impossible de garder les fichiers de jeu dans ce navigateur ({message}); ' +
      'il faudra choisir le dossier à nouveau la prochaine fois.',
    'shell.playerN': 'Joueur {n}',
    'shell.defaultName': 'Joueur',
    'shell.gangWarWon': '{crew} remporte la Guerre de gangs !',
    'shell.desync': 'Les parties se sont désynchronisées (tic {tick}, avec {player}) : ce que vous voyez peut ne plus ' +
      'correspondre. Lancez une nouvelle partie pour corriger ça.',
    'shell.waitingFor': 'En attente de {players}…',
    'shell.you': '{name} (vous)',
    'shell.warsTied': 'Guerre de gangs : égalité',
    'shell.warsLead': 'Guerre de gangs : {crew} mène avec {points}',
    'shell.warsWon': 'Guerre de gangs : {crew} a gagné avec {points}',
    'shell.warsDraw': 'Guerre de gangs : match nul',
    'shell.colCrewPlayer': 'Équipe / joueur',
    'shell.colPlayer': 'Joueur',
    'shell.colKills': 'Meurtres',
    'shell.colDeaths': 'Morts',
    'shell.colPoints': 'Points',
    'shell.ffaLeadOne': 'Chacun pour soi : {name} mène avec 1 meurtre',
    'shell.ffaLeadMany': 'Chacun pour soi : {name} mène avec {kills} meurtres',
    'shell.ffaWonOne': 'Chacun pour soi : {name} a gagné avec 1 meurtre',
    'shell.ffaWonMany': 'Chacun pour soi : {name} a gagné avec {kills} meurtres',
    'shell.roamTitle': 'Balade libre',
    'shell.coopTitle': 'Coopératif',
    'shell.starting': 'Démarrage…',
    'shell.gameMessage': '{caption} : {text}',
    'shell.gameExited': 'Le jeu s\'est terminé (code {code}). Rechargez la page pour rejouer.',
    'shell.matchEnded': 'La partie est terminée. Retour au salon…',
    'shell.waitingLoad': 'En attente du chargement de tout le monde…',
    'shell.couldNotStart': 'Impossible de démarrer (code {code}).',
    'shell.savesTitle': 'Sauvegarder (20 % de votre argent, au moins 10 000 $) ou charger ({key} ou F5)',
    'shell.readingInstaller': 'Lecture de l\'installateur…',
    'shell.checkingInstaller': 'Vérification de l\'installateur…',
    'shell.unpacking': 'Décompression de GTA2 dans ce navigateur…',
    'shell.checkingDownload': 'Vérification du téléchargement…',
    'shell.downloading': 'Téléchargement de GTA2 depuis l\'Internet Archive… {done} / {total} Mo',
    'shell.downloadingSecs': 'Téléchargement de GTA2 depuis l\'Internet Archive… {done} / {total} Mo ' +
      '(environ {secs} s restantes)',
    'shell.downloadingMins': 'Téléchargement de GTA2 depuis l\'Internet Archive… {done} / {total} Mo ' +
      '(environ {mins} min restantes)',
    'shell.fromServer': 'Récupération de GTA2 depuis le serveur du jeu…',
    'shell.connectingArchive': 'Connexion à l\'Internet Archive…',
    'shell.ready': 'GTA2 est prêt.',
    'shell.filesFailed': 'Impossible d\'obtenir les fichiers du jeu : {message}. Appuyez sur Jouer pour réessayer.',
    'shell.coopNeedFolder': 'Choisissez d\'abord votre dossier GTA2 sur la page d\'accueil, puis revenez en coopératif.',
    'shell.crewReputation': 'Réputation de l\'équipe : {list}',
    'shell.crewRepRow': '{name} {delta} (maintenant {reputation})',
    'shell.crewRepShort': 'réputation {reputation}, {wins} victoires',
    'shell.newCrew': 'nouvelle équipe',
    'shell.playWithFriends': 'Jouer avec des amis',
    'shell.helpRoam': 'Explorez et semez le trouble ensemble. Le tir ami, c\'est vous qui choisissez.',
    'shell.helpWars': 'Équipes contre équipes. Chaque équipe s\'allie à l\'un des gangs du district : ses membres ' +
      'vous laissent tranquille, les gangs rivaux vous chassent. Pas de tir ami dans une équipe. L\'équipe avec le ' +
      'plus de points gagne.',
    'shell.helpFfa': 'Tout le monde contre tout le monde, le mode frag de GTA2 : le premier à atteindre la limite ' +
      'de meurtres gagne.',
    'shell.tagHost': '(hôte)',
    'shell.tagYou': '— vous',
    'shell.pickGang': 'Choisir un gang…',
    'shell.gangTaken': '{gang} (prise)',
    'shell.sidesWith': 's\'allie à {gang}',
    'shell.noGang': 'n\'a pas choisi de gang',
    'shell.leave': 'Quitter',
    'shell.join': 'Rejoindre',
    'shell.noCrewYet': 'Pas encore d\'équipe : {players}. Rejoignez une équipe ci-dessus ou saisissez un nouveau nom.',
    'shell.roomHost': 'Salle {code} : partagez le code. {count} joueurs sur 6. Démarrez quand tout le monde est là.',
    'shell.roomGuest': 'Dans la salle {code}. En attente du démarrage par l\'hôte.',
    'shell.roomLooking': 'Recherche de la salle {code}… Se trouver via les trackers publics peut prendre une minute.',
    'shell.enterCode': 'Saisissez le code de la salle qu\'on vous a donné.',
    'shell.connectFailed': 'Impossible d\'établir la connexion : {message}',
    'shell.startingMatch': 'Démarrage de {mode} dans {district} avec {count} joueurs…',
    'shell.copied': 'Copié',
    'shell.loadingFromComputer': 'Chargement des fichiers du jeu depuis cet ordinateur…',
    'shell.loadingFromBrowser': 'Chargement des fichiers du jeu depuis ce navigateur…',
    'shell.savedInfo': 'Vos fichiers GTA2 sont sauvegardés dans ce navigateur ({mb} Mo).',
    'shell.filesForgotten': 'Fichiers de jeu supprimés de ce navigateur.',
  },
});

// Stateful tool labels (Camera: Classic, Minimap off, …) carry no data-i18n: the
// shell re-renders them on a language change instead (applyDom would reset them).
const langRerenders = [];
onLangChange(() => { for (const fn of langRerenders) fn(); });

/** Language button in the tools bar: cycles English -> Español -> Français. */
function wireLangButton() {
  const button = $('lang-toggle');
  const update = () => { button.textContent = t(`ui.opt.lang.${currentLang()}`); };
  button.addEventListener('click', () => {
    setLang(LANGS[(LANGS.indexOf(currentLang()) + 1) % LANGS.length]);
    const screen = $('screen');
    if (screen) screen.focus();
  });
  langRerenders.push(update);
  update();
}

const GAME_DIR = '/gta2';
// Minimum set for the first district; a full profile check is T07's job.
const REQUIRED = ['data/bil.gmp', 'data/bil.sty', 'data/bil.scr', 'data/fstyle.sty', 'data/e.gxt'];
// Bump when saved settings from older builds must not be reused.
const SETTINGS_KEY = 'gta2-port-registry-v3';
const REG_ROOT = 'hklm\\software\\dma design ltd\\gta2';

// Browser-port default controls (DirectInput scan codes), in the game's slot
// order. The original's defaults were arrows / LCtrl / Return / Space / Z / X /
// Tab / LAlt / RShift; Ctrl and Alt clash with macOS and browser shortcuts.
// Players can change any of these on the Controls screen (Options in the game's menu, or the
// toolbar's Controls button; web/controls.js).
const PORT_CONTROLS = [
  0x11, // 0 forward: W
  0x1f, // 1 back: S
  0x1e, // 2 left: A
  0x20, // 3 right: D
  0x26, // 4 attack: L
  0x1c, // 5 enter/exit vehicle: Enter
  0x39, // 6 jump / handbrake: Space
  0x24, // 7 previous weapon: J
  0x25, // 8 next weapon: K
  0x17, // 9 special 1: I
  0x18, // 10 special 2: O
  0x19, // 11 status: P
];

// KeyboardEvent.code -> [DirectInput scan code, Win32 virtual key]
const KEYS = {
  Escape: [0x01, 0x1b], Digit1: [0x02, 0x31], Digit2: [0x03, 0x32], Digit3: [0x04, 0x33], Digit4: [0x05, 0x34],
  Digit5: [0x06, 0x35], Digit6: [0x07, 0x36], Digit7: [0x08, 0x37], Digit8: [0x09, 0x38], Digit9: [0x0a, 0x39],
  Digit0: [0x0b, 0x30], Minus: [0x0c, 0xbd], Equal: [0x0d, 0xbb], Backspace: [0x0e, 0x08], Tab: [0x0f, 0x09],
  KeyQ: [0x10, 0x51], KeyW: [0x11, 0x57], KeyE: [0x12, 0x45], KeyR: [0x13, 0x52], KeyT: [0x14, 0x54],
  KeyY: [0x15, 0x59], KeyU: [0x16, 0x55], KeyI: [0x17, 0x49], KeyO: [0x18, 0x4f], KeyP: [0x19, 0x50],
  BracketLeft: [0x1a, 0xdb], BracketRight: [0x1b, 0xdd], Enter: [0x1c, 0x0d], ControlLeft: [0x1d, 0x11],
  KeyA: [0x1e, 0x41], KeyS: [0x1f, 0x53], KeyD: [0x20, 0x44], KeyF: [0x21, 0x46], KeyG: [0x22, 0x47],
  KeyH: [0x23, 0x48], KeyJ: [0x24, 0x4a], KeyK: [0x25, 0x4b], KeyL: [0x26, 0x4c], Semicolon: [0x27, 0xba],
  Quote: [0x28, 0xde], Backquote: [0x29, 0xc0], ShiftLeft: [0x2a, 0x10], Backslash: [0x2b, 0xdc],
  KeyZ: [0x2c, 0x5a], KeyX: [0x2d, 0x58], KeyC: [0x2e, 0x43], KeyV: [0x2f, 0x56], KeyB: [0x30, 0x42],
  KeyN: [0x31, 0x4e], KeyM: [0x32, 0x4d], Comma: [0x33, 0xbc], Period: [0x34, 0xbe], Slash: [0x35, 0xbf],
  ShiftRight: [0x36, 0x10], NumpadMultiply: [0x37, 0x6a], AltLeft: [0x38, 0x12], Space: [0x39, 0x20],
  CapsLock: [0x3a, 0x14], F1: [0x3b, 0x70], F2: [0x3c, 0x71], F3: [0x3d, 0x72], F4: [0x3e, 0x73],
  F5: [0x3f, 0x74], F6: [0x40, 0x75], F7: [0x41, 0x76], F8: [0x42, 0x77], F9: [0x43, 0x78], F10: [0x44, 0x79],
  NumLock: [0x45, 0x90], ScrollLock: [0x46, 0x91], Numpad7: [0x47, 0x67], Numpad8: [0x48, 0x68],
  Numpad9: [0x49, 0x69], NumpadSubtract: [0x4a, 0x6d], Numpad4: [0x4b, 0x64], Numpad5: [0x4c, 0x65],
  Numpad6: [0x4d, 0x66], NumpadAdd: [0x4e, 0x6b], Numpad1: [0x4f, 0x61], Numpad2: [0x50, 0x62],
  Numpad3: [0x51, 0x63], Numpad0: [0x52, 0x60], NumpadDecimal: [0x53, 0x6e], F11: [0x57, 0x7a],
  F12: [0x58, 0x7b], NumpadEnter: [0x9c, 0x0d], ControlRight: [0x9d, 0x11], NumpadDivide: [0xb5, 0x6f],
  AltRight: [0xb8, 0x12], Home: [0xc7, 0x24], ArrowUp: [0xc8, 0x26], PageUp: [0xc9, 0x21],
  ArrowLeft: [0xcb, 0x25], ArrowRight: [0xcd, 0x27], End: [0xcf, 0x23], ArrowDown: [0xd0, 0x28],
  PageDown: [0xd1, 0x22], Insert: [0xd2, 0x2d], Delete: [0xd3, 0x2e],
};

const $ = (id) => document.getElementById(id);

// Uncaught errors from the core are kept (window.gta2Errors) and shown, so a
// crash is visible instead of a frozen frame.
window.gta2Errors = [];
window.gta2Log = [];
function logLine(t) {
  window.gta2Log.push(t);
  if (window.gta2Log.length > 300) window.gta2Log.shift();
}
function recordError(err) {
  const text = (err && (err.stack || err.message)) || String(err);
  window.gta2Errors.push(text);
  setStatus(t('shell.crash', { message: String(err && err.message || err).slice(0, 160) }), true);
}
window.addEventListener('error', (e) => recordError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => recordError(e.reason));

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

/** @returns {Map<string, File|Blob>} game files keyed by lowercased relative path. */
function collectPickedFiles(fileList) {
  const files = new Map();
  for (const file of fileList) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    // Drop the picked folder's own name; accept picking the folder that holds data/.
    const rel = parts.slice(1).join('/').toLowerCase();
    // The port never needs the original executables or DLLs.
    if (rel && !/\.(exe|dll|m3d|ico)$/.test(rel)) files.set(rel, file);
  }
  return files;
}

/**
 * The game files served at gamedata/: the local dev server's list of paths, or
 * our game server's {version, files: [[path, bytes]]} (D21), with progress in MB.
 */
async function collectDevFiles(onProgress = (text) => setStatus(text)) {
  let manifest;
  try {
    const res = await fetch('gamedata/manifest.json', { cache: 'no-store' });
    if (res.redirected && new URL(res.url).pathname === '/login') {
      throw new Error(t('shell.loginExpired'));
    }
    manifest = await res.json().catch(() => ({}));
    if (!res.ok || manifest.error) throw new Error(manifest.error || t('shell.serverStatus', { status: res.status }));
  } catch (err) {
    throw new Error(err instanceof TypeError ? t('shell.serverUnreachable')
      : err.message);
  }
  const list = Array.isArray(manifest) ? manifest.map((rel) => [rel, 0]) : manifest.files;
  const total = list.reduce((sum, [, size]) => sum + size, 0);
  const files = new Map();
  let done = 0;
  let bytes = 0;
  const mb = (n) => Math.round(n / 1048576);
  // a few at a time, so the progress moves steadily and big files are not all fetched at once
  const queue = [...list];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [rel, size] = item;
      let res;
      try {
        res = await fetch(`gamedata/${rel.split('/').map(encodeURIComponent).join('/')}`);
      } catch {
        throw new Error(t('shell.downloadInterrupted'));
      }
      if (!res.ok) throw new Error(t('shell.serverSendFailed', { file: rel, status: res.status }));
      files.set(rel.toLowerCase(), await res.blob());
      done++;
      bytes += size;
      onProgress(total ? t('shell.readyProgress', { done: mb(bytes), total: mb(total) })
        : t('shell.loadingFiles', { done, total: list.length }), total ? bytes / total : done / list.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return files;
}

function validate(files) {
  const missing = REQUIRED.filter((p) => !files.has(p));
  if (missing.length) {
    throw new Error(t('shell.notAnInstall', { missing: missing.join(', ') }));
  }
}

async function writeFiles(Module, files) {
  const FS = Module.FS;
  FS.mkdirTree(`${GAME_DIR}/player`);
  let done = 0;
  for (const [rel, blob] of files) {
    const path = `${GAME_DIR}/${rel}`;
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    FS.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    if (++done % 25 === 0) setStatus(t('shell.preparing', { done, total: files.size }));
  }
}

/**
 * Width of gameplay frames in reference pixels (the height is always 480).
 * Default 16:9. ?aspect=W:H picks another shape (?aspect=4:3 is the original
 * view); ?aspect=auto follows the window (wireViewWidth). The core clamps it
 * to 640..1280.
 */
/** A saved option (landing page Options), unless the URL sets it for this visit. */
function option(param, key, fallback) {
  const fromUrl = new URLSearchParams(location.search).get(param);
  if (fromUrl !== null) return fromUrl;
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
const ASPECT = option('aspect', 'gta2-port-aspect', '16:9');
function chooseViewWidth(canvas) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ASPECT);
  const rect = canvas.getBoundingClientRect();
  const aspect = m ? Number(m[1]) / Number(m[2]) : rect.width / Math.max(1, rect.height);
  return Math.round(480 * aspect);
}

/** Keeps the gameplay view as wide as the canvas (window resize, full screen). */
function wireViewWidth(Module, canvas) {
  if (ASPECT !== 'auto') return;
  let timer = 0;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      Module.ccall('gta2_port_set_view_width', 'number', ['number'], [chooseViewWidth(canvas)]);
    }, 150);
  }).observe(canvas);
}

const CAMERA_KEY = 'gta2-port-camera';

/** Camera: Modern / Classic button. ?camera=classic|modern sets it for this visit. */
const VIEW_KEY = 'gta2-port-view-distance';
const VIEW_KEYS = ['shell.viewNormal', 'shell.viewFar', 'shell.viewFarther', 'shell.viewFarthest'];

/**
 * Camera: Modern / Classic button, and the view distance (Modern camera only):
 * how far above the original height the camera sits, in blocks (0, 1.5, 3, 4).
 * More of the city is drawn; the activation margin keeps spawning off screen.
 * ?camera=classic|modern and ?heightbias=N set them for this visit.
 */
function wireCameraButton(Module) {
  const button = $('camera');
  const viewButton = $('view-distance');
  const params = new URLSearchParams(location.search);
  const HEIGHTS = [0, 1.5, 3, 4];
  let view = 0;
  try { view = Math.max(0, Math.min(3, Number(localStorage.getItem(VIEW_KEY)) || 0)); } catch { /* storage unavailable */ }
  let bias = HEIGHTS[view];
  if (params.has('heightbias')) bias = Number(params.get('heightbias')) || 0;
  let mode = params.get('camera');
  if (mode !== 'classic' && mode !== 'modern') {
    try { mode = localStorage.getItem(CAMERA_KEY); } catch { /* storage unavailable */ }
  }
  let modern = mode !== 'classic';
  const apply = () => {
    Module.ccall('gta2_port_set_camera', null, ['number', 'number'], [modern ? 1 : 0, bias]);
    button.textContent = modern ? t('shell.cameraModern') : t('shell.cameraClassic');
    viewButton.textContent = t('shell.viewLabel', { view: t(VIEW_KEYS[view]) });
    viewButton.disabled = !modern;
    viewButton.title = modern ? t('shell.viewTitle') : t('shell.viewTitleDisabled');
  };
  const setView = (v) => {
    view = Math.max(0, Math.min(3, v));
    bias = HEIGHTS[view];
    try { localStorage.setItem(VIEW_KEY, String(view)); } catch { /* storage unavailable */ }
    apply();
  };
  viewButton.addEventListener('click', () => { setView((view + 1) % 4); $('screen').focus(); });
  // − and = while playing (unused by the game): view distance out / in.
  viewKeys.handle = (e, down) => {
    if (e.code !== 'Minus' && e.code !== 'Equal') return false;
    if (down && !e.repeat && modern) {
      setView(view + (e.code === 'Minus' ? 1 : -1));
      setStatus(t('shell.viewLabel', { view: t(VIEW_KEYS[view]) }));
      clearTimeout(viewKeys.timer);
      viewKeys.timer = setTimeout(() => setStatus(''), 1200);
    }
    return true;
  };
  button.addEventListener('click', () => {
    modern = !modern;
    try { localStorage.setItem(CAMERA_KEY, modern ? 'modern' : 'classic'); } catch { /* storage unavailable */ }
    apply();
    $('screen').focus();
  });
  langRerenders.push(apply);
  apply();
}

function wireMapButtons(map) {
  $('map-open').addEventListener('click', () => {
    if (!map.open && !map.show()) setStatus(t('shell.mapDuringPlay'));
    else if (map.open) map.close();
  });
  const mini = $('minimap-toggle');
  const apply = () => {
    mini.setAttribute('aria-pressed', String(map.minimapOn));
    mini.textContent = map.minimapOn ? t('shell.minimap') : t('shell.minimapOff');
  };
  mini.addEventListener('click', () => { map.setMinimap(!map.minimapOn); apply(); $('screen').focus(); });
  langRerenders.push(apply);
  apply();
}

const FPS_KEY = 'gta2-port-show-fps';

/** Frame-rate readout (frames presented per second, as the game draws them). */
function wireFpsButton(renderer) {
  const button = $('fps-toggle');
  const out = $('fps');
  let shown = false;
  try { shown = localStorage.getItem(FPS_KEY) === '1'; } catch { /* storage unavailable */ }
  let timer = 0;
  let last = { t: performance.now(), frames: renderer.stats.frames };
  const sample = () => {
    const now = performance.now();
    const frames = renderer.stats.frames;
    const fps = ((frames - last.frames) * 1000) / Math.max(1, now - last.t);
    last = { t: now, frames };
    out.textContent = t('shell.fps', { fps: fps.toFixed(0) });
  };
  const apply = () => {
    out.hidden = !shown;
    button.setAttribute('aria-pressed', String(shown));
    clearInterval(timer);
    if (shown) {
      last = { t: performance.now(), frames: renderer.stats.frames };
      out.textContent = t('shell.fpsWait');
      timer = setInterval(sample, 500);
    }
  };
  button.addEventListener('click', () => {
    shown = !shown;
    try { localStorage.setItem(FPS_KEY, shown ? '1' : '0'); } catch { /* storage unavailable */ }
    apply();
    $('screen').focus();
  });
  apply();
}

/** Full screen for the whole page (the game view and the tools bar). */
function wireFullscreenButton() {
  const button = $('fullscreen');
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) { button.hidden = true; return; }
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  button.addEventListener('click', async () => {
    try {
      if (isFull()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        await request.call(root);
        // Chromium: keep Esc for the game's menu (hold Esc to leave full screen).
        if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {});
      }
    } catch (err) {
      setStatus(t('shell.fullscreenUnavailable', { message: err.message || err }), true);
    }
    $('screen').focus();
  });
  const update = () => { button.textContent = isFull() ? t('shell.exitFullscreen') : t('shell.fullscreen'); };
  document.addEventListener('fullscreenchange', update);
  document.addEventListener('webkitfullscreenchange', update);
  langRerenders.push(update);
  update();
}

function seedRegistry(Module) {
  const setDword = Module.cwrap('gta2_port_reg_set_dword', null, ['string', 'string', 'number']);
  const setString = Module.cwrap('gta2_port_reg_set_string', null, ['string', 'string', 'string']);
  // Defaults for the browser: windowed 640x480 reference, no intro movie (Bink
  // playback is not wired up yet), sound path enabled (silent for now).
  setDword(`${REG_ROOT}\\screen`, 'start_mode', 0);
  PORT_CONTROLS.forEach((scan, slot) => setDword(`${REG_ROOT}\\control`, String(slot), scan));
  // The 10.5 code is the freeloader.com edition, which unlocked districts via
  // this value (0-based; 2 = all three). The 9.6F release ships all three.
  setDword('hklm\\software\\freeloader.com\\gta2', 'cityinstalled', 2);
  // Developer switch (?skiptrains=1) while the standalone train crash is fixed.
  setDword(`${REG_ROOT}\\debug`, 'skip_trains', new URLSearchParams(location.search).has('skiptrains') ? 1 : 0);
  setDword(`${REG_ROOT}\\screen`, 'do_play_movie', 0);
  try {
    // Developer option (?fresh=1): ignore saved settings.
    const saved = new URLSearchParams(location.search).has('fresh') ? '' : localStorage.getItem(SETTINGS_KEY);
    for (const line of (saved || '').split('\n')) {
      const [path, name, type, ...rest] = line.split('|');
      if (!path || !name) continue;
      if (type === 'd') setDword(path, name, Number(rest.join('|')) >>> 0);
      else if (type === 's') setString(path, name, rest.join('|'));
    }
  } catch { /* storage unavailable: defaults only */ }
  // Never persisted: the movie stays off until video playback exists.
  setDword(`${REG_ROOT}\\screen`, 'do_play_movie', 0);
  // The web language is the single source of truth (the in-game Options screen
  // is not involved): written after the saved settings so it always wins. The
  // engine reads the first char of this string (text_0x14.cpp constructor).
  setString(`${REG_ROOT}\\option`, 'language', gxtLetterFor(currentLang()));
}

function saveRegistry(Module) {
  try {
    localStorage.setItem(SETTINGS_KEY, Module.ccall('gta2_port_reg_export', 'string', [], []));
  } catch { /* storage unavailable */ }
}

// Shell features that take keys before the game does (the map screen, view distance).
const keyHooks = { filter: null };
const viewKeys = { handle: null, timer: 0 };

/** Wires the keyboard; returns the key handler so other inputs (the gamepad) can press keys. */
function wireInput(Module, canvas) {
  const key = Module.cwrap('gta2_port_key', null, ['number', 'number', 'number', 'number']);
  const releaseAll = Module.cwrap('gta2_port_release_all_keys', null, []);
  const handleKey = (e, down) => {
    if (keyHooks.filter && keyHooks.filter(e, down)) {
      e.preventDefault();
      return;
    }
    const map = KEYS[e.code];
    if (!map) return;
    e.preventDefault();
    if (down && e.repeat) return;
    const ch = down && e.key.length === 1 ? e.key.charCodeAt(0) : 0;
    key(map[0], map[1], down ? 1 : 0, ch);
  };
  window.addEventListener('keydown', (e) => handleKey(e, true));
  window.addEventListener('keyup', (e) => handleKey(e, false));
  window.addEventListener('blur', () => releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return handleKey;
}

/** A key press from the gamepad, shaped like the KeyboardEvent the key hooks read. */
function syntheticKey(code) {
  return { code, key: '', repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} };
}

// remap: the controller presses the default keys; this gives the key the player bound instead.
function wireGamepad(handleKey, isPlaying, remap = (code) => code) {
  const held = new Map(); // a button's key when pressed, so its release lets go of the same key
  const send = (code, down) => {
    let key = held.get(code);
    if (down || key === undefined) key = isPlaying() ? remap(code) : code;
    if (down) held.set(code, key); else held.delete(code);
    handleKey(syntheticKey(key), down);
  };
  const gamepad = new GamepadInput({
    send,
    isPlaying,
    onConnect: (pad) => toast(pad.mapping === 'standard' ? t('shell.controllerConnected') : t('shell.controllerUnsupported'), pad.mapping !== 'standard'),
  });
  gamepad.start();
  return gamepad;
}

// Developer helpers (window.gta2.dev) for automated tests in ?devdata mode.
function installDevHelpers(Module) {
  const key = Module.cwrap('gta2_port_key', null, ['number', 'number', 'number', 'number']);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.gta2.dev = {
    state() {
      const p = Module.ccall('gta2_dev_state', 'number', [], []);
      const v = Array.from(new Int32Array(Module.HEAPU8.buffer, p, 10));
      const fx = (n) => Math.round((n / 16384) * 100) / 100;
      return { player: !!v[0], inCar: !!v[1], x: fx(v[2]), y: fx(v[3]), z: fx(v[4]), speed: fx(v[5]), carModel: v[6], rot: v[7], weapon: v[8], ammo: v[9] };
    },
    spawnCar(model = 10, dx = 1, dy = 0, rot = 0) {
      return Module.ccall('gta2_dev_spawn_car', 'number', ['number', 'number', 'number', 'number'], [model, dx, dy, rot]);
    },
    giveWeapon(kind = 0, ammo = 100) {
      return Module.ccall('gta2_dev_give_weapon', 'number', ['number', 'number'], [kind, ammo]);
    },
    camera() {
      const p = Module.ccall('gta2_dev_camera', 'number', [], []);
      const v = Array.from(Module.HEAP32.subarray(p >> 2, (p >> 2) + 11));
      const f = (x) => Math.round((x / 16384) * 100) / 100;
      return { x: f(v[0]), y: f(v[1]), z: f(v[2]), zoom: f(v[3]), left: f(v[4]), right: f(v[5]),
        top: f(v[6]), bottom: f(v[7]), width: v[8], height: v[9], drawnZ: f(v[10]) };
    },
    teleport(x, y) {
      return Module.ccall('gta2_dev_teleport', 'number', ['number', 'number'], [x, y]);
    },
    findRoad() {
      const p = Module.ccall('gta2_dev_find_road', 'number', [], []);
      const [x, y, z, length, alongY] = Array.from(Module.HEAP32.subarray(p >> 2, (p >> 2) + 5));
      return { x, y, z, length, alongY: !!alongY };
    },
    addCash(n) {
      return Module.ccall('gta2_dev_add_cash', 'number', ['number'], [n]);
    },
    files(dir = 'player') {
      try { return Module.FS.readdir(`${GAME_DIR}/${dir}`).filter((f) => f[0] !== '.'); } catch { return []; }
    },
    async hold(code, ms) {
      const [sc, vk] = KEYS[code];
      key(sc, vk, 1, 0);
      await sleep(ms);
      key(sc, vk, 0, 0);
    },
    sleep,
  };
}

const MUTE_KEY = 'gta2-port-muted';

function wireAudioButton(audio) {
  const button = $('mute');
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage unavailable */ }
  const apply = () => {
    audio.setMuted(muted);
    button.textContent = muted ? t('shell.unmute') : t('shell.mute');
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  button.addEventListener('click', () => { muted = !muted; apply(); });
  langRerenders.push(apply);
  apply();
}

const RADIO_KEY = 'gta2-port-radio';

/**
 * Radio keys: R turns the car radio on or off (kept in this browser); T is the game's own
 * F1, the next station (single player; in co-op T opens the chat). Returns the key filter.
 * inCar: whether the player is in a car. On foot the same station files play from places in the
 * city, so R leaves them alone there.
 */
function wireRadioKeys(Module, audio, coop, inCar) {
  const key = Module.cwrap('gta2_port_key', null, ['number', 'number', 'number', 'number']);
  let on = true;
  try { on = localStorage.getItem(RADIO_KEY) !== '0'; } catch { /* storage unavailable */ }
  audio.setRadio(on);
  setInterval(() => audio.setInCar(inCar()), 200);
  return (e, down) => {
    const mod = e.metaKey || e.ctrlKey || e.altKey;
    if (e.code === 'KeyR' && !mod) {
      if (down && !e.repeat && !inCar()) toast('The radio is in cars: get in one, then press R');
      else if (down && !e.repeat) {
        on = !on;
        audio.setRadio(on);
        try { localStorage.setItem(RADIO_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
        toast(on ? t('shell.radioOn') : t('shell.radioOff'));
      }
      return true;
    }
    if (e.code === 'KeyT' && !mod && !coop) {
      if (!e.repeat) key(KEYS.F1[0], KEYS.F1[1], down ? 1 : 0, 0); // the game changes station on F1
      return true;
    }
    return false;
  };
}

function wireSaveButtons(storage) {
  $('tools').hidden = false;
  $('export-saves').addEventListener('click', async () => {
    storage.flush();
    if (window.gta2 && window.gta2.map) window.gta2.map.saveSeen(); // the latest discovery
    // the game's own saves, the Saves screen's saves and the map's discovery, in one file
    const blob = await storage.exportAll({ states: await exportSaves(), map: exportDiscovery() });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gta2-saves-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('import-saves').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const n = await storage.importAll(parsed);
      const states = await importSaves(parsed.states);
      const districts = importDiscovery(parsed.map);
      setStatus(t('shell.imported', { saves: n, states, districts }));
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

const fileCache = new GameFileCache();

/** After a successful start from a picked folder: keep the files for next time. */
async function cachePickedFiles(files) {
  try {
    setStatus(t('shell.caching'));
    const bytes = await fileCache.save(files);
    setStatus(t('shell.cached', { mb: Math.round(bytes / 1048576) }));
  } catch (err) {
    setStatus(t('shell.cacheFailed', { message: err.message || err }), true);
  }
  setTimeout(() => setStatus(''), 6000);
}

/**
 * Co-op (D20): sets up the core's network session and the original multiplayer
 * map for the district, and connects the core to the lobby's transport.
 */
function setupCoop(Module, coop) {
  const { lobby, district, players, mySlot, delay, friendlyFire, mode = 'roam', crews = [] } = coop;
  const d = DISTRICTS[district];
  Module.ccall('gta2_port_net_configure', null, ['number', 'number', 'number'], [players.length, mySlot, delay]);
  // the mode's rules: free-for-all is the original frag game; Gang Wars and free roam a points game
  // (Gang Wars scored per crew by the shell); friendly fire everywhere in free-for-all, by crew in Gang Wars
  Module.ccall('gta2_port_set_friendly_fire', null, ['number'], [mode === 'ffa' || (mode === 'roam' && friendlyFire) ? 1 : 0]);
  Module.ccall('gta2_port_net_set_rules', null, ['number', 'number', 'number'],
    [mode === 'ffa' ? 1 : 2, mode === 'ffa' ? coop.killLimit || 0 : 0, mode === 'roam' ? 0 : coop.minutes || 0]);
  // riding together: anyone in free roam, your crew in Gang Wars, nobody in free-for-all
  Module.ccall('gta2_port_set_ride_together', null, ['number'], [mode === 'roam' ? 1 : mode === 'wars' ? 2 : 0]);
  players.forEach((p, i) => {
    const crew = mode === 'wars' ? crews.findIndex((c) => c.members.includes(p.id)) : -1;
    Module.ccall('gta2_port_set_player_team', null, ['number', 'number', 'string'], [i, crew, crew >= 0 ? crews[crew].side : '']);
  });
  Module.ccall('gta2_port_net_set_map', null, ['string', 'string', 'string'], [d.gmp, d.sty, d.scr(players.length)]);
  players.forEach((p, i) => Module.ccall('gta2_port_net_set_name', null, ['number', 'string'], [i, p.name.replace(/[^\x20-\x7e]/g, '?')]));
  // Every player must simulate identically: the presentation-only activation margin (D07/D17)
  // depends on each player's window and camera, so it is off in co-op.
  Module.ccall('gta2_port_set_activation_margin', null, ['number'], [0]);
  const receive = Module.cwrap('gta2_port_net_receive', null, ['number', 'number', 'number']);
  Module.gta2Net = { send: (to, bytes) => lobby.sendGame(to, bytes) };
  lobby.onGameMessage = (slot, bytes) => {
    const ptr = Module._malloc(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    receive(slot, ptr, bytes.length);
    Module._free(ptr);
  };
  lobby.onPlayerLeft = (slot) => Module.ccall('gta2_port_net_peer_left', null, ['number'], [slot]);
  lobby.gameReady();
  watchCoop(Module, coop);
  // Developer option (?syncdump=N): capture every sprite at game tick N, for desync hunting.
  const dumpAt = new URLSearchParams(location.search).get('syncdump');
  if (dumpAt) Module.ccall('gta2_dev_sync_dump', 'number', ['number'], [Number(dumpAt)]);
  // A hidden tab, or a window covered by another one, gets no animation frames,
  // and in lockstep everyone else would wait for it: whenever frames stop
  // arriving, a worker's timer (not throttled like the page's) keeps it going.
  const ticker = new Worker(URL.createObjectURL(new Blob(
    ['setInterval(()=>postMessage(0),8);'], { type: 'text/javascript' })));
  const slice = Module.cwrap('gta2_port_run_slice', null, []);
  let lastFrame = performance.now();
  const watch = () => { lastFrame = performance.now(); requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  ticker.onmessage = () => { if (performance.now() - lastFrame > 50) slice(); };
}

/**
 * Co-op while the match runs (D20):
 * - a sync check: every 90 ticks (3 s) each player sends a checksum of the
 *   game (ped and car pools, random number state) and compares the others'
 *   with its own for the same tick; a difference means the games have drifted
 *   apart, and everyone is told;
 * - a notice naming the players everyone is waiting for, when the game has
 *   been held up by the network for more than half a second.
 */
function watchCoop(Module, coop) {
  const { lobby, players, mySlot } = coop;
  let won = null;
  const banner = $('coop-banner');
  const name = (slot) => (players[slot] ? players[slot].name : t('shell.playerN', { n: slot + 1 }));
  const history = Module.cwrap('gta2_dev_sync_history', 'number', []);
  const netDebug = Module.cwrap('gta2_port_net_debug', 'number', []);
  const EVERY = 90;
  const mine = new Map();   // tick -> checksum
  const theirs = new Map(); // tick -> [slot, checksum][]
  let desync = null;
  let lastSent = -1;
  const checksumRows = () => {
    const p = history();
    const v = Module.HEAP32.subarray(p >> 2, (p >> 2) + 1024 * 9);
    for (let i = 0; i < 1024; i++) {
      const tick = v[i * 9];
      if (tick > 0 && tick % EVERY === 0 && !mine.has(tick)) {
        mine.set(tick, [1, 3, 4, 5, 6].map((k) => v[i * 9 + k]).join(':'));
      }
    }
  };
  const compare = (tick) => {
    const own = mine.get(tick);
    for (const [slot, h] of theirs.get(tick) || []) {
      if (own && h !== own && !desync) {
        desync = { tick, slot };
        console.warn(`co-op: games drifted apart at tick ${tick} (${name(slot)}: ${h}, here: ${own})`);
      }
    }
  };
  lobby.onSync = (slot, tick, h) => {
    if (!theirs.has(tick)) theirs.set(tick, []);
    theirs.get(tick).push([slot, h]);
    compare(tick);
  };
  let held = { frame: -1, since: 0 };
  setInterval(() => {
    checksumRows();
    for (const tick of [...mine.keys()].filter((t) => t > lastSent).sort((a, b) => a - b)) {
      lobby.shareSync(tick, mine.get(tick));
      lastSent = tick;
      compare(tick);
    }
    for (const t of [...mine.keys()]) if (t < lastSent - EVERY * 20) { mine.delete(t); theirs.delete(t); }
    // who are we waiting for?
    const p = netDebug();
    const v = Module.HEAP32.subarray(p >> 2, (p >> 2) + 10);
    const now = performance.now();
    if (v[4] !== held.frame) held = { frame: v[4], since: now };
    const waiting = v[3] && now - held.since > 500
      ? players.map((_, slot) => slot).filter((slot) => slot !== mySlot && (v[6] & (1 << slot))) : [];
    if (coop.results) coop.results(); // keeps the latest standings for the end-of-match results
    // Gang Wars: a crew reaching the points target wins (time limits and free-for-all end in the game)
    if (!won && coop.mode === 'wars' && coop.pointsTarget > 0 && coop.results) {
      const lead = coop.results().leader;
      if (lead && lead.points >= coop.pointsTarget) {
        won = lead.c.name;
        setTimeout(() => coop.endMatch && coop.endMatch(), 6000);
      }
    }
    let text = '';
    if (won) text = t('shell.gangWarWon', { crew: won });
    else if (desync) text = t('shell.desync', { tick: desync.tick, player: name(desync.slot) });
    else if (waiting.length) text = t('shell.waitingFor', { players: waiting.map(name).join(', ') });
    banner.textContent = text;
    banner.hidden = !text;
    banner.classList.toggle('error', !!desync);
  }, 250);
}

// Co-op player colours by slot (map, radar, names, scoreboard).
const PLAYER_COLOURS = ['#4fc3ff', '#ff6b6b', '#7ee081', '#c792ff', '#ffa94d', '#ff7ad9'];

/**
 * What the map and radar need about the other players in a co-op match:
 * everyone's position and stats (from the local game, which simulates them
 * all) and their shared waypoints (lobby messages, outside the game).
 */
function coopView(Module, { lobby, players, mySlot, mode = 'roam', crews = [] }) {
  const waypoints = new Map(); // slot -> {x, y}
  lobby.onWaypoint = (slot, wp) => { if (wp) waypoints.set(slot, wp); else waypoints.delete(slot); };
  const read = Module.cwrap('gta2_port_coop_players', 'number', []);
  const crewOf = (slot) => (mode === 'wars' ? crews.findIndex((c) => c.members.includes(players[slot].id)) : -1);
  const colour = (slot) => {
    const c = crewOf(slot);
    return c >= 0 ? crews[c].colour : PLAYER_COLOURS[slot % PLAYER_COLOURS.length];
  };
  const myCrew = crewOf(mySlot);
  const view = {
    mySlot,
    mode,
    waypoints,
    colour,
    name: (slot) => (players[slot] ? players[slot].name : t('shell.playerN', { n: slot + 1 })),
    /** Every player in the match: position (blocks), heading, health, stats, crew. */
    players() {
      const p = read();
      const v = Module.HEAP32.subarray(p >> 2, (p >> 2) + 72);
      return players.map((pl, slot) => {
        const o = slot * 12;
        const crew = crewOf(slot);
        return {
          slot, name: pl.name, me: slot === mySlot, colour: colour(slot), crew,
          // free roam: everyone is on your side; Gang Wars: your crew; free-for-all: nobody
          ally: mode === 'roam' || (mode === 'wars' && crew >= 0 && crew === myCrew),
          inGame: !!v[o], onMap: !!v[o + 1], x: v[o + 2] / 16384, y: v[o + 3] / 16384,
          heading: (v[o + 4] / 1440) * Math.PI * 2, inCar: !!v[o + 5], health: v[o + 6],
          kills: v[o + 7], deaths: v[o + 8], score: v[o + 9], busted: v[o + 10], points: v[o + 11],
        };
      });
    },
    /** The scoreboard and the end-of-match results: {title, endTitle, columns, rows: [{cells, colour, strong}]}. */
    standings() {
      const ps = view.players().filter((p) => p.inGame);
      const row = (p) => ({ cells: [p.me ? t('shell.you', { name: p.name }) : p.name, p.kills, p.deaths, money(p.points)], colour: p.colour, strong: p.me });
      if (mode === 'wars') {
        const totals = crews.map((c, i) => {
          const members = ps.filter((p) => p.crew === i);
          return { c, members, kills: members.reduce((n, p) => n + p.kills, 0), points: members.reduce((n, p) => n + p.points, 0) };
        }).sort((a, b) => b.points - a.points || b.kills - a.kills);
        const rows = [];
        for (const team of totals) {
          rows.push({ cells: [`${team.c.name} · ${team.c.gang}`, team.kills, '', money(team.points)], colour: team.c.colour, strong: true });
          for (const p of team.members.sort((a, b) => b.points - a.points)) rows.push({ ...row(p), cells: [`  ${row(p).cells[0]}`, ...row(p).cells.slice(1)], strong: false });
        }
        const lead = totals[0];
        const tied = !lead || totals.filter((x) => x.points === lead.points).length > 1;
        return {
          title: tied ? t('shell.warsTied') : t('shell.warsLead', { crew: lead.c.name, points: money(lead.points) }),
          endTitle: tied ? t('shell.warsDraw') : t('shell.warsWon', { crew: lead.c.name, points: money(lead.points) }),
          columns: [t('shell.colCrewPlayer'), t('shell.colKills'), t('shell.colDeaths'), t('shell.colPoints')], rows, leader: lead,
        };
      }
      const sorted = [...ps].sort(mode === 'ffa' ? (a, b) => b.kills - a.kills || b.points - a.points : (a, b) => b.points - a.points);
      const lead = sorted[0];
      const kills = lead ? lead.kills : 0;
      return {
        title: mode === 'ffa' ? (kills === 1 ? t('shell.ffaLeadOne', { name: lead.name }) : t('shell.ffaLeadMany', { name: lead ? lead.name : '', kills }))
          : t('shell.roamTitle'),
        endTitle: mode === 'ffa' && lead ? (kills === 1 ? t('shell.ffaWonOne', { name: lead.name }) : t('shell.ffaWonMany', { name: lead.name, kills }))
          : t('shell.roamTitle'),
        columns: [t('shell.colPlayer'), t('shell.colKills'), t('shell.colDeaths'), t('shell.colPoints')], rows: sorted.map(row), leader: sorted[0],
      };
    },
    /** Gang Wars result for the server (saved crews): every crew, its members' stats, who won. */
    report() {
      const ps = view.players().filter((p) => p.inGame);
      const sums = crews.map((c, i) => ({ c, members: ps.filter((p) => p.crew === i) }))
        .map((t) => ({ ...t, points: t.members.reduce((n, p) => n + p.points, 0) }));
      const best = Math.max(0, ...sums.map((t) => t.points));
      const leaders = sums.filter((t) => t.points === best).length;
      return sums.map((t) => ({
        name: t.c.name, gang: t.c.gang, won: best > 0 && leaders === 1 && t.points === best, // a tie: nobody wins
        members: t.members.map((p) => ({ name: p.name, kills: p.kills, deaths: p.deaths, points: p.points })),
      }));
    },
    shareWaypoint: (wp) => lobby.shareWaypoint(wp),
  };
  return view;
}

async function start(getFiles, { cacheAfterStart = false, coop = null, loadSlot = null } = {}) {
  const startOptions = { commandLine: coop ? '-N' : '' };
  $('picker').hidden = true;
  setStatus(t('shell.starting'));
  try {
    const canvas = $('screen');
    const renderer = new Gta2Renderer(canvas);
    const audio = new Gta2Audio();
    const storage = new SaveStorage(GAME_DIR, setStatus);
    await storage.open();
    const Module = await createGta2({
      print: (t) => { logLine(t); console.log(t); },
      printErr: (t) => { logLine(t); console.warn(t); },
      gta2Renderer: renderer,
      gta2Storage: storage,
      gta2Audio: audio,
      fastLoop: new URLSearchParams(location.search).has('fastloop'),
      onGameMessage: (caption, text) => setStatus(t('shell.gameMessage', { caption, text }), true),
      onAbort: (what) => recordError(what),
      onGameExit: (code) => {
        if (coop) {
          // back to the same room, as host again or rejoining (wireCoopLobby picks this up)
          try {
            sessionStorage.setItem('gta2-coop-rematch', JSON.stringify({ code: coop.lobby.code, host: coop.lobby.host, settings: coop.lobby.settings }));
            if (coop.results) {
              const r = coop.results();
              r.title = r.endTitle || r.title;
              sessionStorage.setItem('gta2-coop-results', JSON.stringify(r));
            }
          } catch { /* storage unavailable */ }
          setStatus(t('shell.matchEnded'));
          const back = () => { location.href = `${location.pathname}?coop${location.search.includes('local') ? '&local' : ''}#${coop.lobby.code}`; location.reload(); };
          reportMatch(coop).then(back, back);
          return;
        }
        setStatus(t('shell.gameExited', { code }));
      },
    });
    renderer.module = Module;
    storage.module = Module;
    audio.module = Module;
    window.gta2 = { Module, renderer, storage, audio };

    const files = await getFiles();
    validate(files);
    await writeFiles(Module, files);
    const restored = await storage.restoreInto(Module.FS);
    if (restored) console.log(`Restored ${restored} saved file(s)`);
    // The game's text: data/<letter>.gxt for the web language, generated from
    // e.gxt when the user's files do not ship it (before the engine loads it).
    ensureGameLanguage(Module, currentLang());
    seedRegistry(Module);
    const handleKey = wireInput(Module, canvas);
    // Browsers start audio only after a user gesture (but not while the map screen pauses the game).
    let gamePaused = false;
    for (const type of ['keydown', 'pointerdown']) window.addEventListener(type, () => { if (!gamePaused) audio.resume(); }, true);
    wireAudioButton(audio);
    window.addEventListener('pagehide', () => { saveRegistry(Module); storage.flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) storage.flush(); });
    wireSaveButtons(storage);
    $('game').hidden = false;
    setStatus('');
    canvas.focus();
    Module.ccall('gta2_port_set_view_width', 'number', ['number'], [chooseViewWidth(canvas)]);
    wireViewWidth(Module, canvas);
    const params = new URLSearchParams(location.search);
    // Camera button; ?camera=classic|modern for this visit, ?heightbias=N raises Modern.
    wireCameraButton(Module);
    wireFpsButton(renderer);
    wireFullscreenButton();
    // ?smooth=0: draw only at the game's 30 updates per second (no display-rate interpolation).
    Module.ccall('gta2_port_set_interpolation', null, ['number'], [option('smooth', 'gta2-port-smooth', '1') === '0' ? 0 : 1]);
    // ?hud=centre keeps the whole HUD in the centred 4:3 box (default: anchored to the screen edges).
    Module.ccall('gta2_port_set_hud_edges', null, ['number'], [option('hud', 'gta2-port-hud', 'edges') === 'centre' ? 0 : 1]);
    // ?margin=0 keeps the original activation rectangle even where more is drawn (things then pop in).
    Module.ccall('gta2_port_set_activation_margin', null, ['number'], [params.get('margin') === '0' ? 0 : 1]);
    if (coop) {
      setupCoop(Module, coop);
      window.gta2.coop = coop;
      setStatus(t('shell.waitingLoad'));
      await coop.lobby.allLoaded();
      setStatus('');
    }
    const rc = Module.ccall('gta2_start', 'number', ['string', 'string'], [GAME_DIR, startOptions.commandLine || '']);
    if (rc < 0) setStatus(t('shell.couldNotStart', { code: rc }), true);
    else {
      if (cacheAfterStart) setTimeout(() => cachePickedFiles(files), 3000);
      count(coop ? `play/coop-${coop.mode}` : 'play/solo');
      if (coop && coop.lobby.host) count(`match/${coop.players.length}-players`);
      startPlayClock(coop ? 'coop' : 'solo');
    }
    // Map screen (M), minimap and waypoint: not in the original game (T33).
    const releaseAll = Module.cwrap('gta2_port_release_all_keys', null, []);
    // The map screen and the Saves screen pause the game and its sound.
    const pauseGame = (paused) => {
      gamePaused = paused;
      releaseAll();
      // in co-op the shared game keeps running behind the map (everyone else would wait)
      if (!coop) Module.ccall('gta2_port_set_paused', null, ['number'], [paused ? 1 : 0]);
      if (audio.ctx) { if (paused) audio.ctx.suspend().catch(() => {}); else audio.resume(); }
    };
    const map = new Gta2Map({ Module, renderer, gameCanvas: canvas, onPause: pauseGame });
    window.gta2.map = map;
    if (coop) {
      map.coop = coopView(Module, coop);
      // the latest standings with players in them (once the game has ended there is nothing left to read)
      let lastResults = null;
      coop.results = () => {
        const r = map.coop.standings();
        if (r.rows.length) lastResults = r;
        return lastResults || r;
      };
      coop.endMatch = () => Module.onGameExit && Module.onGameExit(0);
      coop.report = () => map.coop.report();
      coop.startedAt = performance.now();
    }
    const chat = coop ? new CoopChat({
      lobby: coop.lobby, mySlot: coop.mySlot, releaseKeys: releaseAll,
      name: (slot) => (coop.players[slot] ? coop.players[slot].name : t('shell.playerN', { n: slot + 1 })),
      colour: (slot) => PLAYER_COLOURS[slot % PLAYER_COLOURS.length],
    }) : null;
    // Quick save and load (single player): a snapshot of the whole game.
    // Save states (single player): the Saves screen, the autosave after a job, Continue on the front page.
    const states = coop ? null : new SaveStates({ Module, renderer, map });
    const saves = states ? new SavesScreen({ states, pause: pauseGame, onClose: () => canvas.focus() }) : null;
    window.gta2.states = states;
    if (states) {
      const savesTitle = () => { $('saves-open').title = t('shell.savesTitle', { key: SAVE_KEY }); };
      savesTitle();
      langRerenders.push(savesTitle);
      $('saves-open').addEventListener('click', () => saves.show());
      states.watchJobs();
      if (loadSlot) states.load(loadSlot); // Continue on the front page
    } else {
      $('saves-open').hidden = true;
    }
    const radioKeys = wireRadioKeys(Module, audio, coop, () => !!(map.last && map.last.inCar));
    // The Controls screen: the game menu's Options (which launched GTA2 Manager) and the toolbar.
    const controls = new ControlsScreen({
      Module, keys: KEYS, defaults: PORT_CONTROLS, regPath: `${REG_ROOT}\\control`,
      onChange: () => saveRegistry(Module), pause: pauseGame, onClose: () => canvas.focus(),
    });
    Module.onOpenOptions = () => controls.show();
    $('controls-open').addEventListener('click', () => controls.show());
    keyHooks.filter = (e, down) => controls.handleKey(e, down) || (!!saves && saves.handleKey(e, down)) || (!!states && !map.open && states.handleKey(e, down)) ||
      (!!chat && !map.open && chat.handleKey(e, down)) || map.handleKey(e, down) ||
      // only while playing: the game's menus take R and T as letters (the player's name)
      (!!(map.last && map.last.hasPlayer) && (radioKeys(e, down) || (!!viewKeys.handle && viewKeys.handle(e, down))));
    wireMapButtons(map);
    window.gta2.gamepad = wireGamepad(handleKey,
      () => !!(map.last && map.last.hasPlayer) && !map.open && !(saves && saves.open) && !(chat && chat.open) && !controls.open,
      (code) => controls.rebound(code));
    if (new URLSearchParams(location.search).has('devdata')) installDevHelpers(Module);
    // Developer option (?perfbeacon=PORT): every 2 s, post frame timings to a listener on this
    // computer (for comparing browsers).
    const beaconPort = new URLSearchParams(location.search).get('perfbeacon');
    if (beaconPort) {
      let rafs = 0;
      const countRaf = () => { rafs++; requestAnimationFrame(countRaf); };
      requestAnimationFrame(countRaf);
      const presentOrig = renderer.present.bind(renderer);
      let presentMs = 0;
      renderer.present = (...args) => { const t = performance.now(); presentOrig(...args); presentMs += performance.now() - t; };
      let mapMs = 0;
      map.perf = { image: 0, fog: 0 };
      const mapFrame = map.frame.bind(map);
      map.frame = () => { const t = performance.now(); mapFrame(); mapMs += performance.now() - t; };
      if (new URLSearchParams(location.search).has('nominimap')) map.minimapOn = false; // this visit only
      const take = Module.cwrap('gta2_port_take_frame_ms', 'number', ['number']);
      let last = { t: performance.now(), frames: renderer.stats.frames };
      setInterval(() => {
        const now = performance.now();
        const secs = (now - last.t) / 1000;
        const countPtr = Module._malloc(4);
        const loopMs = take(countPtr);
        const slices = Module.HEAP32[countPtr >> 2];
        Module._free(countPtr);
        const frames = renderer.stats.frames - last.frames;
        const report = {
          ua: navigator.userAgent, fps: +(frames / secs).toFixed(1), raf: +(rafs / secs).toFixed(1),
          slices: +(slices / secs).toFixed(1), sliceMs: +(loopMs / Math.max(1, slices)).toFixed(2),
          presentMs: +(presentMs / Math.max(1, frames)).toFixed(2), drawCalls: renderer.stats.drawCalls,
          mapMs: +(mapMs / Math.max(1, rafs)).toFixed(2), minimap: map.minimapOn,
          imageMs: +(map.perf.image / Math.max(1, rafs)).toFixed(2), fogMs: +(map.perf.fog / Math.max(1, rafs)).toFixed(2),
          canvas: `${canvas.width}x${canvas.height}`, dpr: devicePixelRatio, hidden: document.hidden,
          player: !!(map.last && map.last.hasPlayer),
        };
        rafs = 0; presentMs = 0; mapMs = 0; map.perf = { image: 0, fog: 0 }; last = { t: now, frames: renderer.stats.frames };
        fetch(`http://127.0.0.1:${beaconPort}/`, { method: 'POST', mode: 'no-cors', body: JSON.stringify(report) }).catch(() => {});
      }, 2000);
      // ?perfsecs=N: leave after N seconds (a test page opened in someone's own browser)
      const secs = Number(new URLSearchParams(location.search).get('perfsecs'));
      if (secs > 0) setTimeout(() => location.replace('about:blank'), secs * 1000);
    }
    // Developer option (?autostart=1): Enter twice -> PLAY -> start area 1.
    if (new URLSearchParams(location.search).has('autostart')) {
      const key = Module.cwrap('gta2_port_key', null, ['number', 'number', 'number', 'number']);
      const tap = (at) => {
        setTimeout(() => key(0x1c, 0x0d, 1, 13), at);
        setTimeout(() => key(0x1c, 0x0d, 0, 0), at + 100);
      };
      tap(1500);
      tap(3500);
    }
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), true);
    $('picker').hidden = false;
  }
}

// Pages hosted where other sites cannot be fetched (e.g. a sandboxed preview)
// set window.GTA2_NO_DIRECT_DOWNLOAD; the installer can still be picked as a file.
if (window.GTA2_NO_DIRECT_DOWNLOAD) $('download-freeware').hidden = true;

$('installer-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const files = await unpackInstallerFile(file, (stage) => {
      if (stage === 'read') setStatus(t('shell.readingInstaller'));
      else if (stage === 'verify') setStatus(t('shell.checkingInstaller'));
      else if (stage === 'unpack') setStatus(t('shell.unpacking'));
    });
    validate(files);
    start(async () => files, { cacheAfterStart: true });
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

$('download-freeware').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  button.disabled = true;
  const mb = (n) => Math.round(n / 1048576);
  const t0 = performance.now();
  try {
    const files = await downloadFreeware((stage, done, total) => {
      if (stage === 'download') {
        const rate = done / Math.max(1, (performance.now() - t0) / 1000);
        const left = rate > 0 ? Math.round((total - done) / rate) : 0;
        setStatus(done > 1048576
          ? (left < 90 ? t('shell.downloadingSecs', { done: mb(done), total: mb(total), secs: left })
            : t('shell.downloadingMins', { done: mb(done), total: mb(total), mins: Math.round(left / 60) }))
          : t('shell.downloading', { done: mb(done), total: mb(total) }));
      } else if (stage === 'verify') setStatus(t('shell.checkingDownload'));
      else if (stage === 'unpack') setStatus(t('shell.unpacking'));
    });
    validate(files);
    start(async () => files, { cacheAfterStart: true });
  } catch (err) {
    setStatus(err.message || String(err), true);
    button.disabled = false;
  }
});

$('folder').addEventListener('change', (e) => {
  const files = collectPickedFiles(e.target.files);
  start(async () => files, { cacheAfterStart: true });
});

// A language change while the game runs switches the game's text live.
initGameLanguage(setStatus);
wireLangButton();

const pageParams = new URLSearchParams(location.search);
let serverFiles = null; // serverGameFiles()
// On our game server (D21) the page is the front door: the game files come from the server.
const serverConfig = await fetch('config.json', { cache: 'no-store' })
  .then((res) => (res.ok ? res.json() : null)).catch(() => null);
// Our game server ({server: true}, D21) or a static site such as GitHub Pages ({static: true}):
// both show the landing page; the game files come from the server, or from the Internet Archive.
const onServer = !!(serverConfig && serverConfig.server);
const onSite = onServer || !!(serverConfig && serverConfig.static);
if (onServer) document.body.classList.add('on-server');
if (onSite) document.body.classList.add('on-site');
if (initStats(serverConfig)) $('stats-faq').hidden = false; // anonymous play counts (the public site)
if (onSite && !pageParams.has('coop')) {
  wireServerHome();
} else if (pageParams.has('coop')) {
  if (onServer) serverGameFiles(); // start the one-time download while the lobby fills
  wireCoopLobby();
} else if (pageParams.has('devdata')) {
  Error.stackTraceLimit = 200;
  start(collectDevFiles);
} else if (!pageParams.has('choose')) {
  autoStart();
} else {
  offerSavedFiles();
}
document.body.classList.remove('booting');

/**
 * On our game server: the game files from this browser's copy when there is one,
 * otherwise downloaded from the server once (and kept after the game starts).
 * Started early, so the download runs while the player is still choosing.
 */
function serverGameFiles() {
  if (serverFiles) return serverFiles;
  const show = (text, fraction) => { landingProgress(text, fraction); setStatus(text); };
  const job = serverFiles = { fromCache: false };
  job.promise = (async () => {
    if (await fileCache.info()) {
      job.fromCache = true;
      return fileCache.load();
    }
    show(onServer ? t('shell.fromServer') : t('shell.connectingArchive'), 0);
    // a static site: the freeware installer from the Internet Archive, unpacked in this browser
    const files = onServer ? await collectDevFiles(show) : await downloadFreeware(freewareProgress(show));
    if (!onServer) count('download/gta2');
    show(t('shell.ready'), 1);
    return files;
  })();
  job.promise.catch((err) => {
    if (serverFiles === job) serverFiles = null; // the next Play starts a fresh attempt
    if (!onServer) count('download/failed', { title: String(err.message || err).slice(0, 200) });
    const text = t('shell.filesFailed', { message: String(err.message || err).replace(/\.$/, '') });
    setStatus(text, true);
    landingProgress(text, 0, true);
  });
  return job;
}

/** Progress of the Internet Archive download, for a (text, fraction) display. */
function freewareProgress(show) {
  const mb = (n) => Math.round(n / 1048576);
  const t0 = performance.now();
  return (stage, done, total) => {
    if (stage === 'download') {
      const rate = done / Math.max(1, (performance.now() - t0) / 1000);
      const left = rate > 0 ? Math.round((total - done) / rate) : 0;
      show(done > 1048576
        ? (left < 90 ? t('shell.downloadingSecs', { done: mb(done), total: mb(total), secs: left })
          : t('shell.downloadingMins', { done: mb(done), total: mb(total), mins: Math.round(left / 60) }))
        : t('shell.downloading', { done: mb(done), total: mb(total) }), total ? done / total : 0);
    } else if (stage === 'verify') show(t('shell.checkingDownload'), 1);
    else if (stage === 'unpack') show(t('shell.unpacking'), 1);
  };
}

/** Whether the files about to be used came from the server and should be kept in this browser. */
function needsCaching() {
  return !!serverFiles && !serverFiles.fromCache;
}

/** Our game server's front page (the landing page): Play, Play with friends, controls, options, help. */
async function wireServerHome() {
  $('picker').hidden = true;
  count('/', { event: false });
  // On a static site the 360 MB download only starts when the player presses Play (or hosts/joins).
  const cached = !onServer && !!(await fileCache.info());
  const files = onServer || cached ? serverGameFiles() : null;
  let starting = false;
  if (onServer) savedCrews().then(showLeaderboard);
  else { $('crews').remove(); document.querySelector('#topnav a[href="#crews"]').remove(); } // saved crews live on our game server
  // loadSlot: Continue (a save to load once the game has started)
  const playNow = async (loadSlot = null) => {
    if (starting) return;
    starting = true;
    const buttons = document.querySelectorAll('[data-play]');
    for (const b of buttons) b.disabled = true;
    setStatus(t('shell.starting'));
    try {
      const loaded = await serverGameFiles().promise;
      hideLanding();
      start(async () => loaded, { cacheAfterStart: needsCaching(), loadSlot });
    } catch {
      starting = false;
      for (const b of buttons) b.disabled = false;
    }
  };
  showLanding({
    files,
    onCoop: () => { location.search = '?coop'; },
    onPlay: () => playNow(),
  });
  // Continue: the newest save this version of the game can load
  listSaves().then((all) => {
    const newest = all.find((s) => s.current);
    if (newest) showContinue({ ...newest, thumb: newest.thumb }, () => playNow(newest.slot));
  });
}

/** Game files for a co-op match: the local server's copy or the browser's (the picker otherwise). */
async function coopFiles() {
  if (onSite) return serverGameFiles().promise;
  try {
    const res = await fetch('gamedata/manifest.json', { cache: 'no-store' });
    if (res.ok) return collectDevFiles();
  } catch { /* no local game folder */ }
  if (await fileCache.info()) return fileCache.load();
  throw new Error(t('shell.coopNeedFolder'));
}

/**
 * Saved crews (D21): a finished Gang Wars match of a minute or more goes to the
 * game server, once per match (every player reports; the server keeps the first).
 * The reputation changes join the "last match" panel.
 */
async function reportMatch(coop) {
  await new Promise((r) => setTimeout(r, 800)); // the "match has ended" message stays up a moment
  if (!onServer || coop.mode !== 'wars' || !coop.report || performance.now() - (coop.startedAt || 0) < 60000) return;
  try {
    const res = await fetch('api/match', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ id: coop.id, mode: 'wars', district: coop.district, crews: coop.report() }),
    });
    const out = await res.json();
    if (out.ok && out.changes && out.changes.length) {
      const saved = JSON.parse(sessionStorage.getItem('gta2-coop-results') || 'null');
      if (saved) {
        saved.reputation = out.changes;
        sessionStorage.setItem('gta2-coop-results', JSON.stringify(saved));
      }
    }
  } catch { /* the server could not be reached: the match is not saved */ }
}

/** Saved crews from the game server, for the lobby and the landing page (empty elsewhere). */
async function savedCrews() {
  if (!onServer) return [];
  try { return (await (await fetch('api/crews', { cache: 'no-store' })).json()).crews || []; } catch { return []; }
}

/** The lobby's "last match" panel, after a match ends. */
function showLastResults() {
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem('gta2-coop-results') || 'null'); sessionStorage.removeItem('gta2-coop-results'); } catch { /* storage unavailable */ }
  if (!r || !r.rows) return;
  const box = $('coop-results');
  const h = document.createElement('h3');
  h.textContent = r.title;
  const table = document.createElement('table');
  const head = table.insertRow();
  for (const c of r.columns) head.append(Object.assign(document.createElement('th'), { textContent: c }));
  for (const row of r.rows) {
    const tr = table.insertRow();
    row.cells.forEach((v, i) => {
      const td = tr.insertCell();
      td.textContent = v;
      if (i === 0 && row.colour) td.style.color = row.colour;
      if (row.strong) td.style.fontWeight = '700';
    });
  }
  box.replaceChildren(h, table);
  if (r.reputation) {
    const rep = document.createElement('p');
    rep.className = 'mode-help';
    rep.textContent = t('shell.crewReputation', {
      list: r.reputation.map((c) => t('shell.crewRepRow',
        { name: c.name, delta: `${c.delta >= 0 ? '+' : ''}${c.delta}`, reputation: c.reputation })).join(' · '),
    });
    box.append(rep);
  }
  box.hidden = false;
}

/** ?coop: the co-op lobby (D20). */
function wireCoopLobby() {
  $('coop').hidden = false;
  count('/coop', { event: false });
  if (onSite) {
    // the landing page's bar, leading back to the front page (relative: a static site may live in a folder)
    $('topnav').hidden = false;
    document.querySelector('#picker h1').textContent = t('shell.playWithFriends');
    for (const a of document.querySelectorAll('#topnav nav a')) a.href = `./${a.getAttribute('href')}`;
    for (const b of document.querySelectorAll('#topnav [data-play]')) b.addEventListener('click', () => { location.href = './'; });
  }
  for (const el of document.querySelectorAll('#picker > :not(h1):not(#coop)')) el.hidden = true;
  const nameInput = $('coop-name');
  try { nameInput.value = localStorage.getItem('gta2-port-coop-name') || ''; } catch { /* storage unavailable */ }
  const room = location.hash.replace(/^#/, '');
  if (room) $('coop-code').value = room;
  let lobby = null;
  let pinger = 0;
  let crewSent = false;
  let known = []; // saved crews on the game server
  savedCrews().then((c) => { known = c; render(); });
  let savedCrew = '';
  try { savedCrew = localStorage.getItem('gta2-port-coop-crew') || ''; } catch { /* storage unavailable */ }
  $('coop-crew').value = savedCrew;
  // this player's crew: joined from a card, typed as a new name, or '' to leave (remembered for next time)
  const setCrew = (name) => {
    savedCrew = String(name || '').trim().slice(0, 16);
    $('coop-crew').value = savedCrew;
    try { localStorage.setItem('gta2-port-coop-crew', savedCrew); } catch { /* storage unavailable */ }
    if (lobby) lobby.setCrew(savedCrew);
  };
  const HELP = {
    roam: t('shell.helpRoam'),
    wars: t('shell.helpWars'),
    ffa: t('shell.helpFfa'),
  };
  const render = () => {
    const s = lobby ? lobby.settings : { mode: 'roam', district: 'downtown', friendlyFire: false, minutes: 0, killLimit: 10, pointsTarget: 0, sides: {} };
    const host = !!(lobby && lobby.host);
    const crews = lobby ? lobby.crews() : [];
    const list = $('coop-players');
    list.replaceChildren(...(lobby ? lobby.players : []).map((p, i) => {
      const li = document.createElement('li');
      li.textContent = p.name + (i === 0 ? ` ${t('shell.tagHost')}` : '') +
        (lobby && p.id === lobby.t.id ? ` ${t('shell.tagYou')}` : '') +
        (p.ping ? ` · ${p.ping} ms` : '');
      const crew = s.mode === 'wars' && crews.find((c) => c.name === p.crew);
      if (crew) {
        const tag = document.createElement('span');
        tag.className = 'crewtag';
        tag.style.background = crew.colour;
        tag.textContent = crew.name;
        li.append(tag);
      }
      return li;
    }));
    // the match settings: the host's to change, everyone sees them
    for (const [id, key] of [['coop-mode', 'mode'], ['coop-district', 'district'], ['coop-minutes', 'minutes'],
      ['coop-kills', 'killLimit'], ['coop-points', 'pointsTarget']]) {
      if (document.activeElement !== $(id)) $(id).value = String(s[key]);
      $(id).disabled = !host;
    }
    $('coop-ff').checked = !!s.friendlyFire;
    $('coop-ff').disabled = !host;
    for (const el of document.querySelectorAll('#coop [data-modes]')) el.hidden = !el.dataset.modes.split(' ').includes(s.mode);
    $('coop-mode-help').textContent = HELP[s.mode] || '';
    // Gang Wars: crews and their sides
    const names = [...new Set([...crews.map((c) => c.name), ...known.map((c) => c.name)])];
    $('coop-crew-list').replaceChildren(...names.map((n) => Object.assign(document.createElement('option'), { value: n })));
    // Gang Wars: the crews as cards. Anyone joins or switches with a click (or types a new crew name);
    // the crew's own members pick its gang. Nothing is assigned for them.
    const myId = lobby ? lobby.t.id : null;
    const mine = lobby ? (lobby.players.find((p) => p.id === myId) || {}).crew : '';
    const taken = new Set(crews.map((c) => c.side).filter(Boolean));
    const cards = crews.map((c) => {
      const row = document.createElement('div');
      row.className = `crew${c.name === mine ? ' mine' : ''}`;
      row.style.setProperty('--c', c.colour);
      const name = document.createElement('b');
      name.textContent = c.name;
      row.append(name);
      const member = c.name === mine;
      if (member || host) {
        const pick = document.createElement('select');
        pick.append(Object.assign(document.createElement('option'), { value: '', textContent: t('shell.pickGang') }));
        for (const [code, label] of GANGS[s.district] || []) {
          const held = taken.has(code) && c.side !== code;
          pick.append(Object.assign(document.createElement('option'), { value: code, textContent: held ? t('shell.gangTaken', { gang: label }) : label, disabled: held }));
        }
        pick.value = c.side || '';
        pick.addEventListener('change', () => (member ? lobby.pickSide(pick.value) : lobby.setSettings({ sides: { ...lobby.settings.sides, [c.name]: pick.value || undefined } })));
        row.append(pick);
      } else {
        const gang = document.createElement('span');
        gang.textContent = c.gang ? t('shell.sidesWith', { gang: c.gang }) : t('shell.noGang');
        row.append(gang);
      }
      const who = document.createElement('span');
      who.className = 'who';
      const saved = known.find((k) => k.name.toLowerCase() === c.name.toLowerCase());
      who.textContent = lobby.players.filter((p) => p.crew === c.name).map((p) => p.name).join(', ') +
        (saved ? ` · ${t('shell.crewRepShort', { reputation: saved.reputation, wins: saved.wins })}` : ` · ${t('shell.newCrew')}`);
      row.append(who);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = member ? t('shell.leave') : t('shell.join');
      button.addEventListener('click', () => setCrew(member ? '' : c.name));
      row.append(button);
      return row;
    });
    const loners = lobby ? lobby.players.filter((p) => !p.crew).map((p) => p.name) : [];
    if (loners.length) {
      const note = document.createElement('p');
      note.className = 'mode-help';
      note.textContent = t('shell.noCrewYet', { players: loners.join(', ') });
      cards.push(note);
    }
    $('coop-crews').replaceChildren(...cards);
    if (lobby && !crewSent && savedCrew && (lobby.host || lobby.hostId)) { crewSent = true; lobby.setCrew(savedCrew); }
    $('coop-start').hidden = !host;
    const why = host ? lobby.startProblem() : '';
    $('coop-start').disabled = !!why;
    $('coop-start-why').textContent = why;
    // on our server: one link that logs a friend in and opens this room
    $('coop-invite').hidden = !(lobby && onSite);
    if (lobby && onSite) {
      const link = new URL('./', location.href);
      if (serverConfig.invite) link.searchParams.set('invite', serverConfig.invite);
      link.searchParams.set('coop', '');
      link.hash = lobby.code;
      $('coop-link').value = link.href;
    }
    $('coop-state').textContent = !lobby ? '' : lobby.host
      ? t('shell.roomHost', { code: lobby.code, count: lobby.players.length })
      : lobby.players.length ? t('shell.roomGuest', { code: lobby.code })
        : t('shell.roomLooking', { code: lobby.code });
  };
  const open = async (host) => {
    const name = (nameInput.value || t('shell.defaultName')).trim().slice(0, 16);
    try { localStorage.setItem('gta2-port-coop-name', name); } catch { /* storage unavailable */ }
    const code = (host && rematch && rematch.host && rematch.code) || (host ? Math.random().toString(36).slice(2, 8).toUpperCase()
      : $('coop-code').value.trim().toUpperCase());
    if (!code) { setStatus(t('shell.enterCode'), true); return; }
    for (const b of ['coop-host', 'coop-join']) $(b).disabled = true;
    if (onSite) serverGameFiles(); // the game files, while the room fills (a static site: from the Internet Archive)
    // ?coop&local: tabs of this browser only (BroadcastChannel), for testing
    let transport;
    try {
      transport = new URLSearchParams(location.search).has('local') ? new LocalTransport(code)
        : serverConfig && serverConfig.relay ? await ServerTransport.create(code, serverConfig.relay)
          : await WebRtcTransport.create(code);
    } catch (err) {
      setStatus(t('shell.connectFailed', { message: err.message }), true);
      for (const b of ['coop-host', 'coop-join']) $(b).disabled = false;
      return;
    }
    lobby = new CoopLobby(transport, {
      name, host, onChange: render,
      onStart: async (match) => {
        clearInterval(pinger);
        setStatus(t('shell.startingMatch', {
          mode: MODES[match.mode] || t('shell.coopTitle'), district: DISTRICTS[match.district].label, count: match.players.length,
        }));
        try {
          const files = await coopFiles();
          start(async () => files, { coop: { lobby, ...match }, cacheAfterStart: needsCaching() });
        } catch (err) { setStatus(err.message, true); }
      },
    });
    if (host && rematch && rematch.settings) lobby.setSettings(rematch.settings);
    lobby.code = code;
    window.gta2Lobby = lobby; // for tests
    pinger = setInterval(() => lobby.measurePings(), 2000);
    location.hash = code;
    render();
  };
  $('coop-copy').addEventListener('click', () => {
    navigator.clipboard.writeText($('coop-link').value).then(() => { $('coop-copy').textContent = t('shell.copied'); }, () => $('coop-link').select());
  });
  // after a match: straight back into the same room, as host or guest
  let rematch = null;
  try { rematch = JSON.parse(sessionStorage.getItem('gta2-coop-rematch') || 'null'); sessionStorage.removeItem('gta2-coop-rematch'); } catch { /* storage unavailable */ }
  if (rematch && rematch.code) {
    $('coop-code').value = rematch.code;
    setTimeout(() => open(!!rematch.host), 0);
  }
  $('coop-host').addEventListener('click', () => open(true));
  $('coop-join').addEventListener('click', () => open(false));
  $('coop-start').addEventListener('click', () => lobby && lobby.start());
  // host: match settings
  // numbers: whole, 0 = none; the game's time limit stops at 60 minutes
  const LIMITS = { minutes: 60, killLimit: 999, pointsTarget: 100000000 };
  for (const [id, key] of [['coop-mode', 'mode'], ['coop-district', 'district'], ['coop-minutes', 'minutes'],
    ['coop-kills', 'killLimit'], ['coop-points', 'pointsTarget']]) {
    $(id).addEventListener('change', () => {
      if (!lobby) return;
      let value = $(id).value;
      if (key in LIMITS) value = Math.max(0, Math.min(LIMITS[key], Math.round(Number(value) || 0)));
      lobby.setSettings({ [key]: value });
      $(id).value = String(value);
    });
  }
  $('coop-ff').addEventListener('change', () => lobby && lobby.setSettings({ friendlyFire: $('coop-ff').checked }));
  $('coop-crew').addEventListener('change', () => setCrew($('coop-crew').value));
  showLastResults();
  render();
}

/**
 * Starts without asking when the game files are already available:
 * 1. the local server's copy of the game folder (scripts/serve_port.py
 *    --dev-data, which only listens on this computer);
 * 2. the copy kept in this browser after the folder was picked once.
 * Otherwise the folder picker stays. ?choose=1 always shows the picker.
 */
async function autoStart() {
  try {
    const res = await fetch('gamedata/manifest.json', { cache: 'no-store' });
    if (res.ok) {
      setStatus(t('shell.loadingFromComputer'));
      start(collectDevFiles);
      return;
    }
  } catch { /* no local game folder */ }
  if (await fileCache.info()) {
    setStatus(t('shell.loadingFromBrowser'));
    start(() => fileCache.load());
  }
}

/** ?choose=1: the picker, plus Play / Forget for the copy kept in this browser. */
function offerSavedFiles() {
  fileCache.info().then((info) => {
    if (!info) return;
    $('saved-info').textContent = t('shell.savedInfo', { mb: Math.round(info.bytes / 1048576) });
    $('saved').hidden = false;
    $('play-saved').addEventListener('click', () => {
      setStatus(t('shell.loadingFromBrowser'));
      start(() => fileCache.load());
    });
    $('forget-files').addEventListener('click', async () => {
      await fileCache.forget();
      $('saved').hidden = true;
      setStatus(t('shell.filesForgotten'));
    });
  });
}
