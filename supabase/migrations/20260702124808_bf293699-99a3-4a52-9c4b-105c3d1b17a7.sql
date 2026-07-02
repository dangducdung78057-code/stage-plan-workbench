CREATE OR REPLACE FUNCTION public.sync_pdf_capability(
  p_status text,
  p_enabled boolean,
  p_notes text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('PASS','WARN','FAIL','SKIP') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;
  UPDATE public.system_capabilities
     SET status = p_status,
         enabled = p_enabled,
         notes = p_notes,
         updated_at = now()
   WHERE module = 'pdf_export';
END;
$$;

REVOKE ALL ON FUNCTION public.sync_pdf_capability(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_pdf_capability(text, boolean, text) TO authenticated, service_role;