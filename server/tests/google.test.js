import { describe, it, expect, vi } from 'vitest';

// Mock del cliente de Google: el payload.email es el propio idToken (para controlarlo).
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }) {
      return { getPayload: () => ({ email: idToken, name: 'Prueba' }) };
    }
  }
}));

// ALLOWED_EMAIL_DOMAIN=bopelual.com viene de server/.env
const { verifyGoogleToken } = await import('../src/auth/google.js');

describe('verifyGoogleToken — dominio', () => {
  it('acepta un correo del dominio permitido', async () => {
    await expect(verifyGoogleToken('ana@bopelual.com')).resolves.toMatchObject({
      email: 'ana@bopelual.com'
    });
  });

  it('rechaza un correo de otro dominio', async () => {
    await expect(verifyGoogleToken('intruso@gmail.com')).rejects.toThrow('dominio no autorizado');
  });
});
