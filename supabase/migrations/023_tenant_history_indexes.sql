-- Tenant-scoped histories and bounded latest-record reads.
-- On a large hosted database, build equivalent indexes CONCURRENTLY in a
-- separately managed rollout before this transactional migration is marked applied.
create index if not exists audit_logs_gym_created_idx on public.audit_logs(gym_id,created_at desc);
create index if not exists message_logs_gym_created_idx on public.message_logs(gym_id,created_at desc);
create index if not exists payments_gym_paid_idx on public.payments(gym_id,paid_at,id);
create index if not exists reminder_logs_gym_contacted_idx on public.reminder_logs(gym_id,contacted_at);
create index if not exists memberships_gym_end_active_idx on public.memberships(gym_id,end_date,member_id) where not cancelled;
create index if not exists memberships_gym_due_active_idx on public.memberships(gym_id,due_date,member_id) where not cancelled;
create index if not exists message_logs_daily_outgoing_idx on public.message_logs(gym_id,((created_at at time zone 'Asia/Kolkata')::date)) where direction='out';
