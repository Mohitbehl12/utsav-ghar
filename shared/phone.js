/**
 * Accept Indian mobile numbers the way people actually type them:
 * "98765 43210", "98765-43210", "+91 98765 43210", "091-9876543210", "(987) 654 3210".
 * Returns the plain 10-digit number, or the trimmed input if it isn't one.
 */
export function normalizeIndianPhone(s) {
  const raw = String(s || '').trim();
  let d = raw.replace(/[\s().-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : raw;
}
export const isIndianMobile = (s) => /^[6-9]\d{9}$/.test(normalizeIndianPhone(s));
