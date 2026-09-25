# Profil

La page `/profil` : la cabine du navire (`features/progression/ProfileScene.tsx`,
`ProfileScreen.module.css`) et le popup de série (`DailyStreakPopup.tsx`).
Découpé le 25/09/2026 des planches déposées dans `menu/` (retirées ensuite,
pas de PNG commité).

- `background.webp` (1855 × 848) : la cabine, décor plein écran de la page.
- `photo-frame.webp` (419 × 454) : la photo inclinée. Sa fenêtre — centre
  48,7 % / 43,3 %, 71,2 % × 59,5 %, −11,3° — reçoit l'illustration choisie
  par le joueur ; sans choix, le portrait peint reste.
- `level-ring.webp` (443 × 442) : l'anneau du niveau ; l'arc d'XP est tracé
  par l'app à l'intérieur.
- `stat-diamond.webp` (331 × 327) : un losange de ressource (×4).
- `parchment-panel.webp` (525 × 254) : les prochaines escales (paliers).
- `dark-panel.webp` (570 × 211) : les escales de connexion.
- `cannon.webp` : le canon du premier plan, en bas à gauche.
- `icon-parties.webp`, `icon-streak.webp` : les icônes Parties et Série
  (aussi la flamme du popup de série).

Les positions sont celles de la maquette, en pourcentages de la scène
(1855 × 778, bandeau exclu) : `ProfileScene.module.css`.
