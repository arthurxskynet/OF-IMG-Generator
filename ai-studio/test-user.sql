-- Create a confirmed Supabase auth user with password, ensure identity + profile.
-- Change v_password if you want a different password.
do $$
declare
  v_email     text := 'passarthur2003@icloud.com';
  v_password  text := 'Test123!@#';
  v_user_id   uuid;
begin
  -- Ensure required extensions
  create extension if not exists pgcrypto;

  -- Upsert user in auth.users
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    insert into auth.users (
      id,
      instance_id,
      role,
      aud,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      last_sign_in_at,
      confirmation_sent_at
    ) values (
      uuid_generate_v4(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers', array['email']),
      '{}'::jsonb,
      false,
      now(),
      now(),
      now(),
      now()
    )
    returning id into v_user_id;
  else
    -- If user exists, update password and confirm email
    update auth.users
      set encrypted_password = crypt(v_password, gen_salt('bf')),
          email_confirmed_at = now(),
          updated_at = now()
      where id = v_user_id;
  end if;

  -- Ensure email identity exists
  if not exists (
    select 1 from auth.identities
    where provider = 'email' and user_id = v_user_id
  ) then
    insert into auth.identities (
      id,
      provider,
      provider_id,
      user_id,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      uuid_generate_v4(),
      'email',
      v_email,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      now(),
      now(),
      now()
    );
  end if;

  -- Optional: create profiles row
  insert into public.profiles (user_id, full_name)
  values (v_user_id, split_part(v_email, '@', 1))
  on conflict (user_id) do nothing;
end $$;
