import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send })),
  PutObjectCommand: vi.fn((args) => ({ __cmd: 'Put', ...args })),
  GetObjectCommand: vi.fn((args) => ({ __cmd: 'Get', ...args })),
}));

const { subirArchivo, descargarArchivo } = await import('../src/lib/storage.js');

describe('storage (bucket S3-compatible)', () => {
  beforeEach(() => { send.mockReset(); });

  it('subirArchivo manda un PutObjectCommand con key, body y content-type', async () => {
    send.mockResolvedValueOnce({});
    const key = await subirArchivo('contratos/x/generado.docx', Buffer.from('hola'), 'application/msword');
    expect(key).toBe('contratos/x/generado.docx');
    expect(send).toHaveBeenCalledTimes(1);
    const comando = send.mock.calls[0][0];
    expect(comando.__cmd).toBe('Put');
    expect(comando.Key).toBe('contratos/x/generado.docx');
    expect(comando.ContentType).toBe('application/msword');
    expect(comando.Body.toString()).toBe('hola');
  });

  it('descargarArchivo devuelve un Buffer con el contenido del objeto', async () => {
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([104, 111, 108, 97]) }
    });
    const buffer = await descargarArchivo('contratos/x/generado.docx');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('hola');
    const comando = send.mock.calls[0][0];
    expect(comando.__cmd).toBe('Get');
    expect(comando.Key).toBe('contratos/x/generado.docx');
  });
});
