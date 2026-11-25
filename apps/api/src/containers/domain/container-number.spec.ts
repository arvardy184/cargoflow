import {
  computeCheckDigit,
  isValidContainerNumber,
  normalizeContainerNumber,
} from './container-number';

describe('ISO 6346 container numbers', () => {
  it('matches the published reference example CSQU3054383', () => {
    expect(computeCheckDigit('CSQU305438')).toBe(3);
    expect(isValidContainerNumber('CSQU3054383')).toBe(true);
  });

  it('accepts the example used in the validation message (MSCU1234566)', () => {
    // M24·1 + S30·2 + C13·4 + U32·8 + 1·16 + 2·32 + 3·64 + 4·128 + 5·256 + 6·512 = 5528; 5528 mod 11 = 6
    expect(computeCheckDigit('MSCU123456')).toBe(6);
    expect(isValidContainerNumber('MSCU1234566')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidContainerNumber('CSQU3054384')).toBe(false);
    expect(isValidContainerNumber('MSCU1234565')).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['too short', 'CSQU305438'],
    ['too long', 'CSQU30543833'],
    ['invalid category letter', 'CSQX3054383'],
    ['digit in owner code', 'C1QU3054383'],
    ['letter in serial', 'CSQUA054383'],
  ])('rejects %s', (_label, value) => {
    expect(isValidContainerNumber(value)).toBe(false);
  });

  it('accepts J and Z equipment categories', () => {
    expect(isValidContainerNumber(`ABCJ123456${computeCheckDigit('ABCJ123456')}`)).toBe(true);
    expect(isValidContainerNumber(`ABCZ123456${computeCheckDigit('ABCZ123456')}`)).toBe(true);
  });

  it('normalizes spacing, dashes and case', () => {
    expect(normalizeContainerNumber(' csqu 305438-3 ')).toBe('CSQU3054383');
    expect(isValidContainerNumber('csqu 305438-3')).toBe(true);
  });

  it('always yields a single digit (remainder 10 maps to 0)', () => {
    const digits = new Set<number>();
    for (let serial = 0; serial < 500; serial++) {
      digits.add(computeCheckDigit(`ABCU${String(serial).padStart(6, '0')}`));
    }
    expect([...digits].every((d) => Number.isInteger(d) && d >= 0 && d <= 9)).toBe(true);
    expect(digits.has(0)).toBe(true);
  });
});
