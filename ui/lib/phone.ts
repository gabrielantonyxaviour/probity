// A phone number is a reserved (NPA) 555-01## number unless it came from a real registry.
// NANP shape only: the area code and exchange start with 2-9, so a 10-digit SEC CIK such as 0001443646 is not a phone.
const PHONE = /(?<!\d)(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}(?!\d)/g;
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
