import { describe, it, expect } from 'vitest';
import { TIPOS, CLASIFICACIONES } from '../src/lib/grupos.js';

describe('constantes de tipo y clasificación', () => {
  it('TIPOS incluye IESS y EXTERNO', () => {
    expect(TIPOS).toEqual(['IESS', 'EXTERNO']);
  });
  it('CLASIFICACIONES incluye ADMINISTRATIVO y COMERCIAL', () => {
    expect(CLASIFICACIONES).toEqual(['ADMINISTRATIVO', 'COMERCIAL']);
  });
});
