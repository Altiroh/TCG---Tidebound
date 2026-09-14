/**
 * Constantes de boosters partagées entre le serveur et l'écran.
 *
 * À part, et pas dans `actions.ts` : un fichier `"use server"` ne peut
 * exporter que des fonctions asynchrones (les Server Actions). Une valeur
 * dont les deux côtés ont besoin vit donc ici.
 */

/** Plus d'exemplaires que ça en un achat n'a aucun sens à l'écran — et borne ce qu'une requête forgée peut demander. */
export const MAX_PURCHASE_QUANTITY = 10;
