import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NuevoMesModal from '../src/components/NuevoMesModal.jsx';
import { api } from '../src/api.js';

vi.mock('../src/api.js', () => ({ api: { post: vi.fn() } }));

beforeEach(() => {
  api.post.mockReset();
});

describe('NuevoMesModal', () => {
  it('no renderiza nada cuando open=false', () => {
    render(<NuevoMesModal open={false} onClose={() => {}} onCreado={() => {}} />);
    expect(screen.queryByText('Nuevo mes completo')).not.toBeInTheDocument();
  });

  it('crea el mes con año y mes seleccionados y llama onCreado + onClose', async () => {
    api.post.mockResolvedValue({ periodo_mes: { id: 'm1' }, quincenas: [], creados: 2 });
    const onCreado = vi.fn();
    const onClose = vi.fn();
    render(<NuevoMesModal open={true} onClose={onClose} onCreado={onCreado} />);

    fireEvent.change(screen.getByDisplayValue(String(new Date().getFullYear())), { target: { value: '2025' } });
    fireEvent.click(screen.getByText('Crear mes'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/periodos/desde-mes', { anio: 2025, mes: new Date().getMonth() + 1, empresa: '' }));
    await waitFor(() => expect(onCreado).toHaveBeenCalledWith({ periodo_mes: { id: 'm1' }, quincenas: [], creados: 2 }));
    expect(onClose).toHaveBeenCalled();
  });

  // Un colaborador sin contrato vigente no entra al período y hasta ahora
  // desaparecía sin aviso. El mes se crea igual (no bloquea), pero la lista
  // queda a la vista para poder corregir las fichas.
  it('muestra a los omitidos y no cierra el modal cuando quedó gente afuera', async () => {
    api.post.mockResolvedValue({
      periodo_mes: { id: 'm1' }, quincenas: [], creados: 2,
      omitidos: [{ id: 'c1', nombre: 'MELANIE ALVARADO', motivo: 'SIN_CONTRATO' }],
    });
    const onClose = vi.fn();
    const onCreado = vi.fn();
    render(<NuevoMesModal open={true} onClose={onClose} onCreado={onCreado} />);

    fireEvent.click(screen.getByText('Crear mes'));

    await screen.findByText('MELANIE ALVARADO');
    expect(screen.getByText(/Sin sueldo cargado/)).toBeInTheDocument();
    // El mes sí se creó: el listado de atrás se refresca igual.
    expect(onCreado).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cierra el aviso de omitidos al confirmar', async () => {
    api.post.mockResolvedValue({
      periodo_mes: { id: 'm1' }, quincenas: [], creados: 2,
      omitidos: [{ id: 'c1', nombre: 'TAIRO ALVARADO', motivo: 'SIN_VINCULO' }],
    });
    const onClose = vi.fn();
    render(<NuevoMesModal open={true} onClose={onClose} onCreado={() => {}} />);

    fireEvent.click(screen.getByText('Crear mes'));
    fireEvent.click(await screen.findByText('Entendido'));

    expect(onClose).toHaveBeenCalled();
  });

  it('muestra el error del servidor (ej. 409) sin cerrar el modal', async () => {
    api.post.mockRejectedValue(new Error('el mes 3/2022 ya tiene período padre'));
    const onClose = vi.fn();
    render(<NuevoMesModal open={true} onClose={onClose} onCreado={() => {}} />);

    fireEvent.click(screen.getByText('Crear mes'));

    await screen.findByText('el mes 3/2022 ya tiene período padre');
    expect(onClose).not.toHaveBeenCalled();
  });
});
