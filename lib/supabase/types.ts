/**
 * Types de la base de données, écrits à la main pour correspondre aux
 * migrations de `supabase/migrations/` (`..._init.sql`,
 * `..._cards_collection_economy.sql`, `..._progression_and_boosters.sql`,
 * `..._private_match_state.sql`, `..._quests.sql`). À remplacer/régénérer une fois le
 * projet lié au CLI Supabase :
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/types.ts
 *
 * Volontairement PARTIEL : ne couvre que les tables et colonnes
 * effectivement requêtées depuis du code TypeScript à ce jour. Les tables
 * encore sans Server Action (quêtes, onboarding, historique d'ouverture)
 * et les colonnes non lues restent absentes plutôt que devinées : les
 * typer avant d'en avoir l'usage réel ferait courir un risque de dérive
 * silencieuse avec le schéma SQL.
 *
 * Les tables autoritaires (collection, boosters, monnaie, progression) sont
 * déclarées en lecture seule (`Insert`/`Update` à `Record<string, never>`) :
 * leurs écritures passent EXCLUSIVEMENT par les fonctions Postgres
 * atomiques listées dans `Functions`. Le type rend donc une écriture
 * directe impossible à compiler, ce qui est le comportement voulu.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          /** Carte servant d'illustration de profil — toujours une carte possédée (`set_profile_identity`). */
          avatar_card_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_card_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_card_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          invite_code: string;
          player1_id: string;
          player2_id: string | null;
          player1_deck_id: string;
          player2_deck_id: string | null;
          /**
           * Version de l'état privé (`match_states.version`), 0 tant que la partie attend un second joueur.
           * Seule trace de l'état diffusée en Realtime : quand elle change, le client redemande sa vue.
           */
          state_version: number;
          status: "waiting" | "active" | "finished" | "abandoned";
          winner_id: string | null;
          mode: "private_invite" | "matchmaking" | "bot";
          is_vs_bot: boolean;
          bot_difficulty: "facile" | "moyen" | "difficile" | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        /**
         * Uniquement pour créer une partie EN ATTENTE (invitation privée), avec la clé service_role : une partie
         * déjà commencée passe par `create_active_match`, qui écrit l'état privé dans la même transaction.
         */
        Insert: {
          id?: string;
          invite_code: string;
          player1_id: string;
          player1_deck_id: string;
          status?: "waiting";
          mode?: "private_invite";
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      /** État COMPLET des parties — lisible par le serveur seul (aucune policy RLS), jamais envoyé tel quel à un client. */
      match_states: {
        Row: {
          match_id: string;
          /** `GameState` complet (`game/state/types.ts`). */
          state: unknown;
          version: number;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      quests: {
        Row: {
          id: string;
          code: string | null;
          /** Nom joueur de la quête (« Prendre le large ») — miroir de `QuestDefinition.name`. */
          name: string | null;
          /** Catégorie d'interface : cartes | parties | decks | stats | maree. */
          category: string | null;
          /** `sum` (cumul) ou `set` (valeurs distinctes). */
          progress_kind: "sum" | "set";
          /** XP accordée à la réclamation, en plus des Tides. */
          reward_xp: number;
          quest_type: "daily" | "weekly";
          objective_key: string;
          target_value: number;
          reward_currency: number;
          reward_booster_definition_id: string | null;
          bot_progress_allowed: boolean;
          is_enabled: boolean;
        };
        /** Écrit uniquement par `scripts/seedCards.ts` (miroir de `game/quests/catalog.ts`). */
        Insert: {
          code: string;
          quest_type: "daily" | "weekly";
          objective_key: string;
          target_value: number;
          reward_currency: number;
          reward_booster_definition_id: string | null;
          bot_progress_allowed: boolean;
          is_enabled: boolean;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      player_quest_progress: {
        Row: {
          user_id: string;
          quest_id: string;
          period_key: string;
          progress_value: number;
          completed_at: string | null;
          claimed_at: string | null;
          assigned_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      matchmaking_queue: {
        Row: {
          user_id: string;
          deck_id: string;
          queued_at: string;
        };
        Insert: {
          user_id: string;
          deck_id: string;
          queued_at?: string;
        };
        Update: {
          user_id?: string;
          deck_id?: string;
          queued_at?: string;
        };
        Relationships: [];
      };
      player_cards: {
        Row: {
          user_id: string;
          card_id: string;
          quantity: number;
          first_obtained_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          card_id: string;
          quantity?: number;
          first_obtained_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          card_id?: string;
          quantity?: number;
          first_obtained_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      player_decks: {
        Row: {
          art_card_id: string | null;
          id: string;
          user_id: string;
          ship_id: string;
          name: string;
          is_valid: boolean;
          created_at: string;
          updated_at: string;
          /** Mise à la corbeille (« Récemment supprimés ») ; `null` = deck actif. Effacé 30 jours après, par l'application. */
          deleted_at: string | null;
          /** Deck présélectionné à l'écran Jouer — un seul par joueur (index partiel unique). */
          is_default: boolean;
          /** Résumé libre écrit par le joueur (migration 20260928120000) ; `null` = repli générique. */
          description: string | null;
          /**
           * Profil ÉCRIT par le joueur (migration 20260930120000). `null` =
           * « laisse le jeu deviner » : l'application retombe alors sur
           * `deckProfile`, déduit des cartes.
           */
          style: string | null;
          difficulty: number | null;
          mechanics: string[] | null;
        };
        Insert: {
          art_card_id?: string | null;
          id?: string;
          user_id: string;
          ship_id: string;
          name: string;
          is_valid?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          is_default?: boolean;
          description?: string | null;
          style?: string | null;
          difficulty?: number | null;
          mechanics?: string[] | null;
        };
        Update: {
          art_card_id?: string | null;
          id?: string;
          user_id?: string;
          ship_id?: string;
          name?: string;
          is_valid?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          is_default?: boolean;
          description?: string | null;
          style?: string | null;
          difficulty?: number | null;
          mechanics?: string[] | null;
        };
        Relationships: [];
      };
      player_deck_cards: {
        Row: {
          deck_id: string;
          card_id: string;
          quantity: number;
        };
        Insert: {
          deck_id: string;
          card_id: string;
          quantity: number;
        };
        Update: {
          deck_id?: string;
          card_id?: string;
          quantity?: number;
        };
        Relationships: [];
      };

      /**
       * Miroir serveur du catalogue (`scripts/seedCards.ts`). Seules les
       * colonnes réellement lues par les systèmes de collection/boosters
       * sont typées ici ; la table en a davantage.
       */
      cards: {
        Row: {
          id: string;
          name: string;
          card_type: CardTypeEnum;
          rarity: CardRarityEnum;
          rarity_weight: number;
          max_copies: number;
          is_collectible: boolean;
          is_enabled: boolean;
          set_code: string;
        };
        Insert: {
          id: string;
          name: string;
          card_type: CardTypeEnum;
          rarity?: CardRarityEnum;
          rarity_weight?: number;
          max_copies?: number;
          is_collectible?: boolean;
          is_enabled?: boolean;
          set_code?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      booster_definitions: {
        Row: {
          id: string;
          name: string;
          card_count: number;
          price_currency: number | null;
          is_purchasable: boolean;
          is_enabled: boolean;
          /** Raretés retirées du pool de CE booster (ex: pas d'Abyssale dans le Mini Booster de Bienvenue). */
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      booster_slots: {
        Row: {
          booster_definition_id: string;
          slot_index: number;
          guaranteed_rarity: CardRarityEnum | null;
          /** Pondération multi-rareté (slot Profondeur) : `{"uncommon": 55, ...}`. */
          weighted_rarities: Partial<Record<CardRarityEnum, number>> | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      player_boosters: {
        Row: {
          user_id: string;
          booster_definition_id: string;
          quantity: number;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      player_pity: {
        Row: {
          user_id: string;
          booster_definition_id: string;
          packs_since_abyssal: number;
          /** Boosters sans nouveauté (migration 20260925120000_new_card_pity.sql). */
          packs_since_new_card: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          booster_definition_id: string;
          packs_since_new_card?: number;
        };
        Update: {
          packs_since_new_card?: number;
        };
        Relationships: [];
      };
      player_currency: {
        Row: {
          user_id: string;
          balance: number;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      player_progression: {
        Row: {
          user_id: string;
          xp_total: number;
          level: number;
          matches_played: number;
          pvp_wins: number;
          /** Jour UTC (`YYYY-MM-DD`) de la dernière victoire PvP, ou `null`. */
          last_pvp_win_day: string | null;
          /** Jour UTC de la dernière victoire TOUS MODES — porte le bonus de première victoire du jour. */
          last_win_day: string | null;
          /** Journée UTC à laquelle `daily_matches_count` se rapporte. */
          daily_matches_day: string | null;
          /** Parties terminées ce jour-là — bonus « 3 parties dans la journée ». */
          daily_matches_count: number;
          /** Jetons de Préconstruit disponibles (Notion « Progression joueur » §4). */
          precon_tokens: number;
          play_streak_day: string | null;
          play_streak: number;
          best_play_streak: number;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Paliers de niveau déjà octroyés — la clé primaire est l'anti-double-claim. */
      player_level_rewards: {
        Row: {
          user_id: string;
          level: number;
          granted: unknown;
          granted_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Progression de quêtes d'une partie, et son relevé lisible. */
      match_quest_progress: {
        Row: { match_id: string; user_id: string; progress: Record<string, number>; quest_recap: QuestRecapRow[] };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Traversées : progression par joueur (`20261007120000_voyages.sql`). */
      player_voyages: {
        Row: {
          user_id: string;
          voyage_id: string;
          step_index: number;
          step_progress: number;
          step_meta: string[];
          claimed_tiers: number;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Traversées : idempotence par partie, et relevé pour l'écran de fin. */
      match_voyage_progress: {
        Row: { match_id: string; user_id: string; voyage_recap: VoyageRecapRow | Record<string, never> };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Quelles cartes peuvent tomber dans quel booster — source d'autorité de l'éligibilité. */
      booster_pool_cards: {
        Row: {
          booster_definition_id: string;
          card_id: string;
          is_enabled: boolean;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        // Déclarée pour que `select("card_id, cards!inner(...)")` soit typé :
        // sans elle, le client ne sait pas relier les deux tables.
        Relationships: [
          {
            foreignKeyName: "booster_pool_cards_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Titre porté par le joueur — une ligne au plus, écrite par `set_player_title` seulement. */
      player_titles: {
        Row: {
          user_id: string;
          title_id: string;
          equipped_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      player_cosmetics: {
        Row: {
          user_id: string;
          cosmetic_kind: string;
          cosmetic_id: string;
          label: string;
          equipped: boolean;
          unlocked_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Choix « carte au choix parmi N » ouverts par un palier, propositions figées. */
      player_card_choices: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          source_ref: string;
          rarity: CardRarityEnum;
          offered_card_ids: string[];
          chosen_card_id: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Cycle de connexion — une ÉTAPE, jamais un streak à réinitialiser. */
      /** Récompenses du hub prises (coffre de la semaine, palier de Maîtrise, colis) — migration 20261009120000. */
      player_progression_claims: {
        Row: { user_id: string; kind: "weekly_chest" | "mastery" | "sponsor_gift"; claim_key: string; claimed_at: string };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Intérêt cumulé de chaque Commanditaire pour le joueur. */
      player_sponsor_interest: {
        Row: { user_id: string; sponsor_id: string; points: number; updated_at: string };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      player_login_rewards: {
        Row: {
          user_id: string;
          step: number;
          last_claimed_day: string | null;
          total_claims: number;
          /** Jours consécutifs réclamés (migration 20261008120000). */
          streak: number;
          best_streak: number;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      player_achievements: {
        Row: {
          user_id: string;
          code: string;
          tides_granted: number;
          unlocked_at: string;
          /** `null` : exploit débloqué dont les Tides attendent d'être réclamées. */
          claimed_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /** Préconstruits débloqués. `source` dit par quelle PORTE : le choix gratuit
       *  (`borrowed`, nom historique, un seul par compte) ou un Jeton. */
      player_deck_unlocks: {
        Row: {
          user_id: string;
          deck_id: string;
          source: "borrowed" | "precon_token";
          unlocked_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      player_quest_rerolls: {
        Row: {
          user_id: string;
          period_key: string;
          used: number;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      player_onboarding: {
        Row: {
          user_id: string;
          tutorial_status: "not_started" | "completed" | "skipped";
          tutorial_reward_claimed: boolean;
          starter_standard_booster_claimed: boolean;
          starter_currency_granted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      booster_openings: {
        Row: {
          id: string;
          user_id: string;
          booster_definition_id: string;
          opened_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      match_rewards: {
        Row: {
          match_id: string;
          user_id: string;
          xp_granted: number;
          tides_granted: number;
          level_before: number;
          level_after: number;
          first_win_of_day: boolean;
          granted_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_progression_reward: {
        Args: {
          p_user_id: string;
          p_kind: "weekly_chest" | "mastery" | "sponsor_gift";
          p_key: string;
          p_tides?: number;
          p_booster_id?: string | null;
          p_card_id?: string | null;
        };
        Returns: { ok: boolean; error?: string };
      };
      record_sponsor_interest: {
        Args: { p_user_id: string; p_match_id: string; p_points: Record<string, number> };
        Returns: { ok: boolean; recorded?: boolean };
      };
      claim_matchmaking_opponent: {
        Args: Record<string, never>;
        Returns: { opponent_user_id: string; opponent_deck_id: string }[];
      };
      /**
       * Octroi atomique et idempotent des récompenses d'une partie.
       * Retourne `{ granted, xp_total, level }` — `granted: false` signifie
       * que cette partie avait déjà récompensé ce joueur.
       */
      grant_match_progression: {
        Args: {
          p_match_id: string;
          p_user_id: string;
          p_xp: number;
          p_tides: number;
          p_target_level: number;
          p_level_before: number;
          p_first_win_of_day: boolean;
          p_is_pvp_win: boolean;
          p_is_win: boolean;
          /** `false` pour une partie abandonnée : elle ne compte pas dans les 3 parties du jour. */
          p_counts_for_daily: boolean;
          /** `[{ level, items: LevelRewardItem[] }]` — chaque palier n'est appliqué qu'une fois. */
          p_level_rewards: unknown;
        };
        Returns: { granted: boolean; xp_total: number; level: number; precon_tokens_gained?: number; play_streak?: number };
      };
      purchase_booster: {
        Args: { p_user_id: string; p_booster_id: string; p_quantity?: number };
        Returns: { ok: boolean; error?: string; balance?: number; spent?: number };
      };
      /** Consomme le booster et crédite la collection ; le tirage vient de `game/boosters`. */
      open_booster: {
        Args: { p_user_id: string; p_booster_id: string; p_card_ids: string[] };
        Returns: {
          ok: boolean;
          error?: string;
          opening_id?: string;
          abyssal_pulled?: boolean;
          packs_since_abyssal?: number;
        };
      };
      /**
       * Revend des exemplaires EN DOUBLE. `p_unit_value` vient de
       * `RECYCLE_VALUE` (`game/boosters/constants.ts`) : le barème vit dans
       * le catalogue TypeScript, la base garantit possession et intégrité.
       */
      recycle_card: {
        Args: { p_user_id: string; p_card_id: string; p_quantity: number; p_unit_value: number; p_min_keep: number };
        Returns: { ok: boolean; error?: string; tides_gained?: number; balance?: number; remaining?: number };
      };
      /** Revente du surplus de plusieurs cartes, en une transaction. */
      recycle_surplus: {
        Args: { p_user_id: string; p_items: Array<{ card_id: string; quantity: number; unit_value: number; keep: number }> };
        Returns: {
          ok: boolean;
          error?: string;
          tides_gained?: number;
          cards_sold?: number;
          balance?: number;
          lines?: Array<{ card_id: string; sold: number; tides: number }>;
        };
      };
      /**
       * Pseudo et illustration de profil. Un argument `null` laisse la
       * valeur en place ; `p_clear_avatar` retire l'illustration.
       */
      set_profile_identity: {
        Args: {
          p_user_id: string;
          p_display_name?: string | null;
          p_avatar_card_id?: string | null;
          p_clear_avatar?: boolean;
        };
        Returns: { ok: boolean; error?: string };
      };
      /** Crée une partie déjà commencée (bot, matchmaking) et son état privé, atomiquement. */
      create_active_match: {
        Args: {
          p_match_id: string;
          p_invite_code: string;
          p_mode: "matchmaking" | "bot";
          p_player1_id: string;
          p_player1_deck_id: string;
          p_player2_id: string | null;
          p_player2_deck_id: string;
          p_bot_difficulty: "facile" | "moyen" | "difficile" | null;
          p_state: unknown;
        };
        Returns: { ok: boolean; error?: string; version?: number };
      };
      /** Fait rejoindre une partie privée en attente et crée son état privé, atomiquement. */
      activate_waiting_match: {
        Args: { p_match_id: string; p_player2_id: string; p_player2_deck_id: string; p_state: unknown };
        Returns: { ok: boolean; error?: string; version?: number };
      };
      /** Enregistre un coup si `p_expected_version` est toujours la version courante (`error: "conflict"` sinon). */
      commit_match_state: {
        Args: {
          p_match_id: string;
          p_expected_version: number;
          p_state: unknown;
          p_status: "active" | "finished";
          p_winner_id: string | null;
        };
        Returns: { ok: boolean; error?: string; version?: number };
      };
      assign_player_quests: {
        Args: { p_user_id: string; p_quest_type: "daily" | "weekly"; p_period_key: string; p_quest_codes: string[] };
        Returns: { ok: boolean; assigned: number };
      };
      record_match_quest_progress: {
        Args: {
          p_match_id: string;
          p_user_id: string;
          p_vs_bot: boolean;
          p_period_keys: string[];
          p_progress: Record<string, number>;
          /** Valeurs DISTINCTES apportées par la partie (objectifs `set`). */
          p_sets?: Record<string, string[]>;
        };
        Returns: { ok: boolean; recorded: boolean; completed: number; dailies_completed?: number; recap?: QuestRecapRow[] };
      };
      claim_quest_reward: {
        Args: { p_user_id: string; p_quest_id: string; p_period_key: string };
        Returns: { ok: boolean; error?: string; tides_gained?: number; xp_gained?: number; booster_id?: string | null; balance?: number };
      };
      /** Remplacement gratuit d'une quête non terminée, dans la limite du quota de la période. */
      /** Traversées : écriture conditionnelle de l'avancement d'une partie. */
      apply_voyage_progress: {
        Args: {
          p_match_id: string;
          p_user_id: string;
          p_voyage_id: string;
          p_expected_step: number;
          p_expected_progress: number;
          p_step_index: number;
          p_step_progress: number;
          p_step_meta: string[];
          p_recap: VoyageRecapRow;
        };
        Returns: { ok: boolean; recorded?: boolean; conflict?: boolean; recap?: VoyageRecapRow | Record<string, never> };
      };
      /** Traversées : réclamer le prochain palier atteint. */
      claim_voyage_tier: {
        Args: { p_user_id: string; p_voyage_id: string; p_tier: number; p_xp: number; p_tides: number; p_booster_id?: string | null };
        Returns: { ok: boolean; error?: string; tier?: number; tides_gained?: number; xp_gained?: number; booster_id?: string | null; balance?: number };
      };
      reroll_player_quest: {
        Args: { p_user_id: string; p_period_key: string; p_quest_id: string; p_new_quest_code: string; p_max_rerolls: number };
        Returns: { ok: boolean; error?: string; quest_id?: string; remaining?: number };
      };
      /** Tutoriel terminé (booster crédité une seule fois) ou passé (rien). */
      finish_tutorial: {
        Args: { p_user_id: string; p_completed: boolean; p_booster_id?: string };
        Returns: { ok: boolean; booster_granted: boolean; status: "completed" | "skipped" };
      };
      /** Une réclamation par jour UTC ; l'étape avance, elle ne repart jamais de zéro. */
      claim_login_reward: {
        Args: {
          p_user_id: string;
          p_step: number;
          p_next_step: number;
          p_tides: number;
          p_xp: number;
          p_booster_id?: string | null;
          p_card_id?: string | null;
          /** Carte Abyssale du palier de série, accordée seulement si la série calculée en base y tombe. */
          p_streak_card_id?: string | null;
        };
        Returns: { ok: boolean; error?: string; step?: number; tides?: number; xp?: number; streak?: number; streak_card_id?: string | null };
      };
      claim_borrowed_deck: {
        Args: { p_user_id: string; p_deck_id: string };
        Returns: { ok: boolean; error?: string; deck_id?: string };
      };
      unlock_precon_deck: {
        Args: { p_user_id: string; p_deck_id: string };
        Returns: { ok: boolean; error?: string; deck_id?: string; tokens?: number };
      };
      /** Exploits : `[{ code, tides }]`, filtré par l'appelant ; la clé primaire évite tout doublon. */
      claim_achievement: {
        Args: { p_user_id: string; p_code: string };
        Returns: { ok: boolean; error?: string; code?: string; tides?: number };
      };
      grant_achievements: {
        Args: { p_user_id: string; p_achievements: unknown };
        Returns: { ok: boolean; granted: string[]; tides: number };
      };
      open_card_choice: {
        Args: { p_user_id: string; p_source: string; p_source_ref: string; p_rarity: CardRarityEnum; p_card_ids: string[] };
        Returns: { ok: boolean; opened: boolean; choice_id?: string | null };
      };
      claim_level_reward: {
        Args: { p_user_id: string; p_level: number; p_items: unknown };
        Returns: { ok: boolean; error?: string; already_claimed?: boolean; level?: number; tides?: number; precon_tokens?: number };
      };
      /**
       * Remonte `player_progression.level` au niveau calculé par le serveur
       * applicatif, jamais à la baisse. La courbe vit en TypeScript
       * (`game/progression/levels.ts`) : la colonne n'en est qu'un cache, et
       * seule la fin de partie le rafraîchissait — d'où les paliers gagnés
       * par l'XP d'une quête qui restaient invisibles.
       */
      sync_player_level: {
        Args: { p_user_id: string; p_level: number };
        Returns: number;
      };
      resolve_card_choice: {
        Args: { p_user_id: string; p_choice_id: string; p_card_id: string };
        Returns: { ok: boolean; error?: string; card_id?: string };
      };
      set_player_title: {
        Args: { p_user_id: string; p_title_id: string | null; p_required_achievement: string | null };
        Returns: { ok: boolean; error?: string; title_id?: string | null };
      };
      equip_cosmetic: {
        Args: { p_user_id: string; p_cosmetic_kind: string; p_cosmetic_id: string | null };
        Returns: { ok: boolean; error?: string; cosmetic_id?: string | null };
      };
      grant_cosmetics: {
        Args: { p_user_id: string; p_cosmetics: unknown };
        Returns: { ok: boolean; granted: string[] };
      };
      purchase_cosmetic: {
        Args: { p_user_id: string; p_cosmetic_kind: string; p_cosmetic_id: string; p_label: string; p_price: number };
        Returns: { ok: boolean; error?: string; balance?: number; cosmetic_id?: string };
      };
    };
    Enums: {
      card_type: CardTypeEnum;
      card_rarity: CardRarityEnum;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Miroir de l'enum SQL `public.card_type`. */
type CardTypeEnum = "marin" | "creature" | "equipement" | "structure" | "objet" | "anomalie";

/** Miroir de l'enum SQL `public.card_rarity`. */
/**
 * Une ligne du relevé de quêtes d'une partie (`match_quest_progress.quest_recap`).
 * Miroir du `jsonb_build_object` de `record_match_quest_progress`.
 */
/** Ce qu'une partie a fait à l'escale en cours d'une Traversée (`match_voyage_progress.voyage_recap`). */
export interface VoyageRecapRow {
  voyage_id: string;
  step_index: number;
  before: number;
  after: number;
  target: number;
  completed_step: boolean;
}

export interface QuestRecapRow {
  quest_id: string;
  period_key: string;
  code: string;
  name: string;
  category: string;
  quest_type: string;
  before: number;
  after: number;
  target: number;
  completed: boolean;
  reward_tides: number;
  reward_xp: number;
  reward_booster_id: string | null;
}

/** Miroir de l'enum SQL `public.card_rarity` — cf. `game/boosters/types.ts`. */
type CardRarityEnum = "common" | "uncommon" | "rare" | "epic" | "legendary" | "abyssal";
