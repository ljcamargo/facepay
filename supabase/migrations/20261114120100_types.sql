-- Closed sets are enums: a typo becomes an error instead of a silent string.

create type public.staff_role as enum ('owner', 'manager', 'cashier');

create type public.device_status as enum ('pending', 'active', 'revoked');

create type public.customer_status as enum ('active', 'blocked', 'deleted');

create type public.tx_status as enum (
  'created',          -- checkout started, no payment method chosen yet
  'awaiting_payment', -- push sent or QR shown
  'paid',
  'expired',
  'cancelled',
  'failed'
);

create type public.tx_method as enum ('face_pn', 'manual_pn', 'codi_qr');

create type public.match_decision as enum (
  'matched',
  'ambiguous',
  'no_match',
  'low_quality',
  'liveness_fail',
  'model_error'
);

create type public.session_status as enum ('open', 'completed', 'expired', 'cancelled');
