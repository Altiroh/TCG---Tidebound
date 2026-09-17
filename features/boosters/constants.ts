/**
 * Constantes de boosters partagées entre le serveur et l'écran.
 *
 * À part, et pas dans `actions.ts` : un fichier `"use server"` ne peut
 * exporter que des fonctions asynchrones (les Server Actions). Une valeur
 * dont les deux côtés ont besoin vit donc ici.
 */

/**
 * Borne d'un achat unique : haute pour ne pas gêner un achat en gros
 * (décision du 2026-09-17, l'ancienne borne de 10 bloquait les joueurs),
 * mais bornée quand même — c'est elle qui limite ce qu'une requête forgée
 * peut demander, et le total reste payé en Jetons/Tides par le serveur.
 */
export const MAX_PURCHASE_QUANTITY = 99;

/**
 * Sachets ouverts d'un seul geste. Chaque sachet est tiré ET écrit
 * séparément (le pity, les doublons et la collection évoluent d'un sachet
 * au suivant) : un lot plus grand multiplierait d'autant les allers-retours
 * en base pour une seule attente du joueur.
 */
export const MAX_BATCH_OPEN = 10;
