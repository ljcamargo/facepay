-- Real API by default; simulation is now an explicit opt-in for camera work.
alter table public.stores alter column pey_mock set default false;
update public.stores set pey_mock = false;
