-- "Pagar con mi celular" without enrolling a face: the customer types their own
-- number on their own phone and the checkout moves to awaiting_payment.
-- Phase A still simulates the bank; the shape is exactly what Phase B needs.

create or replace function public.start_phone_payment(p_tx uuid, p_phone text)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_e164   text;
  v_tx     public.transactions;
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

  select * into v_tx from public.transactions
  where id = p_tx and status = 'created' and created_at > now() - interval '2 hours'
  for update;

  if v_tx.id is null then
    raise exception 'checkout not available' using errcode = 'P0002';
  end if;

  update public.customers
     set phone_e164 = v_e164, last_seen_at = now()
   where id = auth.uid();

  update public.transactions
     set customer_id = auth.uid(),
         phone_e164 = v_e164,
         method = 'manual_pn',
         status = 'awaiting_payment',
         expires_at = now() + interval '10 minutes'
   where id = p_tx
   returning * into v_tx;

  insert into public.audit_log (actor_type, actor_id, store_id, action, entity, entity_id)
  values ('customer', auth.uid(), v_tx.store_id, 'payment.phone_started', 'transactions', p_tx);

  return v_tx;
end;
$$;

revoke execute on function public.start_phone_payment(uuid, text) from public, anon;
grant execute on function public.start_phone_payment(uuid, text) to authenticated;
