-- ═══════════════════════════════════════════════════════════════════════
-- COURRIER DE BORD ET RÔLE ADMIN (14/10/2026)
--
-- Un Admin écrit un courrier — titre, texte, miniature facultative, et s'il
-- le veut des cadeaux (Tides, XP, boosters). Le joueur le reçoit dans sa
-- boîte (l'enveloppe du bandeau), l'ouvre et réclame les cadeaux.
--
-- Tout passe par le SERVEUR (`features/mail/mailService.ts`, clé
-- service_role) : aucune policy pour le navigateur, même parti que les
-- autres tables du joueur depuis l'audit de sécurité (20261016120000).
--
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------
-- 1. Rôles : qui est Admin
-- ---------------------------------------------------------------------
-- Une ligne par rôle accordé. Seul `admin` existe aujourd'hui : il ouvre
-- l'écriture du courrier et l'accès aux labos dans les Options.
create table if not exists public.player_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.player_roles enable row level security;
revoke all on table public.player_roles from anon, authenticated;

-- Accorder le rôle (à exécuter à la main, une fois, dans l'éditeur SQL) :
--   insert into public.player_roles (user_id, role)
--   select id, 'admin' from auth.users where email = '<e-mail du compte>'
--   on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Les courriers
-- ---------------------------------------------------------------------
-- `recipient_id` NULL : courrier à tous les joueurs DÉJÀ inscrits à
-- l'envoi (un compte créé après ne le reçoit pas — un dédommagement ne
-- s'adresse pas à qui n'a rien subi). Renseigné : un seul destinataire.
create table if not exists public.mails (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 2000),
  -- Miniature : image réduite côté client (WebP, data URL). Bornée : ce
  -- n'est pas un disque.
  thumbnail text check (thumbnail is null or (thumbnail like 'data:image/%' and char_length(thumbnail) <= 300000)),
  gift_tides integer not null default 0 check (gift_tides between 0 and 100000),
  gift_xp integer not null default 0 check (gift_xp between 0 and 100000),
  -- `[{ "boosterId": "standard", "count": 2 }, …]`
  gift_boosters jsonb not null default '[]'::jsonb check (jsonb_typeof(gift_boosters) = 'array'),
  recipient_id uuid references public.profiles (id) on delete cascade,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mails_created_at_idx on public.mails (created_at desc);
create index if not exists mails_recipient_idx on public.mails (recipient_id) where recipient_id is not null;

alter table public.mails enable row level security;
revoke all on table public.mails from anon, authenticated;

-- Ce que chaque joueur a fait d'un courrier : lu, cadeaux réclamés.
create table if not exists public.mail_receipts (
  mail_id uuid not null references public.mails (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz,
  claimed_at timestamptz,
  primary key (mail_id, user_id)
);

alter table public.mail_receipts enable row level security;
revoke all on table public.mail_receipts from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Réclamer les cadeaux d'un courrier (atomique, une seule fois)
-- ---------------------------------------------------------------------
create or replace function public.claim_mail_gift(p_user_id uuid, p_mail_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_mail public.mails%rowtype;
  v_joined timestamptz;
  v_entry jsonb;
  v_count integer;
begin
  perform public.assert_server_caller('claim_mail_gift');

  select * into v_mail from public.mails where id = p_mail_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Courrier introuvable.');
  end if;

  -- Le courrier doit être adressé à ce joueur (même règle que la boîte).
  if v_mail.recipient_id is not null then
    if v_mail.recipient_id <> p_user_id then
      return jsonb_build_object('ok', false, 'error', 'Courrier introuvable.');
    end if;
  else
    select created_at into v_joined from public.profiles where id = p_user_id;
    if v_joined is null or v_joined > v_mail.created_at then
      return jsonb_build_object('ok', false, 'error', 'Courrier introuvable.');
    end if;
  end if;

  if v_mail.gift_tides = 0 and v_mail.gift_xp = 0 and jsonb_array_length(v_mail.gift_boosters) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Ce courrier ne contient pas de cadeau.');
  end if;

  insert into public.mail_receipts as r (mail_id, user_id, read_at, claimed_at)
  values (p_mail_id, p_user_id, now(), now())
  on conflict (mail_id, user_id) do update
    set claimed_at = now(), read_at = coalesce(r.read_at, now())
    where r.claimed_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cadeaux déjà réclamés.');
  end if;

  if v_mail.gift_tides > 0 then
    insert into public.player_currency (user_id, balance) values (p_user_id, v_mail.gift_tides)
    on conflict (user_id) do update set balance = player_currency.balance + v_mail.gift_tides, updated_at = now();
    insert into public.currency_transactions (user_id, amount, reason, reference_id)
    values (p_user_id, v_mail.gift_tides, 'mail_gift', p_mail_id);
  end if;

  if v_mail.gift_xp > 0 then
    insert into public.player_progression (user_id, xp_total) values (p_user_id, v_mail.gift_xp)
    on conflict (user_id) do update set xp_total = player_progression.xp_total + v_mail.gift_xp, updated_at = now();
  end if;

  for v_entry in select * from jsonb_array_elements(v_mail.gift_boosters) loop
    v_count := coalesce((v_entry ->> 'count')::integer, 0);
    if v_count > 0 then
      insert into public.player_boosters (user_id, booster_definition_id, quantity)
      values (p_user_id, v_entry ->> 'boosterId', v_count)
      on conflict (user_id, booster_definition_id) do update set
        quantity = player_boosters.quantity + v_count, updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.claim_mail_gift(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_mail_gift(uuid, uuid) to service_role;
