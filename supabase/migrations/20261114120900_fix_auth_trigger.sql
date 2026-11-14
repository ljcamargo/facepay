-- Fix + backfill: anonymous users created by the Auth API have
-- raw_app_meta_data = {} (not {"provider":"anonymous"}), so the first trigger
-- condition never matched and no customers row was created.
-- `auth.users.is_anonymous` is the reliable signal.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_anonymous is true
     or coalesce(new.raw_app_meta_data, '{}'::jsonb) ->> 'provider' = 'anonymous' then
    insert into public.customers (id) values (new.id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Backfill anyone created between the first migration and this one.
insert into public.customers (id)
select u.id
from auth.users u
left join public.customers c on c.id = u.id
where u.is_anonymous is true
  and c.id is null;

-- set_my_phone must not silently succeed when the profile row is missing.
create or replace function public.set_my_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_e164   text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if v_digits like '52%' then v_digits := substr(v_digits, 3); end if;
  if length(v_digits) = 11 and v_digits like '1%' then v_digits := substr(v_digits, 2); end if;

  if length(v_digits) <> 10 or v_digits ~ '^(\d)\1{9}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;

  v_e164 := '+52' || v_digits;

  insert into public.customers as c (id, phone_e164, last_seen_at)
  values (auth.uid(), v_e164, now())
  on conflict (id) do update
    set phone_e164 = excluded.phone_e164,
        last_seen_at = excluded.last_seen_at;

  insert into public.audit_log (actor_type, actor_id, action, entity, entity_id, data)
  values ('customer', auth.uid(), 'phone.set', 'customers', auth.uid(),
          jsonb_build_object('phone_masked', '•••• ' || right(v_e164, 4)));

  return v_e164;
end;
$$;

revoke execute on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;
