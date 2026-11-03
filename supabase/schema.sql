-- Rode no SQL Editor do Supabase.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('artigo','noticia')),
  title text not null,
  html text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- Visitantes veem só o publicado; usuário logado vê tudo.
create policy "read published or authed" on public.posts for select
  using (published or auth.uid() is not null);
create policy "authed insert" on public.posts for insert to authenticated with check (true);
create policy "authed update" on public.posts for update to authenticated using (true) with check (true);
create policy "authed delete" on public.posts for delete to authenticated using (true);

-- IMPORTANTE: em Authentication > Providers > Email desative "Allow new users to sign up"
-- e crie seu usuário manualmente em Authentication > Users. Assim só você consegue escrever.
