-- The customer can abandon a checkout from their own phone. Until Phase B the
-- kiosk is the only one that can cancel; this lets the phone do it too.

create or replace function public.cancel_my_checkout(p_tx uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.transactions
     set status = 'cancelled',
         updated_at = now()
   where id = p_tx
     and status in ('created', 'awaiting_payment')
     and (
       customer_id = auth.uid()
       or (customer_id is null and created_at > now() - interval '2 hours')
     );

  if not found then
    raise exception 'nothing to cancel' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_type, actor_id, action, entity, entity_id)
  values ('customer', auth.uid(), 'checkout.cancelled', 'transactions', p_tx);
end;
$$;

revoke execute on function public.cancel_my_checkout(uuid) from public, anon;
grant execute on function public.cancel_my_checkout(uuid) to authenticated;
