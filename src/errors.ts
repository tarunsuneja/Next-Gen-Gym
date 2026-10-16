type ErrorShape = { code?: unknown; status?: unknown };

export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const text = raw.trim() || "Something went wrong. Please try again.";
  const lower = text.toLowerCase();
  const shape = (typeof error === "object" && error ? error : {}) as ErrorShape;
  const code = String(shape.code ?? "");
  const status = Number(shape.status);

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("fetch failed")
  )
    return "You appear to be offline. Check your connection and try again.";
  if (
    status === 401 ||
    code === "PGRST301" ||
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt")
  )
    return "Your session has expired. Please sign in again.";
  if (code === "23505" || lower.includes("duplicate key"))
    return "That record already exists — check for a duplicate.";
  if (code === "23503" || lower.includes("foreign key"))
    return "This record is linked to other data and cannot be changed.";
  if (code === "23514" || lower.includes("violates check constraint"))
    return "Some values are outside the allowed range.";
  if (code === "22P02") return "Some values were in an unexpected format.";
  if (code === "22001") return "One of the values is too long.";
  if (code === "42501" || lower.includes("permission denied"))
    return "You do not have permission to do that.";
  if (lower.includes("invalid login credentials"))
    return "Incorrect email or password.";
  if (lower.includes("email not confirmed"))
    return "Confirm your email address first — check your inbox for the link.";
  if (lower.includes("for security purposes"))
    return "Please wait a moment before requesting another email.";
  return text;
}
