/**
 * BASE EN MÉMOIRE — de quoi rejouer la boucle réelle sans Supabase.
 *
 * Les tests de services existants (`serverServices.test.ts`) vérifient que
 * rien ne lève quand la base répond mal. Ils ne disent rien de l'autre
 * question, la seule qui compte pour une alpha : **une partie jouée de bout
 * en bout écrit-elle réellement ce qu'elle doit écrire ?**
 *
 * D'où ce harnais. Il n'émule pas Postgres : il transcrit, table par table
 * et fonction par fonction, ce que les migrations de `supabase/migrations/`
 * déclarent — clés d'idempotence comprises, puisque ce sont elles qui
 * décident qu'une partie ne paie qu'une fois. Les données de référence
 * (cartes, quêtes, pools de boosters) viennent de `scripts/seedRows.ts`,
 * c'est-à-dire de la MÊME source que `npm run seed:cards` : un test qui
 * inventerait ses propres cartes ne prouverait rien.
 *
 * Ce qu'il ne remplace pas : RLS, les vrais types de colonnes, la
 * concurrence. Ce qu'il attrape : un maillon manquant de la chaîne
 * (récompense non octroyée, quête non avancée, collection non créditée),
 * une idempotence cassée, un appel dans le mauvais ordre.
 */

export type Row = Record<string, any>;

/** Clé primaire de chaque table, telle que la migration la déclare. */
const PRIMARY_KEYS: Record<string, string[]> = {
  matches: ["id"],
  match_states: ["match_id"],
  match_rewards: ["match_id", "user_id"],
  match_quest_progress: ["match_id", "user_id"],
  player_progression: ["user_id"],
  player_currency: ["user_id"],
  player_cards: ["user_id", "card_id"],
  player_boosters: ["user_id", "booster_definition_id"],
  player_pity: ["user_id", "booster_definition_id"],
  player_quest_progress: ["user_id", "quest_id", "period_key"],
  player_level_rewards: ["user_id", "level"],
  player_achievements: ["user_id", "code"],
  player_cosmetics: ["user_id", "cosmetic_kind", "cosmetic_id"],
  quests: ["id"],
  cards: ["id"],
  booster_definitions: ["id"],
  booster_slots: ["booster_definition_id", "slot_index"],
  booster_pool_cards: ["booster_definition_id", "card_id"],
  booster_openings: ["id"],
  player_decks: ["id"],
  player_voyages: ["user_id", "voyage_id"],
  match_voyage_progress: ["match_id", "user_id"],
};

let uuidCounter = 0;
function fakeUuid(): string {
  uuidCounter += 1;
  const hex = uuidCounter.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Jour UTC, comme `(now() at time zone 'utc')::date` en base. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export class FakeDatabase {
  readonly tables: Record<string, Row[]> = {};
  /** Journal des appels RPC, dans l'ordre — ce que le test relit pour vérifier la chaîne. */
  readonly rpcCalls: { fn: string; args: Row }[] = [];

  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }

  /** Lignes correspondant à un filtre d'égalité simple. */
  where(name: string, match: Row): Row[] {
    return this.table(name).filter((row) => Object.entries(match).every(([key, value]) => row[key] === value));
  }

  one(name: string, match: Row): Row | undefined {
    return this.where(name, match)[0];
  }

  /**
   * `insert ... on conflict do nothing` : rend `true` si la ligne a bien été
   * insérée (c'est le `found` de plpgsql, sur lequel reposent toutes les
   * idempotences de ce projet).
   */
  insertIfAbsent(name: string, row: Row): boolean {
    const keys = PRIMARY_KEYS[name];
    if (keys) {
      const match = Object.fromEntries(keys.map((key) => [key, row[key]]));
      if (this.one(name, match)) return false;
    }
    this.table(name).push({ ...row });
    return true;
  }

  /** `insert ... on conflict do update` : insère, ou applique `update` à la ligne existante. */
  upsert(name: string, row: Row, update: (existing: Row) => void): void {
    const keys = PRIMARY_KEYS[name]!;
    const match = Object.fromEntries(keys.map((key) => [key, row[key]]));
    const existing = this.one(name, match);
    if (existing) update(existing);
    else this.table(name).push({ ...row });
  }
}

/** Réponse d'une requête, dans la forme que rend le SDK Supabase. */
interface QueryResponse {
  data: any;
  error: { message: string } | null;
  count?: number | null;
}

type Filter = (row: Row) => boolean;

/**
 * Constructeur de requête minimal : ce que les services utilisent
 * réellement (`select/eq/gt/in/is/order/limit/maybeSingle/single`,
 * `insert`, `update`), et rien de plus.
 */
class QueryBuilder implements PromiseLike<QueryResponse> {
  private filters: Filter[] = [];
  private projection: string | undefined;
  private orderBy: { column: string; ascending: boolean } | undefined;
  private limitTo: number | undefined;
  private mode: "select" | "insert" | "update" | "upsert" = "select";
  private conflictColumns: string[] | undefined;
  private payload: Row[] = [];
  private singleMode: "none" | "maybe" | "one" = "none";

  constructor(private readonly db: FakeDatabase, private readonly name: string) {}

  select(projection?: string) {
    this.projection = projection;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: Row) {
    this.mode = "update";
    this.payload = [patch];
    return this;
  }

  upsert(rows: Row | Row[], options?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflictColumns = options?.onConflict?.split(",").map((column) => column.trim());
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => readColumn(this.db, this.name, row, column) === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => readColumn(this.db, this.name, row, column) !== value);
    return this;
  }

  gt(column: string, value: number) {
    this.filters.push((row) => Number(row[column] ?? 0) > value);
    return this;
  }

  gte(column: string, value: number) {
    this.filters.push((row) => Number(row[column] ?? 0) >= value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  /** `not`, dans la seule forme employée : `.not(colonne, "is", null)`. */
  not(column: string, operator: "is", value: null) {
    if (operator !== "is") throw new Error(`not(${operator}) non transcrit dans le harnais`);
    this.filters.push((row) => (row[column] ?? null) !== value);
    return this;
  }

  /**
   * `or` PostgREST, dans la seule forme employée par le projet
   * (`fetchQuestBoard`) : une liste de termes séparés par des virgules de
   * premier niveau, dont chacun peut être un `and(...)`.
   */
  or(expression: string) {
    const terms = splitTopLevel(expression);
    this.filters.push((row) => terms.some((term) => matchesTerm(row, term)));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.limitTo = count;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    return this.run();
  }

  single() {
    this.singleMode = "one";
    return this.run();
  }

  then<R1 = QueryResponse, R2 = never>(
    onfulfilled?: ((value: QueryResponse) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<QueryResponse> {
    if (this.mode === "upsert") {
      const keys = this.conflictColumns ?? PRIMARY_KEYS[this.name] ?? [];
      for (const row of this.payload) {
        const match = Object.fromEntries(keys.map((key) => [key, row[key]]));
        const existing = keys.length > 0 ? this.db.one(this.name, match) : undefined;
        if (existing) Object.assign(existing, row, { updated_at: nowIso() });
        else this.db.table(this.name).push({ ...row, updated_at: nowIso() });
      }
      return { data: this.payload, error: null };
    }

    if (this.mode === "insert") {
      const inserted: Row[] = [];
      for (const row of this.payload) {
        const complete = { ...row };
        if (PRIMARY_KEYS[this.name]?.includes("id") && complete.id === undefined) complete.id = fakeUuid();
        complete.updated_at ??= nowIso();
        complete.created_at ??= nowIso();
        this.db.table(this.name).push(complete);
        inserted.push(complete);
      }
      return { data: this.singleMode === "none" ? inserted : (inserted[0] ?? null), error: null };
    }

    const rows = this.db.table(this.name).filter((row) => this.filters.every((filter) => filter(row)));

    if (this.mode === "update") {
      for (const row of rows) Object.assign(row, this.payload[0], { updated_at: nowIso() });
      return { data: this.singleMode === "none" ? rows : (rows[0] ?? null), error: null };
    }

    let result = rows.map((row) => project(this.db, this.name, row, this.projection));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      result = [...result].sort((a, b) => {
        const left = a[column];
        const right = b[column];
        const sign = left === right ? 0 : left > right ? 1 : -1;
        return ascending ? sign : -sign;
      });
    }
    if (this.limitTo !== undefined) result = result.slice(0, this.limitTo);

    if (this.singleMode === "one" && result.length !== 1) {
      return { data: null, error: { message: "Aucune ligne unique." } };
    }
    if (this.singleMode !== "none") return { data: result[0] ?? null, error: null };
    return { data: result, error: null, count: result.length };
  }
}

/** Découpe une expression PostgREST sur les virgules de PREMIER niveau. */
function splitTopLevel(expression: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of expression) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current) parts.push(current);
  return parts;
}

/** Un terme de filtre PostgREST : `and(...)`, `col.in.(…)`, `col.is.null`, `col.not.is.null`. */
function matchesTerm(row: Row, term: string): boolean {
  const trimmed = term.trim();
  if (trimmed.startsWith("and(")) {
    return splitTopLevel(trimmed.slice(4, -1)).every((inner) => matchesTerm(row, inner));
  }
  const inMatch = /^([a-z_0-9]+)\.in\.\((.*)\)$/i.exec(trimmed);
  if (inMatch) {
    const values = inMatch[2]!.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    return values.includes(String(row[inMatch[1]!]));
  }
  const notNull = /^([a-z_0-9]+)\.not\.is\.null$/i.exec(trimmed);
  if (notNull) return (row[notNull[1]!] ?? null) !== null;
  const isNull = /^([a-z_0-9]+)\.is\.null$/i.exec(trimmed);
  if (isNull) return (row[isNull[1]!] ?? null) === null;
  const eq = /^([a-z_0-9]+)\.eq\.(.*)$/i.exec(trimmed);
  if (eq) return String(row[eq[1]!]) === eq[2];
  throw new Error(`Terme PostgREST non transcrit dans le harnais : ${trimmed}`);
}

/**
 * Lecture d'une colonne, y compris à travers la SEULE jointure du projet
 * (`booster_pool_cards` → `cards`, filtrée par `.eq("cards.is_enabled", …)`).
 */
function readColumn(db: FakeDatabase, table: string, row: Row, column: string): unknown {
  if (!column.includes(".")) return row[column];
  const [joined, field] = column.split(".");
  if (joined === "cards" && table === "booster_pool_cards") {
    return db.one("cards", { id: row.card_id })?.[field!];
  }
  return undefined;
}

/** Projection : la jointure `cards!inner(...)` est rattachée telle que le SDK la rend. */
function project(db: FakeDatabase, table: string, row: Row, projection?: string): Row {
  if (!projection || !projection.includes("cards!inner")) return { ...row };
  const card = db.one("cards", { id: row.card_id });
  return { ...row, cards: card ? { ...card } : null };
}

/**
 * Transcription des fonctions Postgres du projet. Une par une, et fidèles à
 * ce que déclarent les migrations : ce sont elles qui portent les règles
 * d'économie, donc les copier de travers ferait un test qui se ment.
 */
function runRpc(db: FakeDatabase, fn: string, args: Row): any {
  switch (fn) {
    case "create_active_match": {
      db.table("matches").push({
        id: args.p_match_id,
        invite_code: args.p_invite_code,
        mode: args.p_mode,
        is_vs_bot: args.p_mode === "bot",
        player1_id: args.p_player1_id,
        player1_deck_id: args.p_player1_deck_id,
        player2_id: args.p_player2_id,
        player2_deck_id: args.p_player2_deck_id,
        bot_difficulty: args.p_bot_difficulty,
        status: "active",
        state_version: 1,
        winner_id: null,
        finished_at: null,
      });
      db.table("match_states").push({ match_id: args.p_match_id, state: args.p_state, version: 1 });
      return { ok: true, version: 1 };
    }

    case "activate_waiting_match": {
      const match = db.one("matches", { id: args.p_match_id });
      if (!match || match.status !== "waiting" || match.player2_id || match.player1_id === args.p_player2_id) {
        return { ok: false, error: "Cette partie n'est plus disponible." };
      }
      Object.assign(match, {
        player2_id: args.p_player2_id,
        player2_deck_id: args.p_player2_deck_id,
        status: "active",
        state_version: 1,
      });
      db.table("match_states").push({ match_id: args.p_match_id, state: args.p_state, version: 1 });
      return { ok: true, version: 1 };
    }

    case "commit_match_state": {
      if (args.p_status !== "active" && args.p_status !== "finished") {
        return { ok: false, error: "Statut invalide." };
      }
      const match = db.one("matches", { id: args.p_match_id });
      if (!match || match.status !== "active") return { ok: false, error: "Cette partie n'est pas en cours." };

      const stateRow = db.one("match_states", { match_id: args.p_match_id });
      if (!stateRow || stateRow.version !== args.p_expected_version) return { ok: false, error: "conflict" };

      stateRow.state = args.p_state;
      stateRow.version += 1;
      Object.assign(match, {
        state_version: stateRow.version,
        status: args.p_status,
        winner_id: args.p_winner_id,
        finished_at: args.p_status === "finished" ? (match.finished_at ?? nowIso()) : match.finished_at,
      });
      return { ok: true, version: stateRow.version };
    }

    case "grant_match_progression": {
      if (args.p_xp < 0 || args.p_tides < 0) throw new Error("montants négatifs refusés");
      const today = utcToday();
      const granted = db.insertIfAbsent("match_rewards", {
        match_id: args.p_match_id,
        user_id: args.p_user_id,
        xp_granted: args.p_xp,
        tides_granted: args.p_tides,
        level_before: args.p_level_before,
        level_after: args.p_target_level,
        first_win_of_day: args.p_first_win_of_day,
      });
      if (!granted) {
        const current = db.one("player_progression", { user_id: args.p_user_id });
        return { granted: false, xp_total: current?.xp_total ?? 0, level: current?.level ?? 1 };
      }

      db.upsert(
        "player_progression",
        {
          user_id: args.p_user_id,
          xp_total: args.p_xp,
          level: Math.max(1, args.p_target_level),
          matches_played: 1,
          pvp_wins: args.p_is_pvp_win ? 1 : 0,
          wins_total: args.p_is_win ? 1 : 0,
          losses: args.p_is_win ? 0 : 1,
          last_pvp_win_day: args.p_is_pvp_win ? today : null,
          last_win_day: args.p_is_win ? today : null,
          daily_matches_day: today,
          daily_matches_count: args.p_counts_for_daily ? 1 : 0,
          play_streak_day: today,
          play_streak: 1,
          best_play_streak: 1,
          precon_tokens: 0,
        },
        (row) => {
          row.xp_total += args.p_xp;
          row.level = Math.max(row.level, args.p_target_level);
          row.matches_played += 1;
          row.pvp_wins += args.p_is_pvp_win ? 1 : 0;
          row.wins_total += args.p_is_win ? 1 : 0;
          row.losses += args.p_is_win ? 0 : 1;
          if (args.p_is_pvp_win) row.last_pvp_win_day = today;
          if (args.p_is_win) row.last_win_day = today;
          const sameDay = row.daily_matches_day === today;
          row.daily_matches_count = (sameDay ? row.daily_matches_count : 0) + (args.p_counts_for_daily ? 1 : 0);
          row.daily_matches_day = today;
          const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
          const streak =
            row.play_streak_day === today
              ? Math.max(row.play_streak, 1)
              : row.play_streak_day === yesterday
                ? row.play_streak + 1
                : 1;
          row.play_streak = streak;
          row.play_streak_day = today;
          row.best_play_streak = Math.max(row.best_play_streak ?? 0, streak);
        }
      );

      const progression = db.one("player_progression", { user_id: args.p_user_id })!;
      if (args.p_tides > 0) {
        db.upsert("player_currency", { user_id: args.p_user_id, balance: args.p_tides }, (row) => {
          row.balance += args.p_tides;
        });
        db.table("currency_transactions").push({ user_id: args.p_user_id, amount: args.p_tides, reason: "match_reward" });
      }

      return {
        granted: true,
        xp_total: progression.xp_total,
        level: progression.level,
        play_streak: progression.play_streak,
      };
    }

    case "assign_player_quests": {
      const already = db
        .where("player_quest_progress", { user_id: args.p_user_id, period_key: args.p_period_key })
        .some((row) => db.one("quests", { id: row.quest_id })?.quest_type === args.p_quest_type);
      if (already) return { ok: true, assigned: 0 };

      let assigned = 0;
      for (const quest of db.table("quests")) {
        if (!args.p_quest_codes.includes(quest.code) || quest.quest_type !== args.p_quest_type || !quest.is_enabled) continue;
        const inserted = db.insertIfAbsent("player_quest_progress", {
          user_id: args.p_user_id,
          quest_id: quest.id,
          period_key: args.p_period_key,
          progress_value: 0,
          progress_meta: [],
          completed_at: null,
          claimed_at: null,
        });
        if (inserted) assigned += 1;
      }
      return { ok: true, assigned };
    }

    case "record_match_quest_progress": {
      const recorded = db.insertIfAbsent("match_quest_progress", {
        match_id: args.p_match_id,
        user_id: args.p_user_id,
        progress: args.p_progress ?? {},
        quest_recap: [],
      });
      if (!recorded) {
        const existing = db.one("match_quest_progress", { match_id: args.p_match_id, user_id: args.p_user_id });
        return { ok: true, recorded: false, completed: 0, recap: existing?.quest_recap ?? [] };
      }

      const periodKeys: string[] = args.p_period_keys ?? [];
      const progress: Record<string, number> = args.p_progress ?? {};
      const sets: Record<string, string[]> = args.p_sets ?? {};
      const mine = db
        .table("player_quest_progress")
        .filter((row) => row.user_id === args.p_user_id && periodKeys.includes(row.period_key));
      const before = new Map(mine.map((row) => [`${row.quest_id}|${row.period_key}`, row.progress_value]));

      let dailiesCompleted = 0;
      let completed = 0;

      const advance = (row: Row, quest: Row, next: number) => {
        row.progress_value = Math.min(quest.target_value, next);
        if (row.progress_value >= quest.target_value) {
          row.completed_at = nowIso();
          completed += 1;
          if (quest.quest_type === "daily") dailiesCompleted += 1;
        }
      };

      for (const row of mine) {
        const quest = db.one("quests", { id: row.quest_id });
        if (!quest || row.completed_at) continue;
        if (args.p_vs_bot && !quest.bot_progress_allowed) continue;
        const kind = quest.progress_kind ?? "sum";

        if (kind === "set") {
          if (!(quest.objective_key in sets)) continue;
          const merged = Array.from(new Set([...(row.progress_meta ?? []), ...(sets[quest.objective_key] ?? [])]));
          row.progress_meta = merged;
          advance(row, quest, merged.length);
          continue;
        }

        const value = progress[quest.objective_key];
        if (value === undefined || value <= 0) continue;
        if (kind === "max") advance(row, quest, Math.max(row.progress_value, value));
        else advance(row, quest, row.progress_value + value);
      }

      // Méta-quête « Terminer N quêtes journalières » : APRÈS les autres,
      // puisqu'elle se nourrit de ce qu'elles viennent de terminer.
      if (dailiesCompleted > 0) {
        for (const row of mine) {
          const quest = db.one("quests", { id: row.quest_id });
          if (!quest || row.completed_at || quest.objective_key !== "complete_daily_quests") continue;
          if (args.p_vs_bot && !quest.bot_progress_allowed) continue;
          advance(row, quest, row.progress_value + dailiesCompleted);
        }
      }

      const recap = mine
        .filter((row) => before.get(`${row.quest_id}|${row.period_key}`) !== row.progress_value)
        .map((row) => {
          const quest = db.one("quests", { id: row.quest_id })!;
          return {
            quest_id: row.quest_id,
            period_key: row.period_key,
            code: quest.code,
            name: quest.name ?? quest.code,
            category: quest.category,
            quest_type: quest.quest_type,
            before: before.get(`${row.quest_id}|${row.period_key}`) ?? 0,
            after: row.progress_value,
            target: quest.target_value,
            completed: row.completed_at !== null,
            reward_tides: quest.reward_currency,
            reward_xp: quest.reward_xp ?? 0,
            reward_booster_id: quest.reward_booster_definition_id,
          };
        });

      db.one("match_quest_progress", { match_id: args.p_match_id, user_id: args.p_user_id })!.quest_recap = recap;
      return { ok: true, recorded: true, completed, dailies_completed: dailiesCompleted, recap };
    }

    case "claim_quest_reward": {
      const row = db.one("player_quest_progress", {
        user_id: args.p_user_id,
        quest_id: args.p_quest_id,
        period_key: args.p_period_key,
      });
      if (!row) return { ok: false, error: "Quête introuvable." };
      if (!row.completed_at) return { ok: false, error: "Cette quête n'est pas encore terminée." };
      if (row.claimed_at) return { ok: false, error: "Récompense déjà réclamée." };

      const quest = db.one("quests", { id: args.p_quest_id })!;
      row.claimed_at = nowIso();

      if ((quest.reward_currency ?? 0) > 0) {
        db.upsert("player_currency", { user_id: args.p_user_id, balance: quest.reward_currency }, (current) => {
          current.balance += quest.reward_currency;
        });
        db.table("currency_transactions").push({
          user_id: args.p_user_id,
          amount: quest.reward_currency,
          reason: "quest_reward",
          reference_id: args.p_quest_id,
        });
      }
      if ((quest.reward_xp ?? 0) > 0) {
        db.upsert("player_progression", { user_id: args.p_user_id, xp_total: quest.reward_xp, level: 1 }, (current) => {
          current.xp_total += quest.reward_xp;
        });
      }
      if (quest.reward_booster_definition_id) {
        db.upsert(
          "player_boosters",
          { user_id: args.p_user_id, booster_definition_id: quest.reward_booster_definition_id, quantity: 1 },
          (current) => {
            current.quantity += 1;
          }
        );
      }

      return {
        ok: true,
        tides_gained: quest.reward_currency ?? 0,
        xp_gained: quest.reward_xp ?? 0,
        booster_id: quest.reward_booster_definition_id,
        balance: db.one("player_currency", { user_id: args.p_user_id })?.balance ?? 0,
      };
    }

    case "sync_player_level": {
      const row = db.one("player_progression", { user_id: args.p_user_id });
      if (!row) return 1;
      row.level = Math.max(row.level, Math.max(1, args.p_level ?? 1));
      return row.level;
    }

    case "claim_level_reward": {
      if (!args.p_level || args.p_level < 1) return { ok: false, error: "Palier inconnu." };
      const progression = db.one("player_progression", { user_id: args.p_user_id });
      if ((progression?.level ?? 1) < args.p_level) return { ok: false, error: "Ce palier n'est pas encore atteint." };

      const inserted = db.insertIfAbsent("player_level_rewards", {
        user_id: args.p_user_id,
        level: args.p_level,
        granted: args.p_items ?? [],
      });
      if (!inserted) return { ok: false, error: "Palier déjà réclamé.", already_claimed: true };

      let tides = 0;
      let tokens = 0;
      for (const item of (args.p_items ?? []) as Row[]) {
        if (item.kind === "tides") tides += Math.max(0, item.amount ?? 0);
        else if (item.kind === "preconToken") tokens += Math.max(0, item.count ?? 1);
        else if (item.kind === "booster") {
          const count = Math.max(1, item.count ?? 1);
          db.upsert(
            "player_boosters",
            { user_id: args.p_user_id, booster_definition_id: item.boosterId, quantity: count },
            (row) => {
              row.quantity += count;
            }
          );
        } else if (item.kind === "cosmetic") {
          db.insertIfAbsent("player_cosmetics", {
            user_id: args.p_user_id,
            cosmetic_kind: item.cosmetic,
            cosmetic_id: item.id,
            label: item.label ?? "",
          });
        }
      }
      if (tokens > 0 && progression) progression.precon_tokens = (progression.precon_tokens ?? 0) + tokens;
      if (tides > 0) {
        db.upsert("player_currency", { user_id: args.p_user_id, balance: tides }, (row) => {
          row.balance += tides;
        });
        db.table("currency_transactions").push({ user_id: args.p_user_id, amount: tides, reason: "level_reward" });
      }
      return { ok: true, level: args.p_level, tides, precon_tokens: tokens };
    }

    case "grant_achievements": {
      const granted: string[] = [];
      for (const entry of (args.p_achievements ?? []) as Row[]) {
        const inserted = db.insertIfAbsent("player_achievements", {
          user_id: args.p_user_id,
          code: entry.code,
          tides_granted: Math.max(0, entry.tides ?? 0),
          claimed_at: null,
        });
        if (inserted) granted.push(entry.code);
      }
      return { ok: true, granted, tides: 0 };
    }

    case "grant_cosmetics": {
      const granted: string[] = [];
      for (const entry of (args.p_cosmetics ?? []) as Row[]) {
        if (!entry.kind || !entry.id) continue;
        const inserted = db.insertIfAbsent("player_cosmetics", {
          user_id: args.p_user_id,
          cosmetic_kind: entry.kind,
          cosmetic_id: entry.id,
          label: entry.label ?? "",
        });
        if (inserted) granted.push(entry.id);
      }
      return { ok: true, granted };
    }

    case "purchase_booster": {
      if (!args.p_quantity || args.p_quantity < 1) return { ok: false, error: "Quantité invalide." };
      const definition = db.one("booster_definitions", { id: args.p_booster_id });
      if (!definition || definition.price_currency === null || !definition.is_purchasable || !definition.is_enabled) {
        return { ok: false, error: "Ce booster n'est pas en vente." };
      }
      const cost = definition.price_currency * args.p_quantity;
      db.upsert("player_currency", { user_id: args.p_user_id, balance: 0 }, () => {});
      const wallet = db.one("player_currency", { user_id: args.p_user_id })!;
      if (wallet.balance < cost) return { ok: false, error: "Solde de Tides insuffisant.", balance: wallet.balance };

      wallet.balance -= cost;
      db.table("currency_transactions").push({ user_id: args.p_user_id, amount: -cost, reason: "booster_purchase" });
      db.upsert(
        "player_boosters",
        { user_id: args.p_user_id, booster_definition_id: args.p_booster_id, quantity: args.p_quantity },
        (row) => {
          row.quantity += args.p_quantity;
        }
      );
      return { ok: true, balance: wallet.balance, spent: cost };
    }

    case "open_booster": {
      const cardIds: string[] = args.p_card_ids ?? [];
      if (cardIds.length === 0) return { ok: false, error: "Aucune carte à créditer." };
      const definition = db.one("booster_definitions", { id: args.p_booster_id });
      if (!definition) return { ok: false, error: "Booster inconnu." };
      if (cardIds.length !== definition.card_count) {
        return { ok: false, error: `Tirage incomplet : ${cardIds.length} carte(s) pour un booster de ${definition.card_count}.` };
      }
      const distinct = Array.from(new Set(cardIds));
      if (distinct.some((id) => !db.one("cards", { id }))) return { ok: false, error: "Carte inconnue dans le tirage." };

      const owned = db.one("player_boosters", { user_id: args.p_user_id, booster_definition_id: args.p_booster_id });
      if (!owned || owned.quantity < 1) return { ok: false, error: "Tu ne possèdes pas ce booster." };
      owned.quantity -= 1;

      const openingId = fakeUuid();
      db.table("booster_openings").push({ id: openingId, user_id: args.p_user_id, booster_definition_id: args.p_booster_id });
      cardIds.forEach((cardId, index) => {
        db.table("booster_opening_cards").push({ booster_opening_id: openingId, slot_index: index + 1, card_id: cardId });
      });

      for (const cardId of distinct) {
        const quantity = cardIds.filter((id) => id === cardId).length;
        db.upsert("player_cards", { user_id: args.p_user_id, card_id: cardId, quantity }, (row) => {
          row.quantity += quantity;
        });
      }

      const abyssal = distinct.some((id) => db.one("cards", { id })?.rarity === "abyssal");
      db.upsert(
        "player_pity",
        {
          user_id: args.p_user_id,
          booster_definition_id: args.p_booster_id,
          packs_since_abyssal: abyssal ? 0 : 1,
          packs_since_new_card: 0,
        },
        (row) => {
          row.packs_since_abyssal = abyssal ? 0 : row.packs_since_abyssal + 1;
        }
      );

      return {
        ok: true,
        opening_id: openingId,
        abyssal_pulled: abyssal,
        packs_since_abyssal: db.one("player_pity", { user_id: args.p_user_id, booster_definition_id: args.p_booster_id })!
          .packs_since_abyssal,
      };
    }

    // `20261007120000_voyages.sql`.
    case "apply_voyage_progress": {
      const key = { match_id: args.p_match_id, user_id: args.p_user_id };
      if (!db.insertIfAbsent("match_voyage_progress", { ...key, voyage_recap: args.p_recap ?? {} })) {
        return { ok: true, recorded: false, recap: db.one("match_voyage_progress", key)!.voyage_recap };
      }
      db.insertIfAbsent("player_voyages", {
        user_id: args.p_user_id,
        voyage_id: args.p_voyage_id,
        step_index: 0,
        step_progress: 0,
        step_meta: [],
        claimed_tiers: 0,
        completed_at: null,
      });
      const row = db.one("player_voyages", { user_id: args.p_user_id, voyage_id: args.p_voyage_id })!;
      if (row.step_index !== args.p_expected_step || row.step_progress !== args.p_expected_progress) {
        db.tables.match_voyage_progress = db.table("match_voyage_progress").filter(
          (r) => !(r.match_id === key.match_id && r.user_id === key.user_id)
        );
        return { ok: false, conflict: true };
      }
      row.step_index = args.p_step_index;
      row.step_progress = args.p_step_progress;
      row.step_meta = args.p_step_meta ?? [];
      if (args.p_step_index >= 5 && !row.completed_at) row.completed_at = nowIso();
      return { ok: true, recorded: true, recap: args.p_recap };
    }

    case "claim_voyage_tier": {
      const row = db.one("player_voyages", { user_id: args.p_user_id, voyage_id: args.p_voyage_id });
      if (!row) return { ok: false, error: "Traversée pas encore commencée." };
      if (args.p_tier !== row.claimed_tiers + 1) return { ok: false, error: "Ce palier est déjà réclamé, ou un palier précédent attend." };
      if (args.p_tier > row.step_index) return { ok: false, error: "Ce palier n'est pas encore atteint." };
      row.claimed_tiers = args.p_tier;
      if ((args.p_tides ?? 0) > 0) {
        db.upsert("player_currency", { user_id: args.p_user_id, balance: args.p_tides }, (existing) => {
          existing.balance += args.p_tides;
        });
        db.table("currency_transactions").push({ user_id: args.p_user_id, amount: args.p_tides, reason: "voyage_reward" });
      }
      if ((args.p_xp ?? 0) > 0) {
        db.upsert("player_progression", { user_id: args.p_user_id, xp_total: args.p_xp }, (existing) => {
          existing.xp_total += args.p_xp;
        });
      }
      if (args.p_booster_id) {
        db.upsert("player_boosters", { user_id: args.p_user_id, booster_definition_id: args.p_booster_id, quantity: 1 }, (existing) => {
          existing.quantity += 1;
        });
      }
      return {
        ok: true,
        tier: args.p_tier,
        tides_gained: args.p_tides ?? 0,
        xp_gained: args.p_xp ?? 0,
        booster_id: args.p_booster_id ?? null,
        balance: db.one("player_currency", { user_id: args.p_user_id })?.balance ?? 0,
      };
    }

    default:
      throw new Error(`Fonction Postgres non transcrite dans le harnais : ${fn}`);
  }
}

/** Le client, dans la forme que les services attendent du SDK Supabase. */
export function createFakeClient(db: FakeDatabase) {
  return {
    from: (name: string) => new QueryBuilder(db, name),
    rpc: async (fn: string, args: Row = {}) => {
      db.rpcCalls.push({ fn, args });
      try {
        return { data: runRpc(db, fn, args), error: null };
      } catch (cause) {
        return { data: null, error: { message: cause instanceof Error ? cause.message : String(cause) } };
      }
    },
  };
}
