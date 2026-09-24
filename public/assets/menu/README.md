# Menu

Assets de l'écran d'accueil / menu principal (`app/page.tsx`). Pas de
spécification Notion dédiée — structure basée sur les besoins réels,
amenée à évoluer.

Le COFFRET 3D qui tenait cet écran a été retiré le 21/09/2026, avec ses
dossiers (`box/`, `buttons/`, `background/`, `panel/`) : la table du
navigateur (`carte/`) l'a remplacé. L'historique Git les garde.

- `icons/` : icônes diverses hors bouton — rouage (paramètres), pochette
  (deck), etc. Nommer par fonction, ex: `parametres.webp`, `deck.webp`.
- `logo/` : logo / wordmark "Tidebound" (actuellement du texte brut, `<h1>`).
- `carte/` : LE menu principal — la table du navigateur
  (`components/menu/TideboundMenuCarte.tsx`). La scène est MONTÉE en
  calques, pas peinte d'un bloc :
  - `home-background.webp` (1672 × 941) : la table et sa carte punaisée.
    C'est la GÉOMÉTRIE DE RÉFÉRENCE — tous les autres calques sont posés
    en pourcentages de celle-ci (`/?reperes=1` trace leurs boîtes pour
    recaler).
  - `left-asset.webp`, `right-asset.webp`, `longue-vue-bottom.webp` : le
    décor détouré posé sur la table.
  - `collection.webp`, `play.webp`, `market.webp` : les trois parchemins.
    UNE image chacun — le survol (lumière, saturation, halo épousant le
    bord déchiré) est peint par le navigateur, pas par une seconde
    illustration.
  - `tasse-cafe.webp`, `cafe_surface_normal.webp`,
    `cafe_surface_variante.webp`, `fumee_variante_1/2/3.webp` : la tasse,
    qui fume en continu. La surface du café est calée dans la tasse
    (64,3 % de sa largeur, à 8,95 % / 20,3 %) et les deux états s'y
    fondent l'un dans l'autre ; les trois volutes montent du café, chacune
    sur son cycle.
  - Plus de ride périodique sur le café : un CLIC sur le liquide y lance
    une onde (anneaux masqués par `cafe_surface_normal.webp`, la surface
    agitée s'y fond le temps de l'onde).
  - `groseille-1/2/3.webp` (intactes), `groseille-eclat-1/2/3.webp`
    (qui éclatent), `groseille-flaque-1/2.webp` (ce qui reste) : les
    groseilles qu'on écrase à côté de la tarte
    (`components/menu/MenuGroseilles.tsx`). Découpées d'une même planche
    (`groseilles-assets.png`, retirée après découpe) : même échelle.
  - Les fichiers d'un même GROUPE (repos/survol, café calme/agité) sont
    rognés sur une boîte COMMUNE : c'est ce qui leur permet de se
    superposer au pixel une fois posés.

Respecter la direction artistique verrouillée (voir
`public/assets/README.md` et `public/assets/cards/README.md`) : maritime
sombre, picturale, palette bleu nuit / bleu pétrole / turquoise désaturé /
gris ardoise / blanc écume, tons chauds réservés aux points de contraste.
