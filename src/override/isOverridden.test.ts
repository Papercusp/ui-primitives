/**
 * isOverridden / effectiveValue — pure override-math unit tests
 * (sentinel-as-herald-2026-06-21). Mirrors the override-math block of
 * ModelTiersOverride.test.tsx: null/undefined ⇒ never overridden, scalars by
 * ===, objects/arrays deep-equal so a re-stated default is a no-op, custom `eq`.
 */
import { describe, expect, it } from 'vitest';

import { defaultEq, effectiveValue, isOverridden } from './isOverridden';

describe('isOverridden', () => {
  it('null/undefined override is never an override', () => {
    expect(isOverridden('haiku', null)).toBe(false);
    expect(isOverridden('haiku', undefined)).toBe(false);
    expect(isOverridden({ a: 1 }, null)).toBe(false);
    expect(isOverridden([1, 2], undefined)).toBe(false);
  });

  it('scalars compare with === (differs ⇒ overridden, equal ⇒ not)', () => {
    expect(isOverridden('haiku', 'opus')).toBe(true);
    expect(isOverridden('haiku', 'haiku')).toBe(false);
    expect(isOverridden(60, 120)).toBe(true);
    expect(isOverridden(60, 60)).toBe(false);
    expect(isOverridden(true, false)).toBe(true);
    expect(isOverridden(false, false)).toBe(false);
  });

  it('a scalar override of 0 / "" / false is still a real override (not "unset")', () => {
    // only null/undefined mean "not overriding" — falsy values are real overrides
    expect(isOverridden(1, 0)).toBe(true);
    expect(isOverridden('x', '')).toBe(true);
    expect(isOverridden(true, false)).toBe(true);
  });

  it('objects deep-equal: a re-stated default is NOT an override', () => {
    expect(isOverridden({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(false);
    expect(isOverridden({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false); // key order irrelevant
    expect(isOverridden({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(true);
    expect(isOverridden({ a: 1 }, { a: 1, b: 2 })).toBe(true); // extra key ⇒ differs
    expect(isOverridden({ a: { n: 1 } }, { a: { n: 1 } })).toBe(false); // nested
    expect(isOverridden({ a: { n: 1 } }, { a: { n: 2 } })).toBe(true);
  });

  it('arrays deep-equal, order-sensitive', () => {
    expect(isOverridden([1, 2, 3], [1, 2, 3])).toBe(false);
    expect(isOverridden([1, 2, 3], [3, 2, 1])).toBe(true);
    expect(isOverridden([1, 2], [1, 2, 3])).toBe(true); // length differs
    expect(
      isOverridden(
        [{ name: 'fast', spec: 'haiku' }],
        [{ name: 'fast', spec: 'haiku' }],
      ),
    ).toBe(false);
    expect(
      isOverridden(
        [{ name: 'fast', spec: 'haiku' }],
        [{ name: 'fast', spec: 'opus' }],
      ),
    ).toBe(true);
  });

  it('an array vs object of the same shape is not equal', () => {
    expect(isOverridden({ 0: 'a', length: 1 } as unknown, ['a'])).toBe(true);
  });

  it('honors a custom eq comparator', () => {
    // compare strings case-insensitively ⇒ "HAIKU" is not an override of "haiku"
    const ci = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    expect(isOverridden('haiku', 'HAIKU', ci)).toBe(false);
    expect(isOverridden('haiku', 'opus', ci)).toBe(true);
  });
});

describe('effectiveValue', () => {
  it('returns the override when set, else the base', () => {
    expect(effectiveValue('haiku', 'opus')).toBe('opus');
    expect(effectiveValue('haiku', null)).toBe('haiku');
    expect(effectiveValue('haiku', undefined)).toBe('haiku');
    // a falsy-but-set override still wins (0 is a real value, not "unset")
    expect(effectiveValue(60, 0)).toBe(0);
    expect(effectiveValue('x', '')).toBe('');
  });
});

describe('defaultEq', () => {
  it('treats NaN as equal to NaN', () => {
    expect(defaultEq(NaN, NaN)).toBe(true);
    expect(isOverridden(NaN, NaN)).toBe(false);
  });
  it('null vs object is not equal', () => {
    expect(defaultEq(null, {} as unknown)).toBe(false);
    expect(defaultEq({} as unknown, null)).toBe(false);
  });
});
