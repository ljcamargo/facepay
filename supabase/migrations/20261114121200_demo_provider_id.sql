-- Phase A has no pey call, but the schema refuses a paid row without a provider
-- id (paid_needs_provider_id). Write an obviously fake one so the ledger stays
-- honest and Phase B can overwrite it with the real ULID.

create or replace function public.demo_mark_paid(p_tx uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := public.current_staff_store_id();
  v_tx    public.transactions;
begin
  if v_store is null then
    raise exception 'not staff' using errcode = '42501';
  end if;

  select * into v_tx from public.transactions
  where id = p_tx and store_id = v_store
  for update;

  if v_tx.id is null then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  if v_tx.status = 'paid' then
    return v_tx;
  end if;

  update public.transactions
     set status = 'paid',
         paid_at = now(),
         pey_transaction_id = coalesce(pey_transaction_id, 'demo-' || p_tx::text),
         payer_bank_code = 40012,
         payer_clabe_last4 = '8842',
         late_payment = (v_tx.status = 'cancelled')
   where id = p_tx
   returning * into v_tx;

  return v_tx;
end;
$$;

revoke execute on function public.demo_mark_paid(uuid) from public, anon;
grant execute on function public.demo_mark_paid(uuid) to authenticated;
