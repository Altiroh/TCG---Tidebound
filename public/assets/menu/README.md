# Menu

Assets de l'écran d'accueil / menu principal (`app/page.tsx`). Pas de
spécification Notion dédiée — structure basée sur les besoins réels,
amenée à évoluer.

- `background/` : fond du menu principal.
- `panel/` : panneau d'affichage posé devant le fond, pour la sélection du
  mode (Jouer, Jouer en ligne, Decks, Navires, Collection).
- `buttons/` : boutons avec leurs 3 états, un sous-dossier par état :
  - `repos/` : état par défaut.
  - `survol/` : survol souris (hover).
  - `actif/` : pendant le clic (pressed).
  
  Nommer par bouton pour retrouver le trio facilement, ex:
  `buttons/repos/jouer.webp`, `buttons/survol/jouer.webp`,
  `buttons/actif/jouer.webp`.
- `icons/` : icônes diverses hors bouton — rouage (paramètres), pochette
  (deck), etc. Nommer par fonction, ex: `parametres.webp`, `deck.webp`.
- `logo/` : logo / wordmark "Tidebound" (actuellement du texte brut, `<h1>`).
- `carte/` : la variante « carte marine » du menu, en cours d'évaluation
  (`/?menu=carte`, cf. `components/menu/TideboundMenuCarte.tsx`).
  - `plateau.webp` (1672 × 645) : la table du navigateur, la carte
    punaisée et les trois parchemins — TOUTE la scène en une image. Le
    menu ne fait qu'y poser le logo et trois zones cliquables, en
    pourcentages de l'image ; changer l'illustration demande donc de
    recaler ces gabarits (`?menu=carte&reperes=1` trace leurs contours).
  - L'illustration FOURNIE faisait 1672 × 941 et portait son propre titre,
    peint en très grand sur toute la bande du haut. Elle est rognée sous
    lui (296 px), ce qui l'efface sans rien retoucher : le logo du jeu se
    pose ensuite net sur la carte, à sa taille, sans voile sombre en
    dessous. Une nouvelle version de l'illustration doit donc arriver déjà
    sans titre — ou être rognée pareil.
  - Pas de « carte survolée » à fournir : le survol éclaire le parchemin
    peint (`backdrop-filter`) au lieu de le remplacer.

Respecter la direction artistique verrouillée (voir
`public/assets/README.md` et `public/assets/cards/README.md`) : maritime
sombre, picturale, palette bleu nuit / bleu pétrole / turquoise désaturé /
gris ardoise / blanc écume, tons chauds réservés aux points de contraste.
