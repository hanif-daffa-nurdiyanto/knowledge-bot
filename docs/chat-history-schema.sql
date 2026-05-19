-- Paste this in Supabase SQL Editor if you cannot run migrations locally.

create table if not exists public.chat_conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_email text not null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'done' check (status in ('streaming', 'done', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations (user_email, updated_at desc);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at asc);

drop trigger if exists set_chat_conversations_updated_at on public.chat_conversations;
create trigger set_chat_conversations_updated_at
  before update on public.chat_conversations
  for each row
  execute function public.set_updated_at();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
