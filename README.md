<h1 align="center">Dofight</h1>

<p align="center">
  <b>L'assistant de combat pour Dofus 3.</b><br>
  Un panneau à côté du jeu qui te montre les dangers des monstres autour de toi.
</p>

<p align="center">
  <a href="https://github.com/dofight/dofight/releases/latest"><b>⬇ Télécharger pour Windows</b></a>
  · <a href="https://dofight.github.io">Site</a>
  · <a href="https://discord.gg/G8G4cyvpx6">Discord</a>
  · <a href="#english">English</a>
</p>

<p align="center">
  <a href="https://github.com/dofight/dofight/releases/latest"><img alt="Dernière version" src="https://img.shields.io/github/v/release/dofight/dofight?label=version"></a>
  <img alt="Windows 10 et 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-blue">
  <img alt="Licence MIT" src="https://img.shields.io/github/license/dofight/dofight">
</p>

<p align="center">
  <img src="docs/images/dofight-panel.png" alt="Le panneau Dofight : les monstres de la sous-zone, leurs badges de danger, leurs résistances et leurs sorts" width="308">
</p>

Gratuit et open source. Dofight lit **le coin en haut à gauche de la fenêtre Dofus** : le nom de la sous-zone, les
coordonnées de la carte et la barre d'icônes, qui lui indique qu'un combat commence. En mode Songes, il cherche
aussi les infobulles de groupes de monstres dans toute la fenêtre, et n'en garde que le texte. Un interrupteur
coupe cette lecture (Paramètres → « Lecture de l'écran »). Il ne joue pas à ta place, n'envoie rien au jeu et ne
lit ni sa mémoire, ni ses fichiers, ni son trafic réseau.

Pour chaque monstre autour de toi, tu vois ce qui peut te faire perdre le combat (un one-shot, une invulnérabilité,
une mécanique), puis ses résistances et ses sorts.

## Avant de commencer

- Windows 10 ou 11, et Dofus 3 (en français ou en anglais).
- Le français parmi les langues de Windows (Paramètres Windows → Heure et langue → Langue et région) : Dofight s'en
  sert pour lire le texte à l'écran. Si ton Windows est en français, tu n'as rien à faire.

## Installation

1. Ouvre la page de la [dernière version](https://github.com/dofight/dofight/releases/latest) et télécharge le fichier
   `Dofight_…_x64-setup.exe` (les autres fichiers servent aux mises à jour).
2. Lance-le. Si Windows affiche « Windows a protégé votre ordinateur », clique sur « Informations
   complémentaires », puis sur « Exécuter quand même » : Dofight est un petit projet, qui n'a pas de certificat
   payant.
3. Dans Dofus, active **« Afficher les coordonnées de la carte »** dans les options (Interface → Cartes) : Dofight lit le nom de la
   sous-zone juste au-dessus des coordonnées.
4. Laisse dépliée la barre d'icônes en haut à gauche du jeu (l'œil hors combat, le cœur en combat) : c'est elle
   qui indique à Dofight qu'un combat commence.

Lance Dofus : Dofight affiche les monstres de ta sous-zone et s'ouvre tout seul en combat. **Ctrl+Maj+D**
l'affiche ou le cache (raccourci modifiable dans les paramètres). Les mises à jour se font toutes seules.

**Désinstaller :** Paramètres Windows → Applications → Applications installées → Dofight → Désinstaller.

## Ce que fait Dofight

- **Les monstres autour de toi** : ceux de ta sous-zone ou de ton donjon, affichés dès que tu y entres.
- **Ce qui est dangereux** : des badges (danger, conseil, mécanique) et un court résumé rédigé à
  partir des guides. La fiche du boss est dépliée ; pour les autres monstres, les dangers apparaissent directement
  sur leur ligne.
- **Résistances et sorts** de chaque monstre, avec le détail de chaque sort.
- **Les grosses mécaniques expliquées** (cycle lunaire, vagues de monstres, modificateurs de dimension…) : survole
  la pastille « ⓘ » pour un aperçu, clique pour l'épingler.
- **Mode Songes** : il s'active tout seul quand tu entres dans les Songes ; survole un groupe de monstres sur la carte,
  ou affiche-les tous avec la touche du jeu, et Dofight les affiche avant le combat.
- **Recherche** d'un donjon, d'une sous-zone ou d'un monstre ; « Aller en [x,y] » copie la commande de voyage à
  coller dans le chat.
- **Filtrer les résultats** : tape un sort, un badge ou un effet (« pousse », « PA »…) pour ne garder que les
  monstres concernés (Ctrl+F).
- **Ouverture automatique** : il s'ouvre au début du combat et se ferme à la fin ; Ctrl+Maj+D l'affiche ou le cache.
- **Réglages** : thèmes assortis à ceux de Dofus, taille du texte, opacité, interface en français ou en anglais ;
  un cadenas fige la position et la taille du panneau.

## Questions fréquentes

**C'est autorisé ?** Dofight n'est ni un bot ni un mod : il ne clique pas, n'envoie rien au jeu et ne modifie rien.
Il capture la fenêtre Dofus, seulement quand elle est au premier plan, et en lit le coin en haut à gauche (le nom
de la sous-zone, les coordonnées de la carte et la barre d'icônes). En combat, il surveille surtout la barre
d'icônes ; s'il ne connaît pas encore ta sous-zone (Dofight ouvert en plein combat), il relit le nom de la
sous-zone plus souvent, jusqu'à la trouver. En mode Songes, hors combat, quand ta souris s'arrête, il cherche les
infobulles de groupes de monstres dans toute la fenêtre du jeu : elles s'affichent où se trouve le groupe, et le
jeu peut toutes les montrer d'un coup. Il n'en retient que leur texte, et rien d'autre de l'écran n'est gardé ni
envoyé : ni le tchat, ni les noms de joueurs, de guilde ou d'alliance, ni ton inventaire. Les captures ne quittent
jamais ton PC. Tu peux couper cette lecture dans Paramètres → « Lecture de l'écran » : Dofight ne capture alors la
fenêtre Dofus que lorsque tu cliques sur « Scanner ma sous-zone ». Ce qu'il affiche est public (données du jeu,
guides). C'est un outil fait par des fans, sans lien avec Ankama, qui ne l'a ni validé ni approuvé : tu l'utilises
sous ta propre responsabilité.

**Qu'est-ce que Dofight envoie sur Internet ?** Rien pendant que tu joues : pas de compte, pas de statistiques.
Il contacte GitHub pour ses mises à jour. Si tu envoies une suggestion, il transmet ton message et, si tu laisses
les deux options activées, l'état de Dofight (sous-zone lue, combat, version, paramètres) et son journal des 10
dernières minutes. Jamais de capture d'écran ni de chat, ni de nom de personnage, de guilde ou de compte.

**Dofight n'affiche rien, ou pas les bons monstres ?** Revérifie les étapes 3 et 4 de l'installation, et assure-toi
que le français fait bien partie des langues de Windows. Si tu joues sur plusieurs comptes, choisis la fenêtre à lire dans
Paramètres → Lecture de l'écran.

**Une erreur, une idée, besoin d'aide ?** Le bouton « Envoyer une suggestion » (en bas des résultats) envoie ton
message à l'équipe, de façon anonyme. Si tu veux une réponse, passe par le [Discord](https://discord.gg/G8G4cyvpx6).

Dofight est gratuit. Si tu veux soutenir le projet : [Ko-fi](https://ko-fi.com/dofight).

Dofight est un outil fait par des fans, sans lien avec Ankama. Dofus, ses noms, ses images et ses données appartiennent à
Ankama Games.

---

## English

Website: [dofight.github.io](https://dofight.github.io/?lang=en) · [Discord](https://discord.gg/G8G4cyvpx6)

The fight assistant for Dofus 3: a panel next to the game that shows what makes the monsters around you dangerous,
with their resistances and spells. Free and open source. Dofight reads **the top-left corner of the Dofus window**:
the subarea name, the map coordinates and the icon bar, which tells it when a fight starts. In Dreams mode, it also
looks for monster group tooltips anywhere in the window, and keeps only their text. One switch turns that off
(Settings → “Screen reading”). It doesn't play for you, sends nothing to the game, and doesn't read the game's
memory, files or network traffic.

### What you need

- Windows 10 or 11, and Dofus 3 (French or English client).
- French among your Windows languages (Windows Settings → Time & language → Language & region → Add a language →
  Français): Dofight uses it to read the text on screen, even with the game in English. You do not have to switch
  Windows to French.

### Install

1. Open the [latest release](https://github.com/dofight/dofight/releases/latest) and download
   `Dofight_…_x64-setup.exe` (the other files are for updates).
2. Run it. If Windows shows “Windows protected your PC”, click “More info”, then “Run anyway”: Dofight is a small
   project without a paid certificate.
3. In Dofus, turn on **“Show map coordinates”** in the options: Dofight reads the subarea name just above them.
4. Keep the icon bar in the game's top-left corner expanded (the eye out of combat, the heart in combat): it tells
   Dofight when a fight starts.

Start Dofus: Dofight shows your subarea's monsters and opens by itself in fights.
**Ctrl+Shift+D** shows or hides it (you can change it in the settings). Updates install themselves.
The interface is in French by default: switch to English in Paramètres → Langue.

**Uninstall:** Windows Settings → Apps → Installed apps → Dofight → Uninstall.

### What it does

- **The monsters around you**: your subarea's or dungeon's monsters, shown as soon as you walk in.
- **What is dangerous**: badges (danger, tip, mechanic) and a short summary written from the guides.
  The boss is expanded; the others show their dangers on their line.
- **Resistances and spells** of each monster, with a detailed sheet for each spell.
- **The big mechanics explained** (lunar cycle, monster waves, dimension modifiers…): hover over the “ⓘ” chip for a
  preview, click to pin it.
- **Dreams mode**: it turns on by itself when you enter the Dreams; hover over a monster group on the map, or show
  them all with the game's own key, and Dofight shows them before the fight.
- **Search** for a dungeon, a subarea or a monster; “Go to [x,y]” copies the travel command to paste in the chat.
- **Filter the results**: type a spell, a badge or an effect (“push”, “AP”…) to keep only the monsters concerned
  (Ctrl+F).
- **Opens by itself**: it opens when a fight starts and closes when it ends; Ctrl+Shift+D shows or hides it.
- **Settings**: themes matching Dofus's, text size, opacity, French or English interface; a padlock fixes the
  panel's position and size.

Summaries are available in English; the linked guides are in French.

### FAQ

**Is it allowed?** Dofight is neither a bot nor a mod: it does not click, sends nothing to the game and changes
nothing. It captures the Dofus window, only while it's in the foreground, and reads its top-left corner (the
subarea name, the map coordinates and the icon bar). In a fight it mostly watches the icon bar; if it doesn't know
your subarea yet (Dofight opened mid-fight), it re-reads the subarea name more often until it finds it. In Dreams
mode, out of a fight, when your mouse stops, it looks for monster group tooltips anywhere in the game window: they
appear where the group is, and the game can show them all at once. It keeps only their text, and nothing else on
screen is kept or sent: not the chat, not player, guild or alliance names, not your inventory. The captures never
leave your PC. You can turn this off in Settings → “Screen reading”: Dofight then captures the Dofus window only
when you click “Scan my subarea”. What it shows is public (game data, guides). It is a fan-made tool, not
affiliated with, reviewed or approved by Ankama: you use it at your own risk.

**What does Dofight send over the Internet?** Nothing while you play: no account, no statistics. It contacts
GitHub for its updates. If you use “Suggestion”, it sends your message and, if you leave both switches on,
Dofight's state (subarea read, fight, version, settings) and its log of the last 10 minutes. Never a screenshot,
the chat, or a character, guild or account name.

**Dofight shows nothing, or the wrong monsters?** Check steps 3 and 4 of the install, and that French is among
your Windows languages. If you play several accounts, pick the window to read in Settings → Screen reading.

**A mistake, an idea, need help?** The “Send a suggestion” button (at the bottom of the results) sends it anonymously to
the team. For an answer, use the [Discord](https://discord.gg/G8G4cyvpx6).

Dofight is free. To support the project: [Ko-fi](https://ko-fi.com/dofight).

---

## Contributing

Dofight is open source (MIT). Found a wrong summary or a bug? You can help without writing code: see
[CONTRIBUTING.md](CONTRIBUTING.md), which also covers building the app and running the tests.

## Credits

Dofight is a fan-made tool, not affiliated with Ankama. Dofus, its names, images and game data belong to Ankama
Games. The MIT licence covers Dofight's code and its own summaries, not the game data, names and images.

- Dungeon summaries: written with the help of [Dofus pour les Noobs](https://www.dofuspourlesnoobs.com); every
  summary links to its guide.
