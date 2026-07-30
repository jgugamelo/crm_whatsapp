-- Migration 042: Fix Invitation and Member RPCs in public schema
-- Ensures PostgREST RPC calls find public.peek_invitation and public.redeem_invitation with correct search_path.

CREATE OR REPLACE FUNCTION public.peek_invitation(
  p_token_hash TEXT
) RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = wacrm, public
AS $$
DECLARE
  v_inv wacrm.account_invitations%ROWTYPE;
  v_account_name TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM wacrm.account_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'used');
  END IF;

  IF v_inv.expires_at <= NOW() THEN
    RETURN json_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT name INTO v_account_name
  FROM wacrm.accounts
  WHERE id = v_inv.account_id;

  RETURN json_build_object(
    'ok', true,
    'account_name', v_account_name,
    'role', v_inv.role,
    'expires_at', v_inv.expires_at
  );
END;
$$;

ALTER FUNCTION public.peek_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.peek_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_invitation(TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION wacrm.peek_invitation(p_token_hash TEXT) RETURNS JSON AS $$
  SELECT public.peek_invitation(p_token_hash);
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = wacrm, public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv wacrm.account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM wacrm.account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM wacrm.profiles p
  JOIN wacrm.accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM wacrm.contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM wacrm.conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM wacrm.broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM wacrm.automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM wacrm.flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM wacrm.pipelines WHERE account_id = v_old_account_id
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Cannot redeem invite: your personal account has existing data. Contact support or use a fresh email.'
      USING ERRCODE = '23505';
  END IF;

  UPDATE wacrm.profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role::wacrm.account_role_enum
  WHERE user_id = v_caller_id;

  UPDATE wacrm.account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM wacrm.accounts
  WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION wacrm.redeem_invitation(p_token_hash TEXT) RETURNS UUID AS $$
  SELECT public.redeem_invitation(p_token_hash);
$$ LANGUAGE sql SECURITY DEFINER;
