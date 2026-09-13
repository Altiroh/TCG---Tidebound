"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pseudos (`profiles.display_name`) des comptes demandés, pour l'écran de
 * victoire. `"me"` désigne le compte connecté dans ce navigateur (partie
 * locale contre le bot) — ignoré sans session. Chargés dès le montage du
 * plateau pour être prêts à la fin de partie ; toute erreur (hors ligne,
 * pas de session, RLS) laisse simplement l'id absent du résultat, et
 * l'appelant retombe sur son libellé générique.
 */
export function useDisplayNames(ids: readonly string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = ids.join("|");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        let meId: string | null = null;
        if (ids.includes("me")) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          meId = user?.id ?? null;
        }
        // Seuls de vrais comptes (uuid) : un id de joueur non-uuid (ex: "bot" des parties arbitrées côté serveur)
        // ferait échouer TOUTE la requête `in(...)`, pseudo du joueur humain compris.
        const lookupIds = Array.from(
          new Set(ids.map((id) => (id === "me" ? meId : id)).filter((id): id is string => Boolean(id) && UUID_PATTERN.test(id!)))
        );
        if (lookupIds.length === 0) return;

        const { data } = await supabase.from("profiles").select("id, display_name").in("id", lookupIds);
        if (cancelled || !data) return;

        const result: Record<string, string> = {};
        for (const profile of data) {
          if (!profile.display_name) continue;
          result[profile.id] = profile.display_name;
          if (profile.id === meId) result.me = profile.display_name;
        }
        setNames(result);
      } catch {
        // Libellés génériques conservés.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` résume `ids` (nouveau tableau à chaque rendu).
  }, [key]);

  return names;
}
