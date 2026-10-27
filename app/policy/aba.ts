// ABA routing checksum (DQ3 cross-check, R7). 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) = 0 mod 10, length 9.
export function isValidAba(routing: string | null | undefined): boolean {
  if (!routing || !/^[0-9]{9}$/.test(routing)) return false;
  const d = routing.split("").map(Number);
  const sum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return sum % 10 === 0;
}
