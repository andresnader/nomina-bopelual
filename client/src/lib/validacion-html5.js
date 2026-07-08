// client/src/lib/validacion-html5.js
// Traduce los mensajes de validación nativa del navegador (en inglés) a
// español, sin tocar cada formulario individualmente. Se instala una sola
// vez, al montar App.jsx.
const MENSAJES = {
  valueMissing: 'Por favor completa este campo.',
  typeMismatch: (input) => (input.type === 'email' ? 'Ingresa un correo electrónico válido.' : 'El valor no tiene el formato esperado.'),
  patternMismatch: 'El valor no cumple el formato requerido.',
  tooShort: (input) => `Debe tener al menos ${input.minLength} caracteres.`,
  tooLong: (input) => `Debe tener como máximo ${input.maxLength} caracteres.`,
  rangeUnderflow: (input) => `El valor debe ser mayor o igual a ${input.min}.`,
  rangeOverflow: (input) => `El valor debe ser menor o igual a ${input.max}.`,
  stepMismatch: 'El valor no es válido para este campo.',
  badInput: 'Ingresa un valor válido.',
};

function mensajePara(input) {
  const v = input.validity;
  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (v[clave]) return typeof texto === 'function' ? texto(input) : texto;
  }
  return 'El valor ingresado no es válido.';
}

export function instalarMensajesValidacionEspanol() {
  const onInvalid = (e) => {
    const input = e.target;
    if (!('validity' in input)) return;
    input.setCustomValidity(mensajePara(input));
  };
  const onInput = (e) => {
    if ('setCustomValidity' in e.target) e.target.setCustomValidity('');
  };
  document.addEventListener('invalid', onInvalid, true);
  document.addEventListener('input', onInput, true);
  return () => {
    document.removeEventListener('invalid', onInvalid, true);
    document.removeEventListener('input', onInput, true);
  };
}
