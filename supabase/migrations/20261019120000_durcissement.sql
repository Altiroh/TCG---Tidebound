-- Durcissement (revue d'infrastructure du 28/09/2026) : bornes en base sur
-- ce que le navigateur peut encore écrire, et deux fonctions utilitaires
-- retirées du public.
--
--   1. DÉNI DE SERVICE PAR QUANTITÉ. `player_deck_cards.quantity` n'était
--      borné qu'à « > 0 » (smallint : jusqu'à 32 767), et la policy `for all`
--      laisse le joueur écrire ses decks directement. Chaque entrée en partie
--      déplie la liste exemplaire par exemplaire : ~200 lignes à 32 767
--      faisaient dix millions d'éléments par appel, en boucle. Aucune carte
--      n'autorise plus de 3 exemplaires (`maxCopies`) : la borne 10 laisse de
--      la marge au design sans rien laisser au déni de service.
--   2. DECKS SANS BORNES. Nom, description et mécaniques n'avaient de limite
--      que dans l'écran ; le nombre de decks, aucune. Bornes identiques à
--      celles des actions serveur, et 100 decks par joueur (corbeille comprise).
--   3. `default_display_name` et `generate_friend_code` : inoffensives, mais
--      appelables par tout le monde via l'API. Plus maintenant.
--
-- Entièrement idempotente : rejouable sans risque.


-- --- 1. Quantité par carte ---------------------------------------------------

update public.player_deck_cards set quantity = 10 where quantity > 10;

alter table public.player_deck_cards drop constraint if exists player_deck_cards_quantity_max;
alter table public.player_deck_cards
  add constraint player_deck_cards_quantity_max check (quantity between 1 and 10);


-- --- 2. Decks ------------------------------------------------------------------

update public.player_decks set name = left(btrim(name), 60) where char_length(name) > 60;
update public.player_decks set name = 'Deck sans nom' where char_length(btrim(name)) = 0;
update public.player_decks set description = left(description, 180) where char_length(description) > 180;
update public.player_decks set mechanics = mechanics[1:4] where cardinality(mechanics) > 4;

alter table public.player_decks drop constraint if exists player_decks_name_length;
alter table public.player_decks
  add constraint player_decks_name_length check (char_length(btrim(name)) between 1 and 60);

alter table public.player_decks drop constraint if exists player_decks_description_length;
alter table public.player_decks
  add constraint player_decks_description_length check (description is null or char_length(description) <= 180);

alter table public.player_decks drop constraint if exists player_decks_mechanics_length;
alter table public.player_decks
  add constraint player_decks_mechanics_length check (mechanics is null or cardinality(mechanics) <= 4);

-- Plafond de decks par joueur : même mécanique que `enforce_notebook_limit`.
create or replace function public.enforce_deck_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from public.player_decks d where d.user_id = new.user_id) >= 100 then
    raise exception 'Limite de 100 decks atteinte.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_deck_limit on public.player_decks;
create trigger enforce_deck_limit
  before insert on public.player_decks
  for each row execute function public.enforce_deck_limit();


-- --- 3. Fonctions utilitaires --------------------------------------------------

revoke all on function public.default_display_name(uuid) from public, anon, authenticated;
revoke all on function public.generate_friend_code() from public, anon, authenticated;
revoke all on function public.enforce_deck_limit() from public, anon, authenticated;
