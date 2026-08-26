-- ===========================================================================
-- Backstage — accounts and data ownership
-- ===========================================================================
--
-- One idea runs through this whole file: every row has exactly one owner, and
-- the database — not the client — is what enforces it.
--
--     auth.users
--          |
--          v
--     profiles                       display data for the account
--          |
--          +---- projects            a folder, a world, a cast
--          |         |
--          |         +---- agents
--          |         +---- conversations ---- messages
--          |         +---- cases
--          |
--          +---- user_settings       orchestration limits, per account
--
-- Ownership is keyed on `auth.users.id`, the Supabase UUID, and never on an
-- email address or a display name. Both of those change, and two accounts can
-- share a project name; ownership keyed on any of them would mean a user
-- renaming themselves either loses their work or inherits somebody else's.
--
-- ---------------------------------------------------------------------------
-- On id types
-- ---------------------------------------------------------------------------
--
-- Application ids are `text`, not `uuid`. Backstage generates them locally
-- ("proj_m8x1a0", "jane", "case_m91b02") because it is a local-first desktop
-- app: a project exists, is opened and is worked in before anything has been
-- uploaded, and it cannot wait for a server to name it. `user_id` is a real
-- `uuid` with a foreign key into `auth.users`, because that one is issued by
-- Supabase and is the only id here that has to be globally unique.
--
-- ---------------------------------------------------------------------------
-- What is deliberately NOT here
-- ---------------------------------------------------------------------------
--
--   provider API keys   OpenAI/Anthropic/Gemini keys never reach this
--                       database. They are encrypted with the OS keychain on
--                       the machine that owns them (see credentials/
--                       secureStore.ts) and are never sent over IPC, let alone
--                       over the network. There is no column for one anywhere
--                       in this schema, which is the strongest possible
--                       statement that none will be stored.
--   source files        the user's repository stays on their disk.
--   terminal output     a live process's stdout routinely contains tokens and
--                       paths echoed by other tools.
--   agent_connections   requested as a table; implemented as `can_talk_to` and
--                       `leads` arrays on `agents`, because that is the shape
--                       the application actually reads and writes them in. A
--                       join table would be a second copy of the same facts,
--                       kept in step by hand.
--   project_settings    a Backstage project's settings *are* its columns —
--                       theme, roster, team lead. A separate table would hold
--                       one row per project with the same data in it.
--
-- ---------------------------------------------------------------------------
-- Applying this
-- ---------------------------------------------------------------------------
--
--   supabase db push                     (with the Supabase CLI linked)
--   or paste into Dashboard → SQL Editor and run
--
-- It is written to be re-runnable: every object is created `if not exists` and
-- every policy is dropped before being created.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Application-facing account data. Supabase Auth owns authentication and this
-- table never duplicates a credential: no password, no token, no provider
-- identity. Just the name and picture Backstage renders in the account menu.
--
-- The primary key IS `auth.users.id`, rather than a separate id with a foreign
-- key beside it. That makes "one profile per user" a structural guarantee and
-- makes every policy in this file a comparison against `auth.uid()`.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
-- The container everything else hangs off. A project is one workspace folder,
-- one world, one cast and one team lead.
--
-- `workspace_path` is the absolute path on the machine the project was created
-- on. It is metadata about *where* work happens and never the work itself —
-- nothing in Backstage reads a file under it on the strength of this row. It is
-- stored because it is what identifies a project to a returning user.

create table if not exists public.projects (
  id                text primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  workspace_path    text,
  theme_id          text not null default 'detective',
  character_roster  jsonb not null default '[]'::jsonb,
  god_agent_id      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);


-- ---------------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------------
-- Who an agent is: its name, role, instructions, permissions and which model
-- answers for it. Configuration only — never what it is doing right now, which
-- does not survive the process that was doing it.
--
-- `user_id` is carried here as well as on the project. It is redundant against
-- `project_id`, and that redundancy is the point: it lets the RLS policy be a
-- direct `auth.uid() = user_id` comparison on an indexed column rather than a
-- subquery into `projects` on every row of every read.

create table if not exists public.agents (
  id                text primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  project_id        text not null references public.projects (id) on delete cascade,
  name              text not null,
  display_name      text,
  role              text not null default 'Agent',
  -- Which provider, never the key for it. "openai" is not a secret; the
  -- credential behind it has no column in this database at all.
  provider_id       text not null default 'openai',
  model_id          text,
  instructions      text not null default '',
  capabilities      jsonb not null default '[]'::jsonb,
  execution_profile text not null default 'normal',
  character_slot    integer not null default 0,
  enabled           boolean not null default true,
  spawned           boolean not null default false,
  -- Collaboration links, as the application holds them: who this agent may
  -- contact, and who it directs.
  can_talk_to       jsonb not null default '[]'::jsonb,
  leads             jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists agents_user_id_idx on public.agents (user_id);
create index if not exists agents_project_id_idx on public.agents (project_id);


-- ---------------------------------------------------------------------------
-- conversations / messages
-- ---------------------------------------------------------------------------
-- One agent's private memory of talking to the user, inside one project.
--
-- Two agents never share a conversation: the id is derived from the project and
-- the agent, so private memory being private is a property of the key rather
-- than of a `where` clause somebody has to remember. That is the same rule the
-- local store follows, where each transcript is its own file.

create table if not exists public.conversations (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  text not null references public.projects (id) on delete cascade,
  agent_id    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_id_idx on public.conversations (user_id);
create index if not exists conversations_project_id_idx on public.conversations (project_id);

create table if not exists public.messages (
  id              text primary key,
  conversation_id text not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- 'user' | 'agent' | 'system' | 'collaboration'
  kind            text not null default 'user',
  agent_id        text,
  -- "body" rather than "text", which is a type name in postgres.
  body            text not null default '',
  task_id         text,
  at              timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, at);
create index if not exists messages_user_id_idx on public.messages (user_id);


-- ---------------------------------------------------------------------------
-- cases
-- ---------------------------------------------------------------------------
-- One investigation: what the user asked for, and every task the team ran under
-- it. Project-scoped, so one user's Detective Office cases cannot appear inside
-- another user's project.

create table if not exists public.cases (
  id                 text primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  project_id         text not null references public.projects (id) on delete cascade,
  name               text not null default 'Investigation',
  description        text not null default '',
  status             text not null default 'open',
  task_ids           jsonb not null default '[]'::jsonb,
  involved_agent_ids jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists cases_user_id_idx on public.cases (user_id);
create index if not exists cases_project_id_idx on public.cases (project_id);


-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
-- Account-level rather than project-level: the orchestration limits govern how
-- far an agent chain may go and how much it may spend. They follow the person,
-- not the piece of work.

create table if not exists public.user_settings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  orchestration jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);


-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================
--
-- This is the part that actually makes the data private, and it is worth being
-- blunt about why it cannot be skipped.
--
-- Backstage ships the Supabase anon key inside the application. That is by
-- design — it is a public, publishable key — but it means anyone who installs
-- Backstage can send arbitrary PostgREST queries to this database. The client
-- filters by user and the main process refuses to serve another account's
-- rows, and *neither of those protects anything*: both run on the attacker's
-- own machine, where they can be edited.
--
-- These policies run inside the database, against `auth.uid()` taken from the
-- verified JWT. They are the only thing standing between one user's projects
-- and another user's `select`.
--
-- Postgres denies everything on an RLS-enabled table with no matching policy,
-- so the default is closed and each grant below is deliberate.
-- ===========================================================================

alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.agents        enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.cases         enable row level security;
alter table public.user_settings enable row level security;

-- Force RLS for the table owner too. Without this, a connection that happens
-- to be the owning role bypasses every policy below — which is exactly the
-- footgun that makes an RLS setup look correct in testing and not be.
alter table public.profiles      force row level security;
alter table public.projects      force row level security;
alter table public.agents        force row level security;
alter table public.conversations force row level security;
alter table public.messages      force row level security;
alter table public.cases         force row level security;
alter table public.user_settings force row level security;


-- --------------------------------------------------------------- profiles --
-- A profile is readable and writable only by the account it describes. There
-- is deliberately no "profiles are publicly readable" policy: Backstage has no
-- sharing, no teams and no member list, so nothing needs to look up anybody
-- else's name or picture. If collaboration is added later, that is the moment
-- to widen this — not before.

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);


-- --------------------------------------------------------------- projects --
-- Note both halves. `using` decides which existing rows a statement may see or
-- touch; `with check` decides what a row is allowed to look like afterwards.
-- An update policy with only `using` would let a user hand their project to
-- somebody else by setting `user_id` — visible to neither of them afterwards,
-- and not recoverable.

drop policy if exists "projects: read own" on public.projects;
create policy "projects: read own" on public.projects
  for select using ((select auth.uid()) = user_id);

drop policy if exists "projects: insert own" on public.projects;
create policy "projects: insert own" on public.projects
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "projects: update own" on public.projects;
create policy "projects: update own" on public.projects
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects: delete own" on public.projects;
create policy "projects: delete own" on public.projects
  for delete using ((select auth.uid()) = user_id);


-- ----------------------------------------------------------------- agents --
-- Owning the row is not enough on its own: the insert and update checks also
-- require the project to be one of yours. Without that second condition a user
-- could create an agent, correctly stamped with their own id, inside somebody
-- else's project — and it would then appear in that project's roster.

drop policy if exists "agents: read own" on public.agents;
create policy "agents: read own" on public.agents
  for select using ((select auth.uid()) = user_id);

drop policy if exists "agents: insert own" on public.agents;
create policy "agents: insert own" on public.agents
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "agents: update own" on public.agents;
create policy "agents: update own" on public.agents
  for update using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "agents: delete own" on public.agents;
create policy "agents: delete own" on public.agents
  for delete using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------- conversations --

drop policy if exists "conversations: read own" on public.conversations;
create policy "conversations: read own" on public.conversations
  for select using ((select auth.uid()) = user_id);

drop policy if exists "conversations: insert own" on public.conversations;
create policy "conversations: insert own" on public.conversations
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "conversations: update own" on public.conversations;
create policy "conversations: update own" on public.conversations
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "conversations: delete own" on public.conversations;
create policy "conversations: delete own" on public.conversations
  for delete using ((select auth.uid()) = user_id);


-- --------------------------------------------------------------- messages --
-- Guarded twice: the message must be yours, and so must the conversation it
-- claims to belong to. A message row alone carries no project, so without the
-- second check a user could append to a conversation they cannot read —
-- injecting a line into another account's agent memory, which is the closest
-- thing this application has to putting words in somebody else's mouth.

drop policy if exists "messages: read own" on public.messages;
create policy "messages: read own" on public.messages
  for select using ((select auth.uid()) = user_id);

drop policy if exists "messages: insert own" on public.messages;
create policy "messages: insert own" on public.messages
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "messages: update own" on public.messages;
create policy "messages: update own" on public.messages
  for update using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "messages: delete own" on public.messages;
create policy "messages: delete own" on public.messages
  for delete using ((select auth.uid()) = user_id);


-- ------------------------------------------------------------------ cases --

drop policy if exists "cases: read own" on public.cases;
create policy "cases: read own" on public.cases
  for select using ((select auth.uid()) = user_id);

drop policy if exists "cases: insert own" on public.cases;
create policy "cases: insert own" on public.cases
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "cases: update own" on public.cases;
create policy "cases: update own" on public.cases
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "cases: delete own" on public.cases;
create policy "cases: delete own" on public.cases
  for delete using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------- user_settings --

drop policy if exists "user_settings: read own" on public.user_settings;
create policy "user_settings: read own" on public.user_settings
  for select using ((select auth.uid()) = user_id);

drop policy if exists "user_settings: insert own" on public.user_settings;
create policy "user_settings: insert own" on public.user_settings
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "user_settings: update own" on public.user_settings;
create policy "user_settings: update own" on public.user_settings
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- ===========================================================================
-- PROFILE CREATION
-- ===========================================================================
--
-- The profile row is created by the database when the account is, not by the
-- client after signing in. A profile that depends on the app remembering to
-- write it is a profile that is missing for anyone whose first sign-in
-- happened while the network dropped — and every screen that renders a name
-- then has to cope with there not being one.
--
-- `security definer` is required: the trigger runs during the insert into
-- `auth.users`, before any request context exists, so `auth.uid()` is null and
-- the RLS insert policy above would refuse it. The search path is pinned
-- because a `security definer` function that resolves names through a
-- caller-controlled `search_path` is a privilege-escalation bug.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    -- Google supplies the name under different keys depending on the grant.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  -- A profile may already exist if the row is being re-inserted or the app got
  -- there first. Creating the account must never fail because of this table.
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ===========================================================================
-- ACCOUNT DELETION
-- ===========================================================================
--
-- Lets an account delete itself.
--
-- The application deletes the user's *rows* directly — RLS permits that, and
-- the foreign keys cascade — but the `auth.users` row is in a schema the anon
-- key cannot touch. Without this function, "delete account" can only ever mean
-- "delete my data and leave the login behind", which is not what the words say.
--
-- `security definer` is required to reach `auth.users` at all. The safety of
-- that rests on two things, and both matter:
--
--   1. it takes no arguments. There is no id to pass, so there is no id to
--      tamper with — it can only ever delete the caller;
--   2. it reads `auth.uid()` from the verified JWT, and refuses when there
--      isn't one, so an unauthenticated caller does nothing.
--
-- The `search_path` is pinned for the usual reason: a `security definer`
-- function that resolves names through a caller-controlled search path is a
-- privilege-escalation bug.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'delete_own_account requires an authenticated caller';
  end if;

  -- Everything else cascades from auth.users via `on delete cascade`, but the
  -- rows are removed explicitly first so the outcome does not depend on the
  -- cascade being configured correctly on every table.
  delete from public.projects      where user_id = uid;
  delete from public.user_settings where user_id = uid;
  delete from public.profiles      where id      = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;


-- ===========================================================================
-- updated_at
-- ===========================================================================
-- Maintained by the database as well as sent by the client, so a row's
-- timestamp is true even when it was written by something that forgot to set
-- it. The mirror's merge rule compares these, and a wrong one there means
-- newer work being overwritten by older.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'projects', 'agents', 'conversations', 'cases', 'user_settings'
  ]
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t
    );
  end loop;
end;
$$;
