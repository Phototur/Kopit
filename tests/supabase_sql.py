"""Integration validation against disposable Docker PostgreSQL (no real project)."""
import subprocess
from pathlib import Path
NAME='kopit-sql-test'
def sql(source):
 r=subprocess.run(['docker','exec','-i',NAME,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=source,text=True,capture_output=True)
 if r.returncode: raise AssertionError(r.stderr)
 return r.stdout
sql("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');")
sql(Path('supabase/migrations/202610100001_accounts.sql').read_text())
sql(Path('supabase/migrations/202610100001_accounts.sql').read_text())
sql("""
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.kopit_load();
select public.kopit_save((public.kopit_load()->'state') || '{"balance":12345}',0);
do $$ begin
 begin perform public.kopit_save(public.kopit_load()->'state',0); raise exception 'stale write succeeded'; exception when sqlstate 'K4090' then null; end;
 begin update public.kopit_accounts set revision=99; raise exception 'direct update succeeded'; exception when insufficient_privilege then null; end;
 begin perform public.kopit_save('{"budget":1}',1); raise exception 'invalid state succeeded'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin if (select count(*) from public.kopit_accounts)<>0 then raise exception 'foreign data visible'; end if; end $$;
select public.kopit_load();
do $$ begin if (public.kopit_load()->'state'->>'balance')::int<>0 then raise exception 'foreign balance loaded'; end if; if (select count(*) from public.kopit_accounts)<>1 then raise exception 'RLS failed'; end if; end $$;
reset role;
set role anon;
do $$ begin
 begin perform public.kopit_load(); raise exception 'anonymous load succeeded'; exception when insufficient_privilege then null; end;
 begin select * from public.kopit_accounts; raise exception 'anonymous read succeeded'; exception when insufficient_privilege then null; end;
end $$;
""")
print('SQL passed: repeatable migration, isolated owners, anonymous access denied, direct writes denied, invalid state rejected, stale revision rejected.')
