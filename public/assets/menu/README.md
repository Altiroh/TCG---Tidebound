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
  (`/?menu=carte`, cf. `components/menu/TideboundMenuCarte.tsx`). La scène
  est MONTÉE en calques, pas peinte d'un bloc :
  - `home-background.webp` (1672 × 941) : la table et sa carte punaisée.
    C'est la GÉOMÉTRIE DE RÉFÉRENCE — tous les autres calques sont posés
    en pourcentages de celle-ci (`?menu=carte&reperes=1` trace leurs
    boîtes pour recaler).
  - `left-asset.webp`, `right-asset.webp`, `longue-vue-bottom.webp` : le
    décor détouré posé sur la table.
  - `collection.webp`, `play.webp`, `market.webp` et leur `-hover` : les
    trois parchemins, au repos et allumés.
  - `tasse-cafe.webp`, `cafe_surface_normal.webp`,
    `cafe_surface_variante.webp`, `fumee_variante_1/2/3.webp` : la tasse,
    le seul objet qui BOUGE. La surface du café est calée dans la tasse
    (64,3 % de sa largeur, à 8,95 % / 20,3 %) et les deux états s'y
    fondent l'un dans l'autre ; les trois volutes montent du café, chacune
    sur son cycle.
  - Les fichiers d'un même GROUPE (repos/survol, café calme/agité) sont
    rognés sur une boîte COMMUNE : c'est ce qui leur permet de se
    superposer au pixel une fois posés.

Respecter la direction artistique verrouillée (voir
`public/assets/README.md` et `public/assets/cards/README.md`) : maritime
sombre, picturale, palette bleu nuit / bleu pétrole / turquoise désaturé /
gris ardoise / blanc écume, tons chauds réservés aux points de contraste.
