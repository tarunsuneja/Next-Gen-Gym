-- The cursor index covers the former audit-history prefix index as well.
drop index if exists public.audit_logs_gym_created_idx;
alter function public.get_gym_sections(text[]) set search_path=public,pg_temp;
