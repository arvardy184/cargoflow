/**
 * ISO 6346 container numbers: 3-letter owner code, equipment category (U/J/Z),
 * 6-digit serial and a check digit, e.g. "MSCU1234566".
 */
const FORMAT = /^[A-Z]{3}[UJZ]\d{7}$/;

function letterValue(char: string): number {
  // A=10 … Z=38, skipping multiples of 11 (11, 22, 33).
  let value = 10;
  for (let code = 'A'.charCodeAt(0); code < char.charCodeAt(0); code++) {
    value++;
    if (value % 11 === 0) value++;
  }
  return value;
}

export function computeCheckDigit(firstTen: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = firstTen[i];
    const value = /\d/.test(char) ? Number(char) : letterValue(char);
    sum += value * 2 ** i;
  }
  return (sum % 11) % 10;
}

export function normalizeContainerNumber(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidContainerNumber(value: string): boolean {
  const normalized = normalizeContainerNumber(value);
  if (!FORMAT.test(normalized)) return false;
  return computeCheckDigit(normalized.slice(0, 10)) === Number(normalized[10]);
}
