-- Run once in the project's SQL Editor. No existing data is removed.
create table if not exists public.kopit_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null,
 revision bigint not null default 0 check (revision >= 0),
 updated_at timestamptz not null default now()
);
alter table public.kopit_accounts enable row level security;
drop policy if exists owner_read on public.kopit_accounts;
create policy owner_read on public.kopit_accounts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.kopit_accounts from anon, authenticated;
grant select on public.kopit_accounts to authenticated;

create or replace function public.kopit_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r public.kopit_accounts; m text := to_char(now() at time zone 'Europe/Moscow','YYYY-MM');
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.kopit_accounts(user_id,state) values (u,jsonb_build_object(
 'month',m,'budget',17500000,'balance',0,'reserve',0,'free',0,
 'categories','[]'::jsonb,'transactions','[]'::jsonb,'checked_days','[]'::jsonb,
 'goals',jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'name','Ещё один месяц запаса','target',17500000,'saved',0,'reserve',true,'icon','reserve')),
 'reminders',jsonb_build_object('daily','21:00','day',1,'enabled',false),
 'appearance',jsonb_build_object('icons_only',false))) on conflict (user_id) do nothing;
 select * into r from public.kopit_accounts where user_id=u;
 return jsonb_build_object('state',r.state,'revision',r.revision);
end $$;

create or replace function public.kopit_save(p_state jsonb,p_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r public.kopit_accounts; k text; n numeric;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>5000000 then
  raise exception 'Invalid account data' using errcode='22023';
 end if;
 if not (p_state ?& array['month','budget','balance','reserve','free','categories','goals','transactions','checked_days','reminders','appearance']) or
 coalesce(p_state->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid account fields' using errcode='22023'; end if;
 foreach k in array array['budget','balance','reserve','free'] loop
  if jsonb_typeof(p_state->k)<>'number' then raise exception 'Invalid amount' using errcode='22023'; end if;
  n := (p_state->>k)::numeric;
  if n<>trunc(n) or abs(n)>9007199254740991 or (k<>'balance' and n<0) or (k='budget' and n=0) then raise exception 'Invalid amount' using errcode='22023'; end if;
 end loop;
 foreach k in array array['categories','goals','transactions','checked_days'] loop
  if jsonb_typeof(p_state->k)<>'array' then raise exception 'Invalid list' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(p_state->'reminders')<>'object' or jsonb_typeof(p_state->'appearance')<>'object' then raise exception 'Invalid settings' using errcode='22023'; end if;
 update public.kopit_accounts set state=p_state,revision=revision+1,updated_at=now() where user_id=u and revision=p_revision returning * into r;
 if not found then raise exception 'Account changed; reload before saving' using errcode='K4090'; end if;
 return jsonb_build_object('state',r.state,'revision',r.revision);
end $$;
revoke all on function public.kopit_load() from public, anon;
revoke all on function public.kopit_save(jsonb,bigint) from public, anon;
grant execute on function public.kopit_load() to authenticated;
grant execute on function public.kopit_save(jsonb,bigint) to authenticated;
