/** Admin invitations carry an implicit fragment even when regular sign-in uses PKCE. */
export function takeInvitation(url: URL) {
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (fragment.get("type") !== "invite") return null;
  const access_token = fragment.get("access_token");
  const refresh_token = fragment.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  url.hash = "";
  return { access_token, refresh_token };
}
