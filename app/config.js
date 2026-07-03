/* ============================================================================
   HyperText Markdown — account site configuration
   ----------------------------------------------------------------------------
   MORNING TODO (Leo): paste the two values from your Supabase project here.
   Supabase dashboard → Project Settings → API:
     - "Project URL"        → SUPABASE_URL   (looks like https://xxxx.supabase.co)
     - "anon public" key    → SUPABASE_ANON_KEY (a long token starting "eyJ...")

   The anon key is SAFE to put in a public web page — it only allows what the
   database row-level-security policies allow (see schema.sql). Never paste the
   "service_role" key here.

   While both values are empty strings, the site runs in DEV MODE:
   accounts live only in this browser's localStorage, nothing is sent
   anywhere, and a "DEV MODE" badge is shown on every page.
   ========================================================================== */

window.HMD_CONFIG = {
  SUPABASE_URL: "https://tmcbcjyphjbawxyrewhk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_r-NJMcwQ-QMgJPsLC57-dw_KCxvKol1",  // publishable key — safe in a public page, protected by row-level security

  /* Flip each of these to true AFTER you register the provider in the
     Supabase dashboard (steps in CONNECT.md). Until then the button shows a
     polite "not connected yet" message instead of a broken redirect. */
  OAUTH_PROVIDERS: {
    apple: false,      // at alpha — needs Apple Developer Program
    microsoft: false,  // Supabase calls this provider "azure"
    google: false,
    github: false
  }
};
