import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PeriodoDetalle from '../src/pages/PeriodoDetalle.jsx';
import { ToastProvider } from '../src/components/Toast.jsx';
import { api } from '../src/api.js';
import { money } from '../src/utils.js';

vi.mock('../src/api.js', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
// Sin usuario, los RoleGate no renderizan: deja fuera de la prueba las
// secciones de aprobación y de generar nómina, que traen sus propios fetch.
vi.mock('../src/auth/AuthContext.jsx', () => ({ useAuth: () => ({ usuario: null }) }));

const rol = (id, nombre, empresa, neto) => ({
  id, colaborador_nombre: nombre, colaborador_empresa: empresa, colaborador_tipo: 'IESS',
  total_ingresos: neto, total_descuentos: '0.00', neto, tipo_pago: 'TRANSFERENCIA',
});

const PERIODO = {
  id: 'p1', nombre: 'Julio de 2026 Q1', estado: 'BORRADOR', quincena: '1', grupos: [],
  roles_pago: [
    rol('r1', 'ALVARADO TAIRO', 'BOPELUAL S.A.', '862.50'),
    rol('r2', 'QUEVEDO KARLA', 'BOPELUAL S.A.', '13.86'),
    rol('r3', 'VACA KRIZLEN', 'CARROS-YA S.A.', '412.30'),
  ],
};

const montar = () => render(
  <ToastProvider>
    <MemoryRouter initialEntries={['/periodos/p1']}>
      <Routes><Route path="/periodos/:id" element={<PeriodoDetalle />} /></Routes>
    </MemoryRouter>
  </ToastProvider>
);

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue(PERIODO);
});

describe('PeriodoDetalle — totales por empresa', () => {
  // El filtro de empresa es el primer <select> de la página; los demás son el
  // tipo de pago de cada fila.
  const filtroEmpresa = () => screen.getAllByRole('combobox')[0];
  const pie = () => within(screen.getByRole('table')).getAllByRole('rowgroup').at(-1);

  it('suma el neto de cada empresa y el total general al pie', async () => {
    montar();
    await screen.findByRole('table');

    // BOPELUAL 862.50 + 13.86 = 876.36 · CARROS-YA 412.30 · total 1288.66
    expect(within(pie()).getByText(money(876.36))).toBeInTheDocument();
    expect(within(pie()).getByText(money(412.30))).toBeInTheDocument();
    expect(within(pie()).getByText(money(1288.66))).toBeInTheDocument();
    expect(within(pie()).getByText('Total')).toBeInTheDocument();
    expect(within(pie()).getByText('2 colaboradores')).toBeInTheDocument();
  });

  it('oculta la fila Total al filtrar a una sola empresa, porque repetiría su subtotal', async () => {
    montar();
    await screen.findByRole('table');

    fireEvent.change(filtroEmpresa(), { target: { value: 'CARROS-YA S.A.' } });

    await waitFor(() => {
      expect(within(pie()).queryByText('Total')).not.toBeInTheDocument();
    });
    expect(within(pie()).getByText(money(412.30))).toBeInTheDocument();
    expect(within(pie()).queryByText(money(876.36))).not.toBeInTheDocument();
  });
});
