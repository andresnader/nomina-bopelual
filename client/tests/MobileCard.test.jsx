import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MobileCard from '../src/components/MobileCard.jsx';

describe('MobileCard', () => {
  it('renderiza el contenido principal (top)', () => {
    render(<MobileCard top={<span>María Cedeño</span>} />);
    expect(screen.getByText('María Cedeño')).toBeInTheDocument();
  });

  it('renderiza la línea meta cuando se provee', () => {
    render(<MobileCard top={<span>x</span>} meta="VACACIONES · 12-18 jul · 5 días" />);
    expect(screen.getByText('VACACIONES · 12-18 jul · 5 días')).toBeInTheDocument();
  });

  it('no renderiza la línea meta si no se provee', () => {
    const { container } = render(<MobileCard top={<span>x</span>} />);
    expect(container.querySelector('.mobile-card-meta')).not.toBeInTheDocument();
  });

  it('renderiza el pie separado cuando se provee footer', () => {
    const { container } = render(<MobileCard top={<span>x</span>} footer={<span>Sin motivo</span>} />);
    expect(screen.getByText('Sin motivo')).toBeInTheDocument();
    expect(container.querySelector('.mobile-card-footer')).toBeInTheDocument();
  });

  it('no renderiza el pie si no se provee footer', () => {
    const { container } = render(<MobileCard top={<span>x</span>} />);
    expect(container.querySelector('.mobile-card-footer')).not.toBeInTheDocument();
  });
});
