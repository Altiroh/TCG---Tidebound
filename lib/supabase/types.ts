/**
 * Types de la base de données, écrits à la main pour correspondre à
 * `supabase/migrations/20260908200000_init.sql` et
 * `supabase/migrations/20260910120000_cards_collection_economy.sql`. À
 * remplacer/régénérer une fois le projet lié au CLI Supabase :
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/types.ts
 *
 * Volontairement PARTIEL : ne couvre que les tables effectivement
 * requêtées depuis du code TypeScript à ce jour (`profiles`, `matches`,
 * `matchmaking_queue`). La migration `..._cards_collection_economy.sql`
 * introduit une quinzaine d'autres tables (cartes, decks, collection,
 * boosters, monnaie, quêtes, onboarding) qui n'ont pas encore de Server
 * Action associée — les typer à la main ici avant d'en avoir l'usage
 * réel ferait courir un risque de dérive silencieuse avec le schéma SQL.
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
          /** `GameState` sérialisé (`game/state/types.ts`), `null` tant que la partie est en attente. */
          state: unknown;
          status: "waiting" | "active" | "finished" | "abandoned";
          winner_id: string | null;
          mode: "private_invite" | "matchmaking" | "bot";
          is_vs_bot: boolean;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          invite_code: string;
          player1_id: string;
          player2_id?: string | null;
          player1_deck_id: string;
          player2_deck_id?: string | null;
          state?: unknown;
          status?: "waiting" | "active" | "finished" | "abandoned";
          winner_id?: string | null;
          mode?: "private_invite" | "matchmaking" | "bot";
          is_vs_bot?: boolean;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          invite_code?: string;
          player1_id?: string;
          player2_id?: string | null;
          player1_deck_id?: string;
          player2_deck_id?: string | null;
          state?: unknown;
          status?: "waiting" | "active" | "finished" | "abandoned";
          winner_id?: string | null;
          mode?: "private_invite" | "matchmaking" | "bot";
          is_vs_bot?: boolean;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
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
    };
    Views: Record<string, never>;
    Functions: {
      claim_matchmaking_opponent: {
        Args: Record<string, never>;
        Returns: { opponent_user_id: string; opponent_deck_id: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
