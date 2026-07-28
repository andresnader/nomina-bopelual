import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AprobacionMatriz from '../src/components/AprobacionMatriz.jsx';
import { api } from '../src/api.js';
import { ToastProvider } from '../src/components/Toast.jsx';

vi.mock('../src/api.js', () => ({ api: { post: vi.fn() } }));

function renderConToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const GRUPOS_Q1 = [
  { empresa: 'BOPELUAL S.A.', tipo: 'IESS', clasificacion: 'ADMINISTRATIVO', colaboradores: 3, total_neto: 300, aprobado: false, etiqueta: 'IESS · ADMINISTRATIVO' },
];

beforeEach(() => {
  api.post.mockReset();
});

describe('AprobacionMatriz', () => {
  it('muestra "sin colaboradores" para una combinación ausente en grupos', () => {
    renderConToast(<AprobacionMatriz periodos={[{ id: 'p1', label: null, grupos: GRUPOS_Q1 }]} />);
    expect(screen.getAllByText(/sin colaboradores/).length).toBeGreaterThan(0);
  });

  it('muestra "Aprobar" para una combinación pendiente y llama al endpoint correcto', async () => {
    api.post.mockResolvedValue({ ok: true });
    const onCambio = vi.fn();
    renderConToast(<AprobacionMatriz periodos={[{ id: 'p1', label: null, grupos: GRUPOS_Q1 }]} onCambio={onCambio} />);

    const boton = screen.getByText(/BOPELUAL S\.A\. \(3\) — Aprobar/);
    fireEvent.click(boton);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/periodos/p1/combinaciones/aprobar',
      { empresa: 'BOPELUAL S.A.', tipo: 'IESS', clasificacion: 'ADMINISTRATIVO' }
    ));
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
  });

  it('muestra "Reabrir" cuando la combinación ya está aprobada', () => {
    const aprobado = [{ ...GRUPOS_Q1[0], aprobado: true }];
    renderConToast(<AprobacionMatriz periodos={[{ id: 'p1', label: null, grupos: aprobado }]} />);
    expect(screen.getByText(/BOPELUAL S\.A\. \(3\) — Reabrir/)).toBeInTheDocument();
  });

  it('con dos períodos (Q1/Q2) distingue cada celda por label y periodoId', async () => {
    api.post.mockResolvedValue({ ok: true });
    const gruposQ2 = [{ ...GRUPOS_Q1[0], aprobado: true }];
    renderConToast(<AprobacionMatriz periodos={[
      { id: 'q1', label: 'Q1', grupos: GRUPOS_Q1 },
      { id: 'q2', label: 'Q2', grupos: gruposQ2 },
    ]} />);

    expect(screen.getByText(/BOPELUAL S\.A\. Q1 \(3\) — Aprobar/)).toBeInTheDocument();
    expect(screen.getByText(/BOPELUAL S\.A\. Q2 \(3\) — Reabrir/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/BOPELUAL S\.A\. Q1 \(3\) — Aprobar/));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/periodos/q1/combinaciones/aprobar', expect.anything()));
  });
});
