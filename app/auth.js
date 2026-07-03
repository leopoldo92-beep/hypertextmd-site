/* ============================================================================
   HyperText Markdown — shared account runtime (auth.js)
   ----------------------------------------------------------------------------
   One tiny module, two personalities:

   · REAL MODE  — when config.js has a Supabase URL + anon key, everything
     goes through the vendored supabase-js client (vendor/supabase.js).
   · DEV MODE   — when the keys are empty, accounts live in this browser's
     localStorage. Every flow is fully clickable, nothing is sent anywhere,
     and a visible badge says so.

   The page scripts only ever talk to `HMDAuth` — they never know which
   mode they are in. Zero dependencies, no build step.
   ========================================================================== */

window.HMDAuth = (function () {
  "use strict";

  var cfg = window.HMD_CONFIG || {};
  var DEV = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY;
  var LS = {
    session: "hmd.dev.session",
    profile: "hmd.dev.profile",
    prefs: "hmd.dev.prefs",
    referral: "hmd.dev.referral"
  };

  /* ------------------------------------------------------------ helpers */

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
  function uid() {
    /* Random id, shaped like a uuid so dev data matches the real schema. */
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function referralCode() {
    var chars = "abcdefghjkmnpqrstuvwxyz23456789"; /* no lookalikes */
    var out = "";
    for (var i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  /* Real-mode client (created lazily so dev mode never touches the vendor). */
  var client = null;
  function sb() {
    if (!client) client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return client;
  }

  var FREE_ENTITLEMENTS = {
    plan: "free",
    features: { mcp: false, cloudBrain: false, transcription: false, sync: false }
  };

  /* ------------------------------------------------------------ the API */

  var api = {

    isDevMode: DEV,

    /* --- session ------------------------------------------------------ */

    getSession: function () {
      if (DEV) return Promise.resolve(read(LS.session));
      return sb().auth.getSession().then(function (res) {
        return res.data.session ? { user: res.data.session.user, token: res.data.session.access_token } : null;
      });
    },

    /* Email magic link. Real mode sends an email; dev mode "sends" it
       instantly and signs the browser in on the spot. */
    signInWithEmail: function (email) {
      if (DEV) {
        var existing = read(LS.session);
        if (!existing || existing.user.email !== email) {
          write(LS.session, { user: { id: uid(), email: email, created_at: new Date().toISOString() } });
        }
        return Promise.resolve({ ok: true, instant: true });
      }
      return sb().auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.href.replace(/[^/]*$/, "account.html") }
      }).then(function (res) {
        if (res.error) return { ok: false, message: res.error.message };
        return { ok: true, instant: false };
      });
    },

    /* One-click OAuth. Each provider stays a polite no-op until Leo flips
       its flag in config.js after registering it (steps in CONNECT.md). */
    signInWithOAuth: function (provider) {
      var enabled = (cfg.OAUTH_PROVIDERS || {})[provider];
      if (!enabled || DEV) return Promise.resolve({ ok: false, reason: "not_connected" });
      /* Supabase's name for Microsoft is "azure". */
      var supabaseName = provider === "microsoft" ? "azure" : provider;
      return sb().auth.signInWithOAuth({
        provider: supabaseName,
        options: { redirectTo: window.location.href.replace(/[^/]*$/, "account.html") }
      }).then(function (res) {
        return res.error ? { ok: false, message: res.error.message } : { ok: true };
      });
    },

    signOut: function () {
      if (DEV) { localStorage.removeItem(LS.session); return Promise.resolve(); }
      return sb().auth.signOut().then(function () {});
    },

    /* --- profile ------------------------------------------------------ */

    getProfile: function () {
      if (DEV) return Promise.resolve(read(LS.profile) || { full_name: "", acronym: "", company: "" });
      return api.getSession().then(function (s) {
        if (!s) return null;
        return sb().from("profiles").select("full_name, acronym, company")
          .eq("id", s.user.id).maybeSingle().then(function (res) {
            return res.data || { full_name: "", acronym: "", company: "" };
          });
      });
    },

    saveProfile: function (p) {
      var clean = {
        full_name: String(p.full_name || "").slice(0, 120),
        acronym: String(p.acronym || "").toUpperCase().slice(0, 5),
        company: String(p.company || "").slice(0, 120)
      };
      if (DEV) { write(LS.profile, clean); return Promise.resolve({ ok: true }); }
      return api.getSession().then(function (s) {
        if (!s) return { ok: false, message: "Not signed in" };
        clean.id = s.user.id;
        return sb().from("profiles").upsert(clean).then(function (res) {
          return res.error ? { ok: false, message: res.error.message } : { ok: true };
        });
      });
    },

    /* --- preferences (kept local in both modes for now) ---------------- */

    getPrefs: function () {
      return Promise.resolve(read(LS.prefs) || { theme: "system", fitView: true, markNumbers: true, autoCompile: false });
    },
    savePrefs: function (p) {
      write(LS.prefs, p);
      return Promise.resolve({ ok: true });
    },

    /* --- entitlements (what the plan unlocks) --------------------------- */

    getEntitlements: function () {
      if (DEV) return Promise.resolve(FREE_ENTITLEMENTS);
      return api.getSession().then(function (s) {
        if (!s) return FREE_ENTITLEMENTS;
        return sb().from("entitlements").select("plan, features")
          .eq("user_id", s.user.id).maybeSingle().then(function (res) {
            return res.data || FREE_ENTITLEMENTS;
          });
      });
    },

    /* --- referrals ------------------------------------------------------ */

    getReferralCode: function () {
      if (DEV) {
        var code = read(LS.referral);
        if (!code) { code = referralCode(); write(LS.referral, code); }
        return Promise.resolve(code);
      }
      return api.getSession().then(function (s) {
        if (!s) return null;
        return sb().from("referrals").select("code").eq("owner", s.user.id)
          .maybeSingle().then(function (res) {
            if (res.data && res.data.code) return res.data.code;
            var code = referralCode();
            return sb().from("referrals").insert({ code: code, owner: s.user.id })
              .then(function () { return code; });
          });
      });
    },

    /* --- danger zone ----------------------------------------------------- */

    deleteAccount: function () {
      if (DEV) {
        Object.keys(LS).forEach(function (k) { localStorage.removeItem(LS[k]); });
        return Promise.resolve({ ok: true });
      }
      /* The browser client is not allowed to delete an auth user (that needs
         the service-role key, which never ships to a web page). We wipe the
         user's own rows — RLS lets them do that — and sign out. Full auth
         deletion is a one-click job in the Supabase dashboard. */
      return api.getSession().then(function (s) {
        if (!s) return { ok: false };
        var db = sb();
        return db.from("referrals").delete().eq("owner", s.user.id)
          .then(function () { return db.from("entitlements").delete().eq("user_id", s.user.id); })
          .then(function () { return db.from("profiles").delete().eq("id", s.user.id); })
          .then(function () { return db.auth.signOut(); })
          .then(function () { return { ok: true, note: "Data deleted and signed out. The login itself is removed by support." }; });
      });
    }
  };

  /* --------------------------------------------------- shared UI helpers */

  /* Small toast, bottom-center. */
  api.toast = function (msg) {
    var t = document.createElement("div");
    t.className = "hmd-toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 400);
    }, 3200);
  };

  /* Visible dev-mode badge on every page that includes this file. */
  if (DEV) {
    document.addEventListener("DOMContentLoaded", function () {
      var b = document.createElement("div");
      b.className = "hmd-devbadge";
      b.textContent = "DEV MODE — accounts are local to this browser";
      document.body.appendChild(b);
    });
  }

  return api;
})();
