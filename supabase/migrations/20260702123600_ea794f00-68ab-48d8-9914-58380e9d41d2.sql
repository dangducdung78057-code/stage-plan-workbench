CREATE TABLE public.release_freezes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate text NOT NULL,
  baseline text NOT NULL,
  capability_snapshot jsonb NOT NULL,
  status text NOT NULL,
  rule text,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT release_freezes_gate_chk CHECK (gate IN ('G0','G1','G2','G3')),
  CONSTRAINT release_freezes_status_chk CHECK (status IN ('frozen','candidate_frozen','rejected'))
);

GRANT SELECT, INSERT ON public.release_freezes TO authenticated;
GRANT ALL ON public.release_freezes TO service_role;

ALTER TABLE public.release_freezes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "release_freezes read all authed"
  ON public.release_freezes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "release_freezes insert own"
  ON public.release_freezes FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE INDEX release_freezes_created_at_idx ON public.release_freezes (created_at DESC);