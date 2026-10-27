// Accounts render as "•••• {last4}" only (01 section 0, AC-GLB-6). Test-range account numbers never reach the DOM as text.
const ACCOUNT = /\b0{3}9{3}0{3}(\d{3})\b/g;

export function maskAccounts(text: string): string {
  return text.replace(ACCOUNT, (m) => `•••• ${m.slice(-4)}`);
}
