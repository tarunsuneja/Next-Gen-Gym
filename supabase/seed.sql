-- Local development seed (loaded by `supabase start` / `supabase db reset`).
-- Provisions an admin (owner), a staff (reception) account, a second
-- non-staff account used to exercise staff access grants, a gym and the
-- default membership plans so the app can be exercised against a real local
-- Postgres.
--
--   Admin:      owner@gym.local / password123  (role: owner  -> "Admin")
--   Staff:      staff@gym.local / password123  (role: reception -> "Staff")
--   Non-staff:  coach@gym.local / password123  (no access until granted)

do $$
declare
  uid uuid := '00000000-0000-0000-0000-0000000000a1';
  uid2 uuid := '00000000-0000-0000-0000-0000000000a2';
  uid3 uuid := '00000000-0000-0000-0000-0000000000a3';
  gym uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'owner@gym.local', crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid,
    jsonb_build_object('sub', uid::text, 'email', 'owner@gym.local'),
    'email', uid::text, now(), now(), now()
  );

  -- A second account that is not yet staff: used to exercise staff access grants.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid2, 'authenticated', 'authenticated',
    'coach@gym.local', crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid2,
    jsonb_build_object('sub', uid2::text, 'email', 'coach@gym.local'),
    'email', uid2::text, now(), now(), now()
  );

  -- A reception (staff) account with gym access.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid3, 'authenticated', 'authenticated',
    'staff@gym.local', crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid3,
    jsonb_build_object('sub', uid3::text, 'email', 'staff@gym.local'),
    'email', uid3::text, now(), now(), now()
  );

  insert into public.gyms(name, phone, address)
  values ('The Next Generation Fitness Gym', '9000000000', 'Bengaluru')
  returning id into gym;

  insert into public.staff_profiles(user_id, gym_id, role, enabled)
  values
    (uid, gym, 'owner', true),
    (uid3, gym, 'reception', true);

  insert into public.plans(gym_id, name, months, price)
  values
    (gym, 'Basic Package', 1, 120000),
    (gym, 'Standard Package', 3, 300000),
    (gym, 'Premium Package', 6, 550000),
    (gym, 'Ultimate Package', 12, 1020000);
end $$;
