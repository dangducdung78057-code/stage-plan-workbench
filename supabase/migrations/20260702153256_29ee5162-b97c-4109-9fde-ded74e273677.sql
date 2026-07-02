
-- 1. Roles infrastructure
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_read_own" ON public.user_roles;
CREATE POLICY "user_roles_read_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Backfill: existing users become admins to avoid breaking the app.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. release_freezes: restrict SELECT to owner
DROP POLICY IF EXISTS "release_freezes read all authed" ON public.release_freezes;
CREATE POLICY "release_freezes_read_own" ON public.release_freezes
  FOR SELECT TO authenticated USING (created_by = auth.uid());

-- 3. system_capabilities: signed-in only (no anon)
DROP POLICY IF EXISTS "system_capabilities read all" ON public.system_capabilities;
CREATE POLICY "system_capabilities_read_authed" ON public.system_capabilities
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.system_capabilities FROM anon;

-- 4. settings: hide webhook_secret column via column-level privileges.
-- Keep row-level permissive read for the other columns so non-admin app flows still work.
REVOKE SELECT, INSERT, UPDATE ON public.settings FROM authenticated, anon;
GRANT SELECT (
  id, api_mode, api_base_url, updated_at,
  procurement_candidates_enabled, procurement_provider_enabled,
  procurement_export_attachment_enabled, procurement_provider,
  procurement_api_base_url, webhook_enabled, webhook_url, webhook_events
) ON public.settings TO authenticated;
GRANT INSERT (
  id, api_mode, api_base_url,
  procurement_candidates_enabled, procurement_provider_enabled,
  procurement_export_attachment_enabled, procurement_provider,
  procurement_api_base_url, webhook_enabled, webhook_url, webhook_events
) ON public.settings TO authenticated;
GRANT UPDATE (
  api_mode, api_base_url,
  procurement_candidates_enabled, procurement_provider_enabled,
  procurement_export_attachment_enabled, procurement_provider,
  procurement_api_base_url, webhook_enabled, webhook_url, webhook_events, updated_at
) ON public.settings TO authenticated;

-- Admin-only helpers for the sensitive webhook_secret column
CREATE OR REPLACE FUNCTION public.get_webhook_secret()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;
  SELECT webhook_secret INTO v FROM public.settings WHERE id = 'global';
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_webhook_secret() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_webhook_secret() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_webhook_secret(_secret text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.settings (id, webhook_secret)
  VALUES ('global', NULLIF(_secret, ''))
  ON CONFLICT (id) DO UPDATE SET webhook_secret = NULLIF(_secret, ''), updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_webhook_secret(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_webhook_secret(text) TO authenticated;

-- 5. SECURITY DEFINER internal functions: set search_path and revoke from anon/authenticated.
-- These are called by SECURITY DEFINER queue functions and by service_role only.
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
