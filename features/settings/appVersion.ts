/**
 * LA VERSION DU JEU, telle qu'on la montre au joueur.
 *
 * Elle sert à une seule chose, et c'est une chose importante : quand
 * quelqu'un signale un problème, savoir CE QUI TOURNE chez lui. Une
 * capture d'écran des Options suffit alors à dire si le correctif est
 * déjà déployé ou non.
 *
 * Les deux valeurs sont figées à la construction par `next.config.mjs` :
 * la version vient de `package.json`, le commit de Vercel. En local, le
 * commit est vide — il n'y a rien à dater.
 */

/** Numéro de version, ou `0.0.0` si la construction ne l'a pas fourni. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

/** Sept caractères du commit déployé, vide hors déploiement. */
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT || "";

/**
 * La ligne affichée : « Tidebound 0.1.0 » en local, « Tidebound 0.1.0 ·
 * a1b2c3d » en déploiement. Le commit est un DÉTAIL de diagnostic, jamais
 * le sujet — d'où le point médian et la seconde place.
 */
export function appVersionLabel(): string {
  return APP_COMMIT ? `Tidebound ${APP_VERSION} · ${APP_COMMIT}` : `Tidebound ${APP_VERSION}`;
}
