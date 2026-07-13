import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatearFechaLarga(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function parrafoTitulo(texto) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: texto, bold: true, size: 28 })],
  });
}

function parrafoClausula(titulo, texto) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: `${titulo}\n`, bold: true }), new TextRun(texto)],
  });
}

function parrafoNormal(texto) {
  return new Paragraph({ spacing: { after: 200 }, text: texto });
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const d = fechaStr instanceof Date ? fechaStr : new Date(fechaStr.slice(0, 10) + 'T00:00:00Z');
  return d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
}

export async function generarConsentimientoBiometricoDocx({ empresa, colaborador, emision }) {
  const fecha = formatearFecha(emision.fecha_celebracion);

  const doc = new Document({
    sections: [{
      children: [
        parrafoTitulo('CONSENTIMIENTO PARA EL TRATAMIENTO DE DATOS PERSONALES POR USO DE RELOJ BIOMÉTRICO'),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun(
            `${colaborador.nombre}, portador/a de la cédula de ciudadanía No. ${colaborador.cedula}, en ` +
            `calidad de titular de datos personales, mediante la presente otorgo mi consentimiento libre, ` +
            `expreso, informado, voluntario e inequívoco a favor de ${empresa.empresa}, con RUC No. ` +
            `${empresa.ruc}, para que recolecte, almacene, procese y utilice mis datos biométricos, en ` +
            `especial los relacionados con mi huella dactilar, con el único fin de control de acceso y ` +
            `asistencia a las instalaciones de ${empresa.empresa}.`
          )],
        }),
        parrafoClausula('FINALIDAD DEL TRATAMIENTO',
          'Control de acceso a las instalaciones.\nRegistro de asistencia laboral.\nSeguridad y verificación de identidad.'
        ),
        parrafoClausula('DECLARACIÓN',
          'Declaro haber sido informado/a sobre:\n- La finalidad específica para la cual serán tratados mis ' +
          'datos biométricos.\n- El carácter voluntario del suministro de dicha información.\n- El derecho ' +
          'que me asiste de acceder, rectificar, actualizar, o suprimir mis datos personales en cualquier ' +
          'momento, conforme a la normativa vigente.\n- Que mis datos no serán utilizados para finalidades ' +
          'distintas a las aquí expresadas, sin mi consentimiento previo y por escrito.'
        ),
        new Paragraph({ spacing: { before: 200, after: 200 }, text: 'Este consentimiento tendrá plena validez mientras subsista la relación contractual o institucional con la compañía, o hasta que sea revocado de forma expresa por el titular del derecho.' }),
        new Paragraph({ spacing: { before: 200, after: 200 }, text: 'En señal de conformidad, firmo la presente en Guayaquil.' }),
        new Paragraph({ spacing: { after: 100 }, text: 'Firma: ____________________________' }),
        new Paragraph({ spacing: { after: 100 }, text: `Nombre: ${colaborador.nombre}` }),
        new Paragraph({ spacing: { after: 100 }, text: `C.I. No: ${colaborador.cedula}` }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
