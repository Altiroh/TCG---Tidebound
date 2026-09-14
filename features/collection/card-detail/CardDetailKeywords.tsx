import { KEYWORD_DESCRIPTIONS, keywordLabel } from "@/features/match/cardDisplay";
import { Tooltip } from "@/components/game-ui/Tooltip";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

/**
 * Mots-clés universels portés par la carte (`CardDefinition.keywords`).
 *
 * Un mot-clé dont la règle est documentée (`KEYWORD_DESCRIPTIONS`) reçoit
 * une info-bulle — au survol comme au clic, le `Tooltip` du jeu gérant les
 * deux, ce qui couvre le tactile. Un mot-clé non documenté reste affiché
 * mais sans bulle : pas de définition inventée.
 *
 * Les mots-clés CONDITIONNELS (`conditionalKeywords`) ne sont
 * volontairement pas listés ici : leur condition n'est lisible que dans le
 * texte de la carte, qui l'énonce déjà mot pour mot juste au-dessus.
 */
export function CardDetailKeywords({ keywords }: { keywords: string[] }) {
  return (
    <section>
      <span className={styles.sectionLabel}>Mots-clés</span>
      <div className={styles.keywords}>
        {keywords.map((keyword) => {
          const description = KEYWORD_DESCRIPTIONS[keyword];
          const chip = (
            <span className={`${styles.keyword} ${description ? styles.keywordDefined : ""}`}>
              {keywordLabel(keyword)}
            </span>
          );

          return description ? (
            <Tooltip key={keyword} content={description} clickToOpen={false}>
              <span tabIndex={0} aria-label={`${keywordLabel(keyword)} : ${description}`} className="rounded-full">
                {chip}
              </span>
            </Tooltip>
          ) : (
            <span key={keyword}>{chip}</span>
          );
        })}
      </div>
    </section>
  );
}
