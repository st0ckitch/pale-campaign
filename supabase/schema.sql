-- Learning Hub — Supabase schema.
-- Paste this whole file into the Supabase dashboard → SQL Editor → Run.
--
-- Access model: every table has Row Level Security enabled with NO policies,
-- so the public Data API cannot read or write anything. Only the Edge
-- Function (which uses the service-role key) touches these tables.

create table if not exists classes (
  id text primary key,
  school text not null,
  name text not null,
  code text not null unique,
  roster jsonb not null default '[]',
  created_at bigint not null
);

create table if not exists exams (
  id text primary key,
  school text not null,
  data jsonb not null,
  created_at bigint not null
);

create table if not exists announcements (
  id text primary key,
  school text not null,
  title text not null,
  body text not null default '',
  date bigint not null
);

create table if not exists attempts (
  id text primary key,
  school text not null,
  class_code text not null,
  data jsonb not null,
  ts bigint not null
);

create table if not exists teacher_tokens (
  token text primary key,
  school text not null,
  created_at bigint not null
);

alter table classes enable row level security;
alter table exams enable row level security;
alter table announcements enable row level security;
alter table attempts enable row level security;
alter table teacher_tokens enable row level security;

create index if not exists attempts_school_ts on attempts (school, ts desc);
create index if not exists exams_school_created on exams (school, created_at desc);
