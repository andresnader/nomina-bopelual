import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider, useToast } from '../src/components/Toast.jsx';

function Disparador() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Guardado correctamente')}>Exito</button>
      <button onClick={() => toast.error('Algo falló')}>Error</button>
    </div>
  );
}

describe('Toast', () => {
  it('muestra un toast de éxito al llamar toast.success', () => {
    render(<ToastProvider><Disparador /></ToastProvider>);
    fireEvent.click(screen.getByText('Exito'));
    expect(screen.getByRole('alert')).toHaveTextContent('Guardado correctamente');
  });

  it('se puede cerrar manualmente con el botón de cierre', () => {
    render(<ToastProvider><Disparador /></ToastProvider>);
    fireEvent.click(screen.getByText('Error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló');
    fireEvent.click(screen.getByRole('alert').querySelector('button'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('useToast fuera del provider lanza un error', () => {
    const Fuera = () => { useToast(); return null; };
    expect(() => render(<Fuera />)).toThrow(/useToast debe usarse dentro/);
  });
});
