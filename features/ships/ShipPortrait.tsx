import { SHIP_DATABASE, type ShipDefinition } from "@/game";
import { SHIP_FRAME_SRC, SHIP_ILLUSTRATION_CLIP, SHIP_ILLUSTRATION_ZONE, SHIP_PLATE_TOP, shipIllustrationUrl } from "@/features/ships/shipFrame";
import styles from "@/features/ships/ShipPortrait.module.css";

/** `null` au lieu de l'exception de `getShipDefinition` : un deck sauvegardé avec un `ship_id` retiré du jeu ne doit pas casser une liste entière. */
export function findShip(shipId: string): ShipDefinition | null {
  return SHIP_DATABASE.get(shipId) ?? null;
}

/** Nom lisible d'un Navire, `shipId` brut si inconnu — jamais d'exception à l'affichage. */
export function shipNameOf(shipId: string): string {
  return findShip(shipId)?.name ?? "Navire inconnu";
}

interface ShipPortraitProps {
  shipId: string;
  /** Largeur en px, ou n'importe quelle largeur CSS (`"100%"`) — la hauteur suit le ratio réel du cadre. */
  width?: number | string;
  /** Nom du Navire gravé sur la plaque basse du cadre. */
  showName?: boolean;
  className?: string;
}

/**
 * Le Navire d'un deck, tel qu'il apparaît sur le plateau : la même
 * illustration dans le même cadre en arche (`ship-frame-empty.webp`), sans
 * les médaillons de ressources — la plaque porte le nom. Identité visuelle
 * du deck partout hors partie : éditeur, liste, sélection avant une partie.
 */
export function ShipPortrait({ shipId, width = 120, showName = true, className }: ShipPortraitProps) {
  const ship = findShip(shipId);

  return (
    <div className={`${styles.portrait}${className ? ` ${className}` : ""}`} style={{ width }}>
      <div className={styles.window} style={{ ...SHIP_ILLUSTRATION_ZONE, clipPath: SHIP_ILLUSTRATION_CLIP }}>
        {ship?.illustration ? (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, une par Navire
          <img src={shipIllustrationUrl(ship.illustration)} alt="" draggable={false} className={styles.illustration} />
        ) : (
          <div className={styles.unknown} aria-hidden />
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- élément décoratif de mise en page fixe */}
      <img src={SHIP_FRAME_SRC} alt="" aria-hidden draggable={false} className={styles.frame} />
      {showName && (
        <span className={styles.name} style={{ top: SHIP_PLATE_TOP }}>
          {ship?.name ?? "Navire inconnu"}
        </span>
      )}
    </div>
  );
}
