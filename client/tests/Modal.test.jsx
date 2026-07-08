import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Modal, ConfirmProvider, useConfirm } from '../src/components/Modal.jsx';

describe('Modal', () => {
  it('no renderiza nada cuando open=false', () => {
    render(<Modal open={false} onClose={() => {}} title="X">contenido</Modal>);
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });

  it('renderiza el título y contenido cuando open=true', () => {
    render(<Modal open={true} onClose={() => {}} title="Editar banco">contenido</Modal>);
    expect(screen.getByText('Editar banco')).toBeInTheDocument();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('llama onClose al hacer click en el botón de cierre', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose} title="X">contenido</Modal>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('llama onClose al presionar Escape', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose} title="X">contenido</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

function Disparador() {
  const confirm = useConfirm();
  const [resultado, setResultado] = useState('');
  return (
    <div>
      <button onClick={async () => setResultado(String(await confirm({ title: 'Eliminar', message: '¿Seguro?' })))}>
        Preguntar
      </button>
      <p>resultado: {resultado}</p>
    </div>
  );
}

describe('useConfirm', () => {
  it('confirm() resuelve true al aceptar', async () => {
    render(<ConfirmProvider><Disparador /></ConfirmProvider>);
    fireEvent.click(screen.getByText('Preguntar'));
    fireEvent.click(screen.getByText('Confirmar'));
    await screen.findByText('resultado: true');
  });

  it('confirm() resuelve false al cancelar', async () => {
    render(<ConfirmProvider><Disparador /></ConfirmProvider>);
    fireEvent.click(screen.getByText('Preguntar'));
    fireEvent.click(screen.getByText('Cancelar'));
    await screen.findByText('resultado: false');
  });
});
