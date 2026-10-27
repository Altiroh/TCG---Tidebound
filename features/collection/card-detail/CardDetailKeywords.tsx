import { KEYWORD_DESCRIPTIONS, keywordLabel } from "@/features/match/cardDisplay";
import { glossaryTermsIn } from "@/features/match/keywordGlossary";
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
 *
 * S'y ajoutent les mots-clés CITÉS par le texte (Sabordage, Chaîne, Pied
 * marin… — `glossaryTermsIn`), hors qualifications, listées à part.
 */
export function CardDetailKeywords({ keywords, text }: { keywords: string[]; text?: string }) {
  const chips: Array<{ label: string; description?: string }> = keywords.map((keyword) => ({
    label: keywordLabel(keyword),
    description: KEYWORD_DESCRIPTIONS[keyword],
  }));
  for (const term of glossaryTermsIn(text)) {
    if (!term.qualification && !chips.some((chip) => chip.label === term.label)) chips.push(term);
  }
  if (chips.length === 0) return null;
  return (
    <section>
      <span className={styles.sectionLabel}>Mots-clés</span>
      <div className={styles.keywords}>
        {chips.map(({ label, description }) => {
          const chip = <span className={`${styles.keyword} ${description ? styles.keywordDefined : ""}`}>{label}</span>;

          return description ? (
            <Tooltip key={label} content={description} clickToOpen={false}>
              <span tabIndex={0} aria-label={`${label} : ${description}`} className="rounded-full">
                {chip}
              </span>
            </Tooltip>
          ) : (
            <span key={label}>{chip}</span>
          );
        })}
      </div>
    </section>
  );
}
