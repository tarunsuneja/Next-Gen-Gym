export function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!/^[+\d\s()-]+$/.test(trimmed)) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}
export function internationalPhone(phone: string) {
  let digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.length === 10 ? "91" + digits : digits;
}
