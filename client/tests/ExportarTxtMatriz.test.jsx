import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExportarTxtMatriz from '../src/components/ExportarTxtMatriz.jsx';
import { api } from '../src/api.js';

vi.mock('../src/api.js', () => ({ api: { get: vi.fn() } }));

const COMBINACIONES = [
  { tipo: 'IESS', clasificacion: 'ADMINISTRATIVO', empresa: 'BOPELUAL S.A.', quincena: '1', count: 5 },
  { tipo: 'IESS', clasificacion: 'ADMINISTRATIVO', empresa: 'BOPELUAL S.A.', quincena: '2', count: 4 },
  { tipo: 'EXTERNO', clasificacion: 'COMERCIAL', empresa: 'CARROS-YA S.A.', quincena: '1', count: 2 },
];

beforeEach(() => {
  api.get.mockReset();
});

describe('ExportarTxtMatriz', () => {
  it('deshabilita los botones sin colaboradores y habilita los que sí tienen', async () => {
    api.get.mockResolvedValue({ combinaciones: COMBINACIONES });
    render(<ExportarTxtMatriz periodoId="mes-1" quincenas={['1', '2']} />);

    const conColaboradores = await screen.findByText(/BOPELUAL S\.A\. Q1 \(5\)/);
    expect(conColaboradores.closest('button')).not.toBeDisabled();

    const sinColaboradores = screen.getAllByText(/CARROS-YA S\.A\. Q2 \(0\)/);
    expect(sinColaboradores.length).toBeGreaterThan(0);
    for (const el of sinColaboradores) expect(el.closest('button')).toBeDisabled();
  });

  it('al hacer click pide el TXT con los filtros de esa celda', async () => {
    api.get.mockResolvedValueOnce({ combinaciones: COMBINACIONES });
    render(<ExportarTxtMatriz periodoId="mes-1" quincenas={['1', '2']} />);
    await screen.findByText(/BOPELUAL S\.A\. Q1 \(5\)/);

    api.get.mockResolvedValueOnce({
      archivo: 'pago.txt', incluidos: 5, total: 100, contenido: 'x', excluidos: [], warnings: [],
    });
    fireEvent.click(screen.getByText(/BOPELUAL S\.A\. Q1 \(5\)/));

    await waitFor(() => {
      const llamada = api.get.mock.calls.find(([url]) => url.includes('/txt-pago'));
      expect(llamada[0]).toBe('/periodos/mes-1/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO&empresa=BOPELUAL+S.A.&quincena=1');
    });
  });

  it('muestra los warnings devueltos por el servidor', async () => {
    api.get.mockResolvedValueOnce({ combinaciones: COMBINACIONES });
    render(<ExportarTxtMatriz periodoId="mes-1" quincenas={['1', '2']} />);
    await screen.findByText(/BOPELUAL S\.A\. Q1 \(5\)/);

    api.get.mockResolvedValueOnce({
      archivo: '', incluidos: 0, total: 0, contenido: '', excluidos: [],
      warnings: ['La combinación tipo=IESS, clasificacion=ADMINISTRATIVO no tiene colaboradores en este período.'],
    });
    fireEvent.click(screen.getByText(/BOPELUAL S\.A\. Q1 \(5\)/));

    await screen.findByText(/no tiene colaboradores en este período/);
  });

  it('en modo quincena única (sin prop quincenas) no agrega el parámetro quincena', async () => {
    api.get.mockResolvedValueOnce({
      combinaciones: [{ tipo: 'IESS', clasificacion: 'ADMINISTRATIVO', empresa: 'BOPELUAL S.A.', quincena: '1', count: 3 }],
    });
    render(<ExportarTxtMatriz periodoId="q-1" />);
    await screen.findByText(/BOPELUAL S\.A\. \(3\)/);

    api.get.mockResolvedValueOnce({ archivo: 'p.txt', incluidos: 3, total: 10, contenido: 'x', excluidos: [], warnings: [] });
    fireEvent.click(screen.getByText(/BOPELUAL S\.A\. \(3\)/));

    await waitFor(() => {
      const llamada = api.get.mock.calls.find(([url]) => url.includes('/txt-pago'));
      expect(llamada[0]).not.toContain('quincena');
    });
  });
});
