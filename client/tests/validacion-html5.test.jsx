import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { instalarMensajesValidacionEspanol } from '../src/lib/validacion-html5.js';

describe('validación HTML5 en español', () => {
  it('traduce el mensaje de un campo requerido vacío', () => {
    instalarMensajesValidacionEspanol();
    render(
      <form>
        <input required data-testid="campo" />
      </form>
    );
    const input = screen.getByTestId('campo');
    const valido = input.checkValidity();
    expect(valido).toBe(false);
    expect(input.validationMessage).toBe('Por favor completa este campo.');
  });
});
