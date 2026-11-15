-- The onboarding QR carries the transaction id, so the phone can show the store
-- and amount without an account. Only amount/concept/store leak, and only for
-- recent checkouts.

create or replace function public.public_checkout_info(p_tx uuid)
returns table (
  amount_cents integer,
  concept      text,
  store_name   text,
  status       public.tx_status
)
language sql
stable
security definer
set search_path = public
as $$
  select t.amount_cents, t.concept, s.name, t.status
  from public.transactions t
  join public.stores s on s.id = t.store_id
  where t.id = p_tx
    and t.created_at > now() - interval '2 hours';
$$;

revoke execute on function public.public_checkout_info(uuid) from public;
grant execute on function public.public_checkout_info(uuid) to anon, authenticated;
