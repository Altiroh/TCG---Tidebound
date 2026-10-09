import { BIG_CARD_MIN_COST, LONG_MATCH_TURNS, LOW_ANCHOR_THRESHOLD } from "@/game/quests/catalog";

/**
 * STATISTIQUES DU JOUEUR — ce que l'onglet « Statistiques » du profil
 * affiche, rangé par rubrique. Module pur : il ne fait que lire les
 * compteurs déjà chargés pour les exploits (`AchievementStats`) et les
 * mettre en mots.
 *
 * Deux sources, et chacune dit ce qu'elle sait :
 *   - la PROGRESSION (`matchesPlayed`, `wins`, `losses`) compte toutes les
 *     parties depuis la création du compte : c'est elle qui tient le bilan ;
 *   - les COMPTEURS À VIE (`player_lifetime_stats`, clés de
 *     `game/quests/matchStats.ts`) racontent le détail, depuis leur arrivée
 *     — et le temps de jeu, depuis la sienne. Une rubrique n'affiche jamais
 *     un chiffre déduit de l'autre source.
 */

export interface PlayerStatsInput {
  matchesPlayed: number;
  wins: number;
  losses: number;
  level: number;
  distinctCardsOwned: number;
  boostersOpened: number;
  /** Cumuls à vie, par clé. */
  lifetime: Record<string, number>;
  /** Meilleure partie, par clé (records et cumuls). */
  records: Record<string, number>;
}

export interface PlayerStatRow {
  key: string;
  label: string;
  value: string;
  /** Précision affichée sous le libellé. */
  hint?: string;
}

export interface PlayerStatSection {
  id: string;
  title: string;
  rows: PlayerStatRow[];
}

export interface PlayerStatsSheet {
  /** Les chiffres phares, en tête de page. */
  highlights: PlayerStatRow[];
  sections: PlayerStatSection[];
}

const number = new Intl.NumberFormat("fr-FR");

export function formatCount(value: number): string {
  return number.format(Math.max(0, Math.round(value)));
}

/** « 3 h 07 », « 12 min », « 45 s » — le temps de jeu tel qu'un joueur le lit. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${formatCount(hours)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** Part en pourcentage, « — » sans dénominateur. */
export function formatRate(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)} %`;
}

export function buildPlayerStatsSheet(input: PlayerStatsInput): PlayerStatsSheet {
  const sum = (key: string) => input.lifetime[key] ?? 0;
  const best = (key: string) => input.records[key] ?? 0;
  const count = (key: string, label: string, hint?: string): PlayerStatRow => ({ key, label, value: formatCount(sum(key)), hint });
  const record = (key: string, label: string, hint?: string): PlayerStatRow => ({ key: `record:${key}`, label, value: formatCount(best(key)), hint });

  const detailedMatches = sum("play_matches");
  const seconds = sum("play_seconds");

  const highlights: PlayerStatRow[] = [
    { key: "matches", label: "Parties jouées", value: formatCount(input.matchesPlayed) },
    { key: "wins", label: "Victoires", value: formatCount(input.wins) },
    { key: "win_rate", label: "Taux de victoire", value: formatRate(input.wins, input.wins + input.losses) },
    { key: "play_seconds", label: "Temps de jeu", value: formatDuration(seconds) },
    { key: "play_creatures", label: "Créatures invoquées", value: formatCount(sum("play_creatures") + sum("summon_units")) },
    { key: "deal_damage", label: "Dégâts infligés", value: formatCount(sum("deal_damage")) },
  ];

  const sections: PlayerStatSection[] = [
    {
      id: "parties",
      title: "Parties",
      rows: [
        { key: "matches", label: "Parties jouées", value: formatCount(input.matchesPlayed) },
        { key: "wins", label: "Victoires", value: formatCount(input.wins) },
        { key: "losses", label: "Défaites", value: formatCount(input.losses) },
        count("draw_matches", "Matchs nuls"),
        {
          key: "pvp",
          label: "Contre des joueurs",
          value: `${formatCount(sum("win_pvp_matches"))} / ${formatCount(sum("play_pvp_matches"))}`,
          hint: "victoires / parties",
        },
        {
          key: "bot",
          label: "Contre le bot",
          value: `${formatCount(sum("win_bot_matches"))} / ${formatCount(sum("play_bot_matches"))}`,
          hint: "victoires / parties",
        },
        {
          key: "first",
          label: "En jouant le premier tour",
          value: formatRate(sum("win_first"), sum("play_first")),
          hint: `${formatCount(sum("win_first"))} victoires sur ${formatCount(sum("play_first"))} parties`,
        },
        { key: "play_seconds", label: "Temps de jeu", value: formatDuration(seconds) },
        {
          key: "avg_seconds",
          label: "Durée moyenne d'une partie",
          value: sum("play_pvp_matches") + sum("play_bot_matches") > 0 ? formatDuration(seconds / (sum("play_pvp_matches") + sum("play_bot_matches"))) : "—",
        },
        count("own_turns", "Tours joués"),
        count("long_matches", "Longues parties", `au moins ${LONG_MATCH_TURNS} tours de table`),
      ],
    },
    {
      id: "cartes",
      title: "Cartes",
      rows: [
        count("play_cards", "Cartes jouées"),
        count("play_creatures", "Créatures jouées"),
        count("summon_units", "Unités invoquées par un effet"),
        count("play_marins", "Marins joués"),
        count("play_structures", "Structures jouées"),
        count("play_objects", "Objets joués"),
        count("play_equipments", "Équipements joués"),
        count("play_anomalies", "Anomalies jouées"),
        count("play_big_cards", "Grosses cartes jouées", `${BIG_CARD_MIN_COST} Raison ou plus`),
        count("break_objects", "Objets Brisés"),
        count("draw_cards", "Cartes piochées"),
        count("discard_cards", "Cartes défaussées"),
        count("spend_reason", "Raison engagée", "coût des cartes jouées"),
        count("gain_reason_from_cards", "Raison récupérée par des cartes"),
      ],
    },
    {
      id: "combat",
      title: "Combat",
      rows: [
        count("attacks", "Attaques"),
        count("direct_attacks", "Attaques sur le Navire adverse"),
        count("deal_damage", "Dégâts infligés"),
        count("deal_ship_damage", "Dégâts au Navire adverse"),
        count("take_damage", "Dégâts subis"),
        count("take_ship_damage", "Dégâts subis par votre Navire"),
        count("heal_anchor", "Ancrage récupéré"),
        count("destroy_enemy_units", "Unités adverses détruites"),
        count("destroy_enemy_structures", "Structures adverses détruites"),
        count("lose_units", "Unités perdues"),
        count("scuttle_permanents", "Permanents sabordés"),
        count("spring_traps", "Pièges déclenchés"),
        count("activate_reactions", "Réactions activées"),
        count("intercept_attacks", "Attaques interceptées"),
      ],
    },
    {
      id: "maree",
      title: "Marée, Déraison et Navire",
      rows: [
        count("modify_tide", "Modifications de Marée"),
        count("reach_tempete", "Entrées en Tempête"),
        count("reach_abysses", "Plongées aux Abysses"),
        count("turns_in_tempete", "Tours commencés en Tempête"),
        count("deraison_turns", "Tours finis en Déraison"),
        count("deraison_debt", "Dette de Déraison réglée"),
        count("ship_ability_uses", "Capacités de Navire activées"),
        count("ship_ability_damage", "Dégâts des capacités de Navire"),
      ],
    },
    {
      id: "victoires",
      title: "Façons de gagner",
      rows: [
        count("lethal_by_attack", "Coup fatal à l'attaque"),
        count("lethal_by_effect", "Coup fatal par un effet"),
        count("lethal_by_ship_ability", "Coup fatal du Navire"),
        count("lethal_by_tide", "Adversaire emporté par la Marée"),
        count("lethal_by_deraison", "Adversaire coulé par sa Déraison"),
        count("exact_lethal", "Au point exact", "Ancrage adverse ramené à 0 pile"),
        count("win_by_ocean_judgment", "Jugement de l'Océan"),
        count("win_by_concede", "Par abandon adverse"),
        count("win_within_5_turns", "En 5 tours ou moins"),
        count("win_without_losing_unit", "Sans perdre une unité"),
        count("win_without_ship_damage", "Sans une égratignure au Navire"),
        count("win_after_low_anchor", "Après être tombé bas", `${LOW_ANCHOR_THRESHOLD} Ancrage ou moins`),
      ],
    },
    {
      id: "records",
      title: "Records",
      rows: [
        record("deal_damage", "Dégâts en une partie"),
        record("max_damage_in_turn", "Dégâts en un tour"),
        record("max_single_hit", "Plus gros coup"),
        record("destroy_enemy_units", "Unités détruites en une partie"),
        record("max_enemy_units_destroyed_in_turn", "Unités détruites en un tour"),
        record("max_destroyed_at_once", "Unités détruites d'un coup"),
        record("max_cards_played_in_turn", "Cartes jouées en un tour"),
        record("play_creatures", "Créatures jouées en une partie"),
        record("max_deraison_debt", "Plus grosse dette de Déraison"),
        record("max_win_anchor", "Ancrage restant après une victoire"),
        record("own_turns", "Plus longue partie", "en tours joués"),
        { key: "record:play_seconds", label: "Plus longue partie", value: best("play_seconds") > 0 ? formatDuration(best("play_seconds")) : "—", hint: "en temps" },
      ],
    },
    {
      id: "compte",
      title: "Compte et collection",
      rows: [
        { key: "level", label: "Niveau", value: formatCount(input.level) },
        { key: "distinct_cards", label: "Cartes différentes possédées", value: formatCount(input.distinctCardsOwned) },
        { key: "boosters", label: "Boosters ouverts", value: formatCount(input.boostersOpened) },
        { key: "detailed_matches", label: "Parties au détail", value: formatCount(detailedMatches), hint: "comptées depuis l'arrivée des statistiques détaillées" },
      ],
    },
  ];

  return { highlights, sections };
}
