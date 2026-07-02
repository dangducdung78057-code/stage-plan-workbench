// Non-sensitive columns of the global `settings` row that are safe to expose
// to any authenticated user. The `webhook_secret` column is intentionally
// excluded — access it via the `get_webhook_secret` / `set_webhook_secret`
// admin-gated RPCs instead.
export const SETTINGS_SAFE_COLUMNS =
  "id,api_mode,api_base_url,updated_at," +
  "procurement_candidates_enabled,procurement_provider_enabled," +
  "procurement_export_attachment_enabled,procurement_provider," +
  "procurement_api_base_url,webhook_enabled,webhook_url,webhook_events";
