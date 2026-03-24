-- COO messaging: threads between COO ↔ admin and COO ↔ patients
create table if not exists public.coo_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,          -- e.g. "admin" or patient user_id
  thread_type text not null check (thread_type in ('admin', 'patient')),
  sender_id uuid not null,
  sender_role text not null check (sender_role in ('coo', 'admin', 'patient')),
  sender_name text not null default '',
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.coo_messages enable row level security;

-- COO / admin can read & write all rows; patients can only read/write their own thread
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'coo_messages' and policyname = 'coo_messages_select') then
    create policy "coo_messages_select" on public.coo_messages for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'coo_messages' and policyname = 'coo_messages_insert') then
    create policy "coo_messages_insert" on public.coo_messages for insert with check (auth.uid() = sender_id);
  end if;
end $$;

create index if not exists coo_messages_thread_idx on public.coo_messages (thread_id, created_at);

-- Enable realtime so postgres_changes subscriptions work
do $$ begin
  alter publication supabase_realtime add table public.coo_messages;
exception when duplicate_object then null;
end $$;
