/**
 * Types de la base de données, écrits à la main pour correspondre à
 * `supabase/migrations/20260908200000_init.sql`. À remplacer/régénérer une
 * fois le projet lié au CLI Supabase :
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/types.ts
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
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
