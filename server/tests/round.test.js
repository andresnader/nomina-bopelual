import { describe, it, expect } from 'vitest';
import { round2 } from '../src/lib/round.js';

describe('round2', () => {
  it('redondea a 2 decimales', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(9.454)).toBe(9.45);
    expect(round2(9.456)).toBe(9.46);
  });
  it('no arrastra error de float', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
