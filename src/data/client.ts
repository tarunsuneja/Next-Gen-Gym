import type { Database } from "./database.generated";
import { createClient } from "@supabase/supabase-js";
import { takeInvitation } from "./invitation";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const invitationUrl =
  typeof window !== "undefined" ? new URL(window.location.href) : null;
const invitation =
  url && key && invitationUrl ? takeInvitation(invitationUrl) : null;
if (invitation && invitationUrl)
  window.history.replaceState(
    window.history.state,
    "",
    invitationUrl.pathname + invitationUrl.search,
  );
export const supabase =
  url && key
    ? createClient<Database>(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
// setSession verifies the token with Auth; it never grants developer privileges.
export const invitationSession =
  invitation && supabase
    ? supabase.auth
        .setSession(invitation)
        .then(({ error }) => error)
        .catch(
          () =>
            new Error("Invitation sign-in failed. Request a new invitation."),
        )
    : null;
