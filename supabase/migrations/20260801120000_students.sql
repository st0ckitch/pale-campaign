-- Student accounts: created by a teacher (ID + email), activated via an
-- invite link with a one-time password, then ID + password sign-in.
-- RLS on with no policies — only the Edge Function (service role) has access.

create table if not exists students (
  school text not null,
  id text not null,
  name text not null default '',
  email text not null default '',
  class_code text,
  password_hash text not null,
  must_change boolean not null default true,
  invite_token text,
  created_at bigint not null,
  activated_at bigint,
  primary key (school, id)
);

create unique index if not exists students_invite_token
  on students (invite_token) where invite_token is not null;

create table if not exists student_tokens (
  token text primary key,
  school text not null,
  student_id text not null,
  created_at bigint not null
);

alter table students enable row level security;
alter table student_tokens enable row level security;
