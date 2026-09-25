# Récompenses — le hub du port

L'onglet Récompenses de `/profil` (`features/progression/RewardsHub.tsx`).
Découpé le 25/09/2026 des planches déposées dans `menu/` (retirées ensuite,
pas de PNG commité).

- `background.webp` (1672 × 941) : le port de nuit, décor plein écran.
- `palier.webp` (520 × 795) : une tuile de la route des paliers ; le niveau
  s'écrit dans l'hexagone du haut.
- `streak-panel.webp` (1100 × 335) : la série de connexion. Six hexagones
  PEINTS (centres à 20,7 % + 11,73 % × rang, 10 % de large) ; le 7ᵉ jour
  est dessiné par l'app en or sur la tache claire de droite (90,9 %).
- `chest-panel.webp` (1100 × 364) : le coffre hebdomadaire, coffre peint à
  droite — le contenu se pose sur les 60 % de gauche.
- `panel.webp` (1000 × 589) : panneau des blocs du bas (quêtes, Maîtrises,
  Commanditaires, objectifs).

Positions : pourcentages d'une scène 1672 × 880 (bandeau exclu),
`RewardsHub.module.css`.

## Coffre hebdomadaire (25/09/2026)

- `chest-panel.webp` (1400 × 466) : le panneau SANS coffre, rogné sur son cadre (source `tile-coffre.png`).
- `coffre/coffre-ferme.webp` : le coffre fermé (source `coffre.png`).
- `coffre/coffre-caisse.webp` et `coffre/coffre-couvercle.webp` : la vue éclatée `coffre ouvert.png`, séparée en deux calques (composantes connexes) au MÊME cadrage (820 × 749) — le couvercle saute à l'ouverture.
