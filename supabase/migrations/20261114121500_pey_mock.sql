-- Per-store simulation switch. While true, the payment Edge Functions skip pey
-- and write a `mock-…` provider id so the kiosk can simulate the bank.
-- Phase B: the switch stays, but real keys live per store in Supabase secrets.

alter table public.stores
  add column if not exists pey_mock boolean not null default true;

create or replace function public.set_pey_mock(p_mock boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := public.current_staff_store_id();
begin
  if v_store is null then
    raise exception 'not staff' using errcode = '42501';
  end if;

  update public.stores set pey_mock = p_mock where id = v_store;
  return p_mock;
end;
$$;

revoke execute on function public.set_pey_mock(boolean) from public, anon;
grant execute on function public.set_pey_mock(boolean) to authenticated;
