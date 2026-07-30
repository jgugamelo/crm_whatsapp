-- Migration 043: Fix User Bootstrapping Triggers & Resilient Invitation Redemption

-- 1. Fix handle_new_user trigger in wacrm and public schemas
CREATE OR REPLACE FUNCTION wacrm.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = wacrm, public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Insert personal account into wacrm.accounts
  INSERT INTO wacrm.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'Minha Conta'), NEW.id)
  RETURNING id INTO v_account_id;

  -- Insert profile into wacrm.profiles
  INSERT INTO wacrm.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner')
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = CASE WHEN wacrm.profiles.full_name IS NULL OR wacrm.profiles.full_name = '' THEN EXCLUDED.full_name ELSE wacrm.profiles.full_name END,
      email = EXCLUDED.email;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION wacrm.handle_new_user() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = wacrm, public
AS $$
BEGIN
  RETURN wacrm.handle_new_user();
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION wacrm.handle_new_user();

-- 2. Resilient redeem_invitation RPC
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = wacrm, public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_email TEXT;
  v_caller_name TEXT;
  v_inv wacrm.account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN := FALSE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Get caller details from auth.users
  SELECT email, COALESCE(raw_user_meta_data->>'full_name', '')
  INTO v_caller_email, v_caller_name
  FROM auth.users
  WHERE id = v_caller_id;

  -- Lookup and lock invitation
  SELECT * INTO v_inv
  FROM wacrm.account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite não encontrado' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este convite já foi utilizado' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Este convite expirou' USING ERRCODE = '22023';
  END IF;

  -- Check existing caller profile
  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM wacrm.profiles p
  LEFT JOIN wacrm.accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  -- If user is already in the target account, return target account id without error
  IF v_old_account_id IS NOT NULL AND v_old_account_id = v_inv.account_id THEN
    RETURN v_inv.account_id;
  END IF;

  -- Check if caller's personal account has real domain data
  IF v_old_account_id IS NOT NULL AND v_old_account_id <> v_inv.account_id THEN
    SELECT EXISTS (
      SELECT 1 FROM wacrm.contacts WHERE account_id = v_old_account_id
      UNION ALL SELECT 1 FROM wacrm.conversations WHERE account_id = v_old_account_id
      UNION ALL SELECT 1 FROM wacrm.broadcasts WHERE account_id = v_old_account_id
      UNION ALL SELECT 1 FROM wacrm.automations WHERE account_id = v_old_account_id
      UNION ALL SELECT 1 FROM wacrm.flows WHERE account_id = v_old_account_id
    ) INTO v_has_data;

    IF v_has_data THEN
      RAISE EXCEPTION 'Não é possível aceitar o convite: sua conta atual já contém dados salvos.'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Upsert profile pointing to target account and role
  INSERT INTO wacrm.profiles (user_id, email, full_name, account_id, account_role)
  VALUES (
    v_caller_id,
    v_caller_email,
    v_caller_name,
    v_inv.account_id,
    v_inv.role::wacrm.account_role_enum
  )
  ON CONFLICT (user_id) DO UPDATE
  SET account_id = EXCLUDED.account_id,
      account_role = EXCLUDED.account_role,
      full_name = CASE WHEN wacrm.profiles.full_name IS NULL OR wacrm.profiles.full_name = '' THEN EXCLUDED.full_name ELSE wacrm.profiles.full_name END;

  -- Mark invitation accepted
  UPDATE wacrm.account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  -- Cleanup old empty personal account if caller was owner of it
  IF v_old_account_id IS NOT NULL AND v_old_account_owner = v_caller_id THEN
    DELETE FROM wacrm.accounts
    WHERE id = v_old_account_id;
  END IF;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION wacrm.redeem_invitation(p_token_hash TEXT) RETURNS UUID AS $$
  SELECT public.redeem_invitation(p_token_hash);
$$ LANGUAGE sql SECURITY DEFINER;
