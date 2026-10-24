create extension if not exists pgcrypto;

create table meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null default 'Untitled meeting',
  recorded_at timestamptz not null default now(),
  duration_sec int,
  source text not null check (source in ('mic','tab','upload')),
  audio_path text,
  mime_type text,
  summary_language text not null default 'en',          -- 'en' | 'hi' | 'hinglish'
  status text not null default 'created' check (status in
    ('created','uploaded','transcribing','transcribed','extracting','ready','failed')),
  error text,
  consent_at timestamptz,
  consent_note text,
  off_record_ranges jsonb not null default '[]',          -- [{at_ms, paused_ms}] on the audio timeline
  tldr jsonb not null default '[]',                       -- string[] (max 3)
  chapters jsonb not null default '[]',                   -- [{title, segment_idx, start_ms}]
  dropped_count int not null default 0,                   -- AI items rejected for missing evidence
  ledger_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on meetings (owner_id, recorded_at desc);

create table segments (
  id bigserial primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  idx int not null,
  speaker int not null,
  start_ms int not null,
  end_ms int not null,
  text text not null,
  tsv tsvector generated always as (to_tsvector('simple', text)) stored,
  unique (meeting_id, idx)
);
create index on segments using gin (tsv);

create table people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index on people (owner_id, lower(name));

create table meeting_speakers (
  meeting_id uuid not null references meetings(id) on delete cascade,
  speaker int not null,
  person_id uuid references people(id) on delete set null,
  name_hint text,                                          -- from AI ("Hi, I'm Rahul")
  primary key (meeting_id, speaker)
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  quote text not null,
  segment_idx int not null,
  start_ms int not null,
  review text not null default 'pending' check (review in ('pending','confirmed','rejected')),
  created_at timestamptz not null default now()
);

create table commitments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  kind text not null check (kind in ('explicit','conditional','suggestion')),
  condition text,
  owner_speaker int,                                       -- diarization label; resolved to person later
  owner_person_id uuid references people(id) on delete set null,
  due_phrase text,
  due_date date,
  quote text not null,
  segment_idx int not null,
  start_ms int not null,
  review text not null default 'pending' check (review in ('pending','confirmed','rejected')),
  status text not null default 'open' check (status in ('open','in_progress','changed','done','dropped')),
  misses int not null default 0,                           -- consecutive meetings where owner present but not mentioned
  change_note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on commitments (owner_id, status);

create table commitment_events (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references commitments(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  status text not null check (status in ('done','in_progress','changed','not_mentioned')),
  quote text,
  segment_idx int,
  start_ms int,
  note text,
  created_at timestamptz not null default now()
);

create table shares (
  token text primary key,
  owner_id uuid not null,
  meeting_id uuid not null references meetings(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,  -- null = whole meeting
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table settings (
  owner_id uuid primary key,
  glossary text[] not null default '{}',
  summary_language text not null default 'en'
);

create table usage_daily (
  owner_id uuid not null,
  day date not null,
  audio_minutes numeric not null default 0,
  primary key (owner_id, day)
);

-- enable RLS everywhere (no policies => only service role can access)
alter table meetings enable row level security;
alter table segments enable row level security;
alter table people enable row level security;
alter table meeting_speakers enable row level security;
alter table decisions enable row level security;
alter table commitments enable row level security;
alter table commitment_events enable row level security;
alter table shares enable row level security;
alter table settings enable row level security;
alter table usage_daily enable row level security;

-- Grant full access to service_role
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('audio', 'audio', false, 52428800)
on conflict (id) do nothing;

