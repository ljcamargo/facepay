-- The push has to happen while the row is still `created`: it needs a customer,
-- but the provider call decides the status. So this now only attaches the match.
create or replace function public.confirm_face_payment(
  p_tx uuid,
  p_customer uuid,
  p_similarity real default null,
  p_liveness real default null
)
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
  if v_tx.status <> 'created' then
    raise exception 'transaction is not open' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.customers where id = p_customer and status = 'active') then
    raise exception 'customer not available' using errcode = '22023';
  end if;

  update public.transactions
     set customer_id = p_customer,
         match_similarity = p_similarity,
         liveness = p_liveness
   where id = p_tx
   returning * into v_tx;

  return v_tx;
end;
$$;

revoke execute on function public.confirm_face_payment(uuid, uuid, real, real) from public, anon;
grant execute on function public.confirm_face_payment(uuid, uuid, real, real) to authenticated;
