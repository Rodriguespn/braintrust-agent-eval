-- Initial schema: posts and comments tables
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "Users can read own posts"
  on public.posts for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert own posts"
  on public.posts for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update own posts"
  on public.posts for update
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can delete own posts"
  on public.posts for delete
  to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "Users can read comments on own posts"
  on public.comments for select
  to authenticated
  using (
    post_id in (
      select id from public.posts where user_id = (select auth.uid())
    )
    or user_id = (select auth.uid())
  );

create policy "Users can insert comments"
  on public.comments for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can delete own comments"
  on public.comments for delete
  to authenticated
  using (user_id = (select auth.uid()));

create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_comments_post_id on public.comments(post_id);
create index if not exists idx_comments_user_id on public.comments(user_id);
