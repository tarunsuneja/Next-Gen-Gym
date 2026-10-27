/** Calendar-day countdown independent of the browser timezone. */
export function membershipCountdown(end: string, day: string, start?: string) {
  const until = (target: string) =>
    Math.round(
      (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) /
        86400000,
    );
  if (start && start > day) {
    const days = until(start);
    return `Starts in ${days} ${days === 1 ? "day" : "days"}`;
  }
  const days = until(end);
  if (days === 0) return "Expires today";
  if (days < 0) return `Expired ${-days} ${days === -1 ? "day" : "days"} ago`;
  return `${days} ${days === 1 ? "day" : "days"} left`;
}
