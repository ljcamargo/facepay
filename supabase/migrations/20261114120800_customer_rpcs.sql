-- Phase 3: the only three writes a customer can perform on their own record.
-- Everything is SECURITY DEFINER with an explicit auth.uid() guard; the client
-- never gets INSERT/UPDATE/DELETE on customers or face_templates.

-- Accepts "5512345678", "+525512345678" or "52 1 55 1234 5678" and stores E.164.
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

  -- strip a leading country code, then the legacy mobile "1"
  if v_digits like '52%' then v_digits := substr(v_digits, 3); end if;
  if length(v_digits) = 11 and v_digits like '1%' then v_digits := substr(v_digits, 2); end if;

  if length(v_digits) <> 10 or v_digits ~ '^(\d)\1{9}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;

  v_e164 := '+52' || v_digits;

  update public.customers
     set phone_e164 = v_e164,
         last_seen_at = now()
   where id = auth.uid();

  insert into public.audit_log (actor_type, actor_id, action, entity, entity_id, data)
  values ('customer', auth.uid(), 'phone.set', 'customers', auth.uid(),
          jsonb_build_object('phone_masked', '•••• ' || right(v_e164, 4)));

  return v_e164;
end;
$$;

-- Revokes every active template of the caller. Returns how many were revoked.
create or replace function public.revoke_my_face()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.face_templates
     set revoked_at = now()
   where customer_id = auth.uid()
     and revoked_at is null;

  get diagnostics v_count = row_count;

  insert into public.audit_log (actor_type, actor_id, action, entity, entity_id, data)
  values ('customer', auth.uid(), 'face.revoked', 'face_templates', auth.uid(),
          jsonb_build_object('templates', v_count));

  return v_count;
end;
$$;

-- Deletes the biometric link and the identifiers we control. The auth user stays
-- (deleting it needs the Admin API); it simply has nothing left to identify.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.face_templates
     set revoked_at = now()
   where customer_id = auth.uid()
     and revoked_at is null;

  update public.customers
     set phone_e164 = null,
         display_name = null,
         status = 'deleted',
         updated_at = now()
   where id = auth.uid();

  insert into public.audit_log (actor_type, actor_id, action, entity, entity_id)
  values ('customer', auth.uid(), 'account.deleted', 'customers', auth.uid());
end;
$$;

revoke execute on function public.set_my_phone(text) from public, anon;
revoke execute on function public.revoke_my_face() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;

grant execute on function public.set_my_phone(text) to authenticated;
grant execute on function public.revoke_my_face() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
