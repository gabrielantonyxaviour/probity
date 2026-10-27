// A phone number is a fictional (NPA) 555-01## unless it came from a real registry; real ones carry "Demo scenario: do not call."
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const FICTIONAL = /555[\s.-]?01\d\d/;

export function hasRealPhone(text: string | null | undefined): boolean {
  if (!text) return false;
  const found = text.match(PHONE);
  if (!found) return false;
  return found.some((p) => !FICTIONAL.test(p));
}
export function isFictionalPhone(display: string): boolean {
  return FICTIONAL.test(display);
}
