// Front-end configuration.
// Supabase anon keys are designed to be public client keys, but never place a service-role key here.
window.SECURITY_ALERT_CONFIG = {
  DEMO_MODE: true,
  SUPABASE_FUNCTION_URL: "https://YOUR_PROJECT_REF.supabase.co/functions/v1/submit-security-incident",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
};
