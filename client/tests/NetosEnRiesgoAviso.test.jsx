import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NetosEnRiesgoAviso from '../src/components/NetosEnRiesgoAviso.jsx';

// CARRERA BARRIOS estuvo con neto -53.16 durante toda una quincena y nadie se
// enteró: la tabla del período muestra el número, pero perdido entre 30 filas.
// Un neto negativo no se puede pagar, así que tiene que saltar a la vista.
describe('NetosEnRiesgoAviso', () => {
  const rol = (nombre, neto) => ({ id: nombre, colaborador_nombre: nombre, neto });

  it('no muestra nada cuando todos los netos son positivos', () => {
    const { container } = render(<NetosEnRiesgoAviso roles={[rol('ANA', '200.00'), rol('LUIS', '1.00')]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('señala al colaborador con neto negativo', () => {
    render(<NetosEnRiesgoAviso roles={[rol('ANA', '200.00'), rol('CARRERA BARRIOS', '-53.16')]} />);
    expect(screen.getByText('CARRERA BARRIOS')).toBeInTheDocument();
    expect(screen.getByText(/no se puede pagar/i)).toBeInTheDocument();
  });

  it('señala también el neto en cero, pero como revisión y no como bloqueo', () => {
    render(<NetosEnRiesgoAviso roles={[rol('VELEZ PEREZ', '0.00')]} />);
    expect(screen.getByText('VELEZ PEREZ')).toBeInTheDocument();
    expect(screen.getByText(/sin nada que pagar/i)).toBeInTheDocument();
  });

  it('distingue los dos casos cuando aparecen juntos', () => {
    render(<NetosEnRiesgoAviso roles={[rol('NEGATIVO', '-10.00'), rol('CERO', '0.00'), rol('OK', '50.00')]} />);
    expect(screen.getByText(/no se puede pagar/i)).toBeInTheDocument();
    expect(screen.getByText(/sin nada que pagar/i)).toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
  });

  it('tolera una lista vacía o ausente', () => {
    const { container: a } = render(<NetosEnRiesgoAviso roles={[]} />);
    expect(a).toBeEmptyDOMElement();
    const { container: b } = render(<NetosEnRiesgoAviso />);
    expect(b).toBeEmptyDOMElement();
  });
});
