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

function parrafoNormal(texto) {
  return new Paragraph({ spacing: { after: 100 }, text: texto });
}

function parrafoClausula(titulo, clausula) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: `${titulo}. - `, bold: true }), new TextRun(clausula)],
  });
}

function clausulaConLetras(titulo, letras, numero) {
  const texto = `${letras} (USD ${numero})`;
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: `${titulo}. - `, bold: true }), new TextRun(texto)],
  });
}

export async function generarContratoServiciosProfesionalesDocx({ empresa, colaborador, contrato, emision }) {
  const tratamiento = colaborador.sexo === 'F' ? 'la señora' : 'el señor';
  const fecha_inicio = formatearFechaLarga(contrato.fecha_inicio);
  const fecha_fin = contrato.fecha_fin ? formatearFechaLarga(contrato.fecha_fin) : '';

  const doc = new Document({
    sections: [{
      children: [
        parrafoTitulo('CONTRATO DE PRESTACIÓN DE SERVICIOS PROFESIONALES'),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun(
            `En la ciudad de Guayaquil, a los ${fecha_inicio}, comparecen: por una parte ${empresa.empresa}, ` +
            `debidamente representada por su representante legal, ${empresa.representante_legal}, a quien en ` +
            `adelante se denominará LA CONTRATANTE, con RUC No. ${empresa.ruc}; y por otra parte, ${tratamiento} ` +
            `${colaborador.nombre}, portador de la cédula de ciudadanía No. ${colaborador.cedula}, quien en ` +
            `adelante se denominará EL PRESTADOR. Los comparecientes, mayores de edad, legalmente capaces para ` +
            `contratar y obligarse, celebran el presente Contrato de Prestación de Servicios Profesionales, al ` +
            `tenor de las siguientes cláusulas:`
          )],
        }),
        parrafoClausula('PRIMERA', 'ANTECEDENTES'),
        parrafoNormal(`LA CONTRATANTE requiere contar con servicios especializados para apoyar las actividades del área de ${colaborador.cargo}, por lo que ha resuelto contratar los servicios profesionales de EL PRESTADOR.`),
        parrafoClausula('SEGUNDA', 'OBJETO'),
        parrafoNormal('EL PRESTADOR se obliga a prestar sus servicios profesionales para ejecutar las actividades que le sean requeridas, de conformidad con las directrices emitidas por LA CONTRATANTE.'),
        parrafoNormal('EL PRESTADOR ejecutará sus actividades con autonomía técnica, administrativa y profesional, sin que exista relación de dependencia con LA CONTRATANTE.'),
        clausulaConLetras('TERCERA', 'PLAZO'),
        parrafoNormal(`El presente contrato tendrá una duración de ${emision.plazo_meses} meses, contados a partir del ${fecha_inicio} hasta el ${fecha_fin}.`),
        parrafoNormal('Concluido el plazo, el contrato terminará automáticamente, salvo que las partes acuerden por escrito su renovación.'),
        parrafoClausula('CUARTA', 'HONORARIOS'),
        ...(() => {
          const textos = [`LA CONTRATANTE pagará a EL PRESTADOR la suma mensual de ${emision.honorarios_letras} (USD ${emision.honorarios_numero}), valor que incluye IVA, previa presentación de la correspondiente factura electrónica.`];
          if (emision.honorarios_mes12_letras && emision.honorarios_mes12_numero) {
            textos.push(`El mes 12 el valor será de ${emision.honorarios_mes12_letras} (USD ${emision.honorarios_mes12_numero}).`);
          }
          textos.push('El pago se realizará mediante transferencia bancaria dentro de los plazos establecidos por LA CONTRATANTE.');
          return textos.map(t => parrafoNormal(t));
        })(),
        parrafoClausula('QUINTA', 'OBLIGACIONES DEL PRESTADOR'),
        parrafoNormal('EL PRESTADOR se compromete a: (a) Ejecutar los servicios con diligencia, responsabilidad y profesionalismo; (b) Cumplir con los plazos y actividades asignadas; (c) Guardar absoluta reserva y confidencialidad sobre toda la información; (d) Cumplir con las disposiciones internas de LA CONTRATANTE; (e) Emitir la factura correspondiente para el pago de sus honorarios.'),
        parrafoClausula('SEXTA', 'OBLIGACIONES DE LA CONTRATANTE'),
        parrafoNormal('LA CONTRATANTE se obliga a: (a) Facilitar la información necesaria para la correcta ejecución de los servicios; (b) Cancelar oportunamente los honorarios pactados.'),
        parrafoClausula('SÉPTIMA', 'CONFIDENCIALIDAD'),
        parrafoNormal('EL PRESTADOR se obliga a mantener estricta reserva sobre toda la información técnica, administrativa, financiera, comercial y de cualquier otra naturaleza a la que tenga acceso, obligación que subsistirá incluso después de la terminación del contrato.'),
        parrafoClausula('OCTAVA', 'INEXISTENCIA DE RELACIÓN LABORAL'),
        parrafoNormal('Las partes manifiestan que el presente instrumento no genera relación laboral, subordinación ni dependencia, y en consecuencia no da lugar al pago de beneficios sociales, indemnizaciones laborales ni demás obligaciones previstas en el Código del Trabajo.'),
        parrafoClausula('NOVENA', 'TERMINACIÓN ANTICIPADA'),
        parrafoNormal('El presente contrato podrá darse por terminado antes del vencimiento del plazo por: mutuo acuerdo; incumplimiento; caso fortuito o fuerza mayor; o decisión unilateral mediante notificación escrita con al menos quince (15) días de anticipación.'),
        parrafoClausula('DÉCIMA', 'LEGISLACIÓN APLICABLE Y JURISDICCIÓN'),
        parrafoNormal('Para todo lo no previsto, las partes se sujetan a las disposiciones del Código Civil, Código de Comercio y demás normas aplicables de la República del Ecuador, fijando como domicilio contractual la ciudad de Guayaquil.'),
        new Paragraph({ spacing: { before: 200, after: 100 }, text: 'En constancia de aceptación, las partes suscriben el presente contrato en dos ejemplares de igual tenor y valor legal.' }),
        new Paragraph({ spacing: { before: 100, after: 50 }, text: 'LA CONTRATANTE' }),
        new Paragraph({ spacing: { after: 50 }, text: empresa.empresa }),
        new Paragraph({ spacing: { after: 50 }, text: `___________________________` }),
        new Paragraph({ spacing: { after: 50 }, text: empresa.representante_legal }),
        new Paragraph({ spacing: { after: 50 }, text: `RUC No. ${empresa.ruc}` }),
        new Paragraph({ spacing: { before: 100, after: 50 }, text: 'EL PRESTADOR' }),
        new Paragraph({ spacing: { after: 50 }, text: `_____________________________` }),
        new Paragraph({ spacing: { after: 50 }, text: colaborador.nombre }),
        new Paragraph({ spacing: { after: 50 }, text: `C.C. No. ${colaborador.cedula}` }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
