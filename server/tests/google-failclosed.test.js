import { describe, it, expect, vi } from 'vitest';

// Simula config SIN ALLOWED_EMAIL_DOMAIN para verificar el comportamiento fail-closed.
vi.mock('../src/config.js', () => ({
  GOOGLE_CLIENT_ID: 'x',
  ALLOWED_EMAIL_DOMAIN: undefined
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }) {
      return { getPayload: () => ({ email: idToken, name: 'Prueba' }) };
    }
  }
}));

const { verifyGoogleToken } = await import('../src/auth/google.js');

describe('verifyGoogleToken — fail-closed', () => {
  it('rechaza cualquier token si no hay dominio configurado', async () => {
    await expect(verifyGoogleToken('ana@bopelual.com')).rejects.toThrow('ALLOWED_EMAIL_DOMAIN no configurado');
  });
});
