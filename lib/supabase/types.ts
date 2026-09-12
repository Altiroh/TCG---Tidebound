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
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
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
          id: string;
          user_id: string;
          ship_id: string;
          name: string;
          is_valid: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ship_id: string;
          name: string;
          is_valid?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ship_id?: string;
          name?: string;
          is_valid?: boolean;
          created_at?: string;
          updated_at?: string;
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
          pool_excluded_rarities: CardRarityEnum[];
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
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
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
          updated_at: string;
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
          p_boosters: string[];
        };
        Returns: { granted: boolean; xp_total: number; level: number };
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
      recycle_card: {
        Args: { p_user_id: string; p_card_id: string; p_quantity?: number };
        Returns: { ok: boolean; error?: string; tides_gained?: number; balance?: number };
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
        };
        Returns: { ok: boolean; recorded: boolean; completed: number };
      };
      claim_quest_reward: {
        Args: { p_user_id: string; p_quest_id: string; p_period_key: string };
        Returns: { ok: boolean; error?: string; tides_gained?: number; booster_id?: string | null; balance?: number };
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
type CardRarityEnum = "common" | "uncommon" | "rare" | "abyssal";
