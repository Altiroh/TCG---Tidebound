"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { CSSProperties } from "react";
import styles from "@/components/menu/MenuCarte.module.css";
import { playButtonClick } from "@/lib/sound";

/**
 * MENU « CARTE MARINE » — variante d'accueil en cours d'évaluation.
 *
 * Une table de navigateur vue de haut : la carte punaisée, et trois
 * parchemins qui mènent aux trois destinations du jeu.
 *
 * La scène est MONTÉE, pas peinte d'un bloc : un fond (la table et sa
 * carte), trois calques de décor détourés, et trois parchemins qui ont
 * chacun leur version allumée. Tout est posé en pourcentages du FOND, la
 * seule géométrie de référence — c'est ce qui garde la composition
 * identique d'un écran à l'autre, et ce qui permet de recaler un calque en
 * touchant une seule ligne (`?menu=carte&reperes=1` trace les boîtes).
 *
 * L'ancien menu (le coffret, `TideboundMenuChest`) reste celui par défaut :
 * celui-ci s'ouvre depuis le bouton d'aperçu de l'accueil (`?menu=carte`),
 * le temps de trancher.
 */

/** Les calques de ce menu, nommés une fois. */
export const MENU_CARTE_ASSETS = {
  fond: "/assets/menu/carte/home-background.webp",
  gauche: "/assets/menu/carte/left-asset.webp",
  droite: "/assets/menu/carte/right-asset.webp",
  longueVue: "/assets/menu/carte/longue-vue-bottom.webp",
  logo: "/assets/menu/logo/tidebound-logo.webp",
} as const;

interface CarteSlot {
  id: string;
  label: string;
  href: Route | string;
  /** Le parchemin au repos, puis sa version allumée (halo doré). */
  art: string;
  artSurvol: string;
  /** Taille du calque : Next en tire le rapport sans charger l'image. */
  taille: { w: number; h: number };
  /** Coin haut-gauche et largeur du calque, en pourcentages du fond. */
  boite: { x: string; y: string; w: string };
}

const SLOTS: CarteSlot[] = [
  // « Cartes » dans le bandeau, « Collection » sur le parchemin : c'est le
  // catalogue de cartes, pas l'ensemble de la collection du joueur.
  {
    id: "collection",
    label: "Collection",
    href: "/collection",
    art: "/assets/menu/carte/collection.webp",
    artSurvol: "/assets/menu/carte/collection-hover.webp",
    taille: { w: 1097, h: 1156 },
    boite: { x: "14.8%", y: "40.4%", w: "19.7%" },
  },
  {
    id: "jouer",
    label: "Jouer",
    href: "/partie",
    art: "/assets/menu/carte/play.webp",
    artSurvol: "/assets/menu/carte/play-hover.webp",
    taille: { w: 1358, h: 958 },
    boite: { x: "35.1%", y: "41.8%", w: "28.5%" },
  },
  // Le Market, c'est la BOUTIQUE (achat en Tides) ; la réserve de boosters
  // et leur ouverture sont un écran voisin, atteignable depuis le bandeau.
  {
    id: "market",
    label: "Market",
    href: "/market",
    art: "/assets/menu/carte/market.webp",
    artSurvol: "/assets/menu/carte/market-hover.webp",
    taille: { w: 1103, h: 1124 },
    boite: { x: "65.8%", y: "46.8%", w: "18.5%" },
  },
];

/** `true` trace le contour des calques : le gabarit de calage. */
export function TideboundMenuCarte({ marks = false }: { marks?: boolean }) {
  return (
    <div
      className={`${styles.scene} ${marks ? styles.marks : ""}`}
      style={{ "--plate-image": `url(${MENU_CARTE_ASSETS.fond})` } as CSSProperties}
    >
      {/* La scène déborde d'elle-même : pas de bande noire sur une fenêtre
          plus étroite que le fond. */}
      <div className={styles.spill} aria-hidden />

      {/* Accroché à l'écran et non à la scène : le recadrage d'un téléphone
          couché le coupait en deux (cf. `MenuCarte.module.css`). */}
      <Image
        src={MENU_CARTE_ASSETS.logo}
        alt="Tidebound"
        width={1600}
        height={631}
        priority
        draggable={false}
        className={styles.logo}
      />

      <div className={styles.stage}>
        <Image src={MENU_CARTE_ASSETS.fond} alt="" fill priority sizes="100vw" draggable={false} className={styles.fond} />

        {/* Le décor de la table : la pile de livres et la tarte à gauche, la
            peluche et ses gemmes à droite, la longue-vue en travers du bas.
            Purement décoratif — rien ne s'y clique. */}
        <Image
          src={MENU_CARTE_ASSETS.gauche}
          alt=""
          width={1100}
          height={1385}
          draggable={false}
          className={styles.propGauche}
        />
        <Image
          src={MENU_CARTE_ASSETS.droite}
          alt=""
          width={1337}
          height={1011}
          draggable={false}
          className={styles.propDroite}
        />
        <Image
          src={MENU_CARTE_ASSETS.longueVue}
          alt=""
          width={2119}
          height={683}
          draggable={false}
          className={styles.propLongueVue}
        />

        <nav aria-label="Menu Tidebound">
          {SLOTS.map((slot) => (
            <Link
              key={slot.id}
              href={slot.href as Route}
              className={styles.card}
              style={{ "--x": slot.boite.x, "--y": slot.boite.y, "--w": slot.boite.w } as CSSProperties}
              onClick={() => playButtonClick()}
            >
              <Image
                src={slot.art}
                alt=""
                width={slot.taille.w}
                height={slot.taille.h}
                priority
                draggable={false}
                className={styles.cardRepos}
              />
              {/* Le parchemin allumé, posé exactement sur l'autre : les deux
                  calques ont été rognés sur la même boîte, ils se
                  superposent au pixel. Chargé avec la page — un survol qui
                  attend son image se voit. */}
              <Image
                src={slot.artSurvol}
                alt=""
                width={slot.taille.w}
                height={slot.taille.h}
                priority
                draggable={false}
                className={styles.cardSurvol}
              />
              <span className={styles.cardLabel}>{slot.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
