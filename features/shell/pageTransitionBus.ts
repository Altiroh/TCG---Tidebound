/**
 * Point d'entrée de l'ombre de changement de page pour une navigation qui ne
 * passe pas par un lien : un bouton qui appelle `router.push` (onglets et
 * retour du bandeau). `PageTransition` s'y inscrit au montage.
 *
 * Module à part, sans React : un appelant n'a pas à importer le composant.
 */

type Starter = (href: string) => boolean;

let starter: Starter | null = null;

/** Réservé à `PageTransition`. Retourne de quoi se désinscrire. */
export function registerPageTransition(start: Starter): () => void {
  starter = start;
  return () => {
    if (starter === start) starter = null;
  };
}

/**
 * Lance l'ombre puis navigue vers `href`. Retourne `false` quand la
 * transition n'a pas lieu (composant absent, mouvements réduits, même page) :
 * l'appelant navigue alors lui-même, sans attendre.
 */
export function navigateWithTransition(href: string): boolean {
  return starter?.(href) ?? false;
}
