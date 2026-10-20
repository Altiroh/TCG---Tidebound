# Modèles de mail Supabase

Les mails d'authentification se règlent dans le tableau de bord Supabase
(**Authentication › Emails › Templates**), pas par le code. Ces fichiers en
gardent la source : on copie le HTML dans le tableau de bord à chaque
changement.

| Fichier | Modèle Supabase | Sujet proposé |
|---|---|---|
| `confirmation.html` | Confirm signup | Confirmez votre adresse — Tidebound |

- L'illustration est servie par le site : `public/mail/confirmation.jpg`,
  appelée par `{{ .SiteURL }}/mail/confirmation.jpg`. `{{ .SiteURL }}` est
  l'URL du site réglée dans **Authentication › URL Configuration** : elle
  doit pointer sur le domaine de production, sinon l'image ne s'affiche pas.
- JPG et non WebP : plusieurs clients mail (Outlook notamment) n'affichent
  pas le WebP. Rangée hors de `public/assets/` pour que
  `scripts/optimizeImages.mjs` ne la convertisse pas.
- Le bouton HTML sous l'image reste le chemin sûr : beaucoup de clients
  bloquent les images tant qu'on ne les a pas autorisées.
