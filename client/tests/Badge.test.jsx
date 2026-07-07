import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Badge from '../src/components/Badge.jsx';

describe('Badge', () => {
  it('muestra el estado y color CERRADO (verde)', () => {
    render(<Badge estado="CERRADO" />);
    const el = screen.getByText('CERRADO');
    expect(el.className).toMatch(/green/);
  });
  it('BORRADOR usa amarillo', () => {
    render(<Badge estado="BORRADOR" />);
    expect(screen.getByText('BORRADOR').className).toMatch(/yellow|amber/);
  });
});
