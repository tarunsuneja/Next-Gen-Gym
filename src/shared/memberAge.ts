/** Completed years as of a calendar date; DOB remains the stored source of truth. */
export function memberAge(dob: string, day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob > day) return null;
  const parsed = new Date(`${dob}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dob
  )
    return null;
  const years = Number(day.slice(0, 4)) - Number(dob.slice(0, 4));
  return years - (day.slice(5) < dob.slice(5) ? 1 : 0);
}
