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
  `buttons/repos/jouer.png`, `buttons/survol/jouer.png`,
  `buttons/actif/jouer.png`.
- `icons/` : icônes diverses hors bouton — rouage (paramètres), pochette
  (deck), etc. Nommer par fonction, ex: `parametres.png`, `deck.png`.
- `logo/` : logo / wordmark "Tidebound" (actuellement du texte brut, `<h1>`).

Respecter la direction artistique verrouillée (voir
`public/assets/README.md` et `public/assets/cards/README.md`) : maritime
sombre, picturale, palette bleu nuit / bleu pétrole / turquoise désaturé /
gris ardoise / blanc écume, tons chauds réservés aux points de contraste.
