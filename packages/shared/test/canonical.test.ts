import { describe, it, expect } from 'vitest';
import { canonicalProductText } from '../src/canonical.js';

const MODEL = 'text-embedding-3-small';

describe('canonicalProductText golden tests', () => {
  it('1. NFC composed vs decomposed é produce identical hashes', () => {
    const composed = { title: 'é' };       // é as single codepoint U+00E9
    const decomposed = { title: 'é' }; // e + combining acute U+0065 U+0301
    const a = canonicalProductText(composed, MODEL);
    const b = canonicalProductText(decomposed, MODEL);
    expect(a.hash).toBe('73b0ab71c77c7de84a85a09f5581a75a2d42b48c91d36b67cac57138ea29c9cd');
    expect(b.hash).toBe('73b0ab71c77c7de84a85a09f5581a75a2d42b48c91d36b67cac57138ea29c9cd');
    expect(a.hash).toBe(b.hash);
  });

  it('2. Étagère lowercased to étagère in category field (diacritic preserved)', () => {
    const r = canonicalProductText({ category: 'Étagère' }, MODEL);
    const categoryLine = r.text.split('\n').find((l) => l.startsWith('category='));
    expect(categoryLine).toBe('category=étagère');
    expect(r.hash).toBe('eb98fb3e427e410360637118873400963ff434d2ed87e6018cac5e0b0a82bb66');
  });

  it('3. price=12.345 rounds to 12.35 (V8 toFixed(2))', () => {
    const r = canonicalProductText({ price: 12.345 }, MODEL);
    const priceLine = r.text.split('\n').find((l) => l.startsWith('price='));
    expect(priceLine).toBe('price=12.35');
    expect(r.hash).toBe('5b0ec6b9d5be75ad082075f28daf1eb8646bf164ca5d0ec06c7d20f3f313f676');
  });

  it('4. null/undefined fields produce empty strings, not "null"', () => {
    const r = canonicalProductText({}, MODEL);
    expect(r.text).not.toContain('null');
    expect(r.text).not.toContain('undefined');
    expect(r.hash).toBe('2546b17d6d20e455bb37be9fb7a0b8eec783ec7ba83e44b00d5cf3f2e5bb7121');
  });

  it('5. fully populated product — frozen hash', () => {
    const r = canonicalProductText(
      {
        title: 'Leather Office Chair',
        description: 'Mid-century executive chair with lumbar support',
        category: 'Chair',
        type: 'Office',
        price: 499.99,
        width: 65.0,
        height: 110.0,
        depth: 70.5,
      },
      MODEL
    );
    expect(r.hash).toBe('3a6cff6cb518a0819beb9ee85b364732cfe21ace4d55e4441cda1fbf7b605683');
  });
});
