import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatearFechaLarga(fecha) {
  // contrato.fecha_inicio llega como Date (columna date de Postgres vía pg)
  // o como string 'YYYY-MM-DD' (tests). Se usan getters UTC en ambos casos
  // porque pg parsea las columnas date a medianoche UTC.
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
    children: [new TextRun({ text: `${titulo}: `, bold: true }), new TextRun(texto)],
  });
}

const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const SIN_BORDES = { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE };

function celdaFirma(texto) {
  return new TableCell({
    borders: SIN_BORDES,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, text: texto })],
  });
}

function filaFirma(izquierda, derecha) {
  return new TableRow({ children: [celdaFirma(izquierda), celdaFirma(derecha)] });
}

export async function generarContratoProductivoDocx({ empresa, colaborador, contrato, emision }) {
  const tratamiento = colaborador.sexo === 'F' ? 'la señora' : 'el señor';
  const pronombre = colaborador.sexo === 'F' ? 'la' : 'lo';
  const fecha = formatearFechaLarga(contrato.fecha_inicio);

  const funciones = emision.funciones
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => new Paragraph({ text: f, bullet: { level: 0 } }));

  const doc = new Document({
    sections: [{
      children: [
        parrafoTitulo('CONTRATO DE TRABAJO PRODUCTIVO'),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun(
            `En la ciudad de Guayaquil, el ${fecha}, comparecen: por una parte, la compañía ` +
            `${empresa.empresa}, con R.U.C. # ${empresa.ruc}, representada por ${empresa.representante_legal}, ` +
            `a quien para efectos de este contrato se llamará EL EMPLEADOR; y por otra parte, ${tratamiento} ` +
            `${colaborador.nombre} con C.C. ${colaborador.cedula}, a quien se ${pronombre} denominara EL ` +
            `TRABAJADOR. Las partes comparecientes acuerdan lo siguiente:`
          )],
        }),
        parrafoClausula('PRIMERA: ANTECEDENTES',
          'EL EMPLEADOR, para el desarrollo de sus actividades productivas de venta programada y ' +
          'comercialización de vehículos, requiere contratar personal bajo la modalidad de CONTRATO ' +
          'PRODUCTIVO, de conformidad con el Acuerdo Ministerial Nro. MDT-2020-222 y las reformas legales vigentes.'
        ),
        parrafoClausula('SEGUNDA: OBJETO Y CARGO',
          `EL TRABAJADOR se obliga a prestar sus servicios lícitos y personales en calidad de ` +
          `${colaborador.cargo}, realizando las siguientes funciones:`
        ),
        ...funciones,
        parrafoClausula('TERCERA: JORNADA LABORAL',
          `Dada la naturaleza productiva de la actividad, las partes acuerdan una jornada de ` +
          `${emision.horas_semanales} horas semanales, las cuales podrán ser distribuidas de lunes a domingo, ` +
          `en jornadas diarias de hasta ${emision.horas_diarias} horas, sin exceder el máximo legal. EL ` +
          `TRABAJADOR tendrá derecho a ${emision.dias_descanso} días de descanso consecutivos.`
        ),
        parrafoClausula('CUARTA: REMUNERACIÓN',
          `EL EMPLEADOR pagará al TRABAJADOR la cantidad de ${emision.remuneracion_letras} mensuales. ` +
          `Además, se pagarán las horas suplementarias o extraordinarias conforme a la ley, en caso de existir.`
        ),
        parrafoClausula('QUINTA: DURACIÓN Y PERIODO DE PRUEBA',
          `El presente contrato tendrá una duración de ${emision.duracion_texto}. Se establece un periodo ` +
          `de prueba de ${emision.periodo_prueba_texto}, dentro del cual cualquiera de las partes podrá ` +
          `terminar la relación laboral sin previo aviso ni indemnización.`
        ),
        parrafoClausula('SEXTA: AFILIACIÓN Y BENEFICIOS',
          'EL EMPLEADOR se obliga a afiliar al TRABAJADOR al Instituto Ecuatoriano de Seguridad Social (IESS) ' +
          'desde el primer día de labores y a pagar los beneficios sociales que tenga derecho el TRABAJADOR, ' +
          'así como los fondos de reserva según corresponda.'
        ),
        parrafoClausula('SÉPTIMA: PROTECCIÓN DE DATOS (LOPDP)',
          'EL TRABAJADOR autoriza al EMPLEADOR el tratamiento de sus datos personales para fines ' +
          'exclusivamente laborales. Asimismo, EL TRABAJADOR se compromete a guardar absoluta confidencialidad ' +
          'sobre la información sensible de los CLIENTES y del EMPLEADOR.'
        ),
        parrafoClausula('OCTAVA: JURISDICCIÓN',
          'Para cualquier controversia, las partes se someten a los Jueces de Trabajo de la ciudad de ' +
          'Guayaquil y al procedimiento sumario establecido en el COGEP.'
        ),
        new Paragraph({
          spacing: { before: 200, after: 600 },
          text: 'Para constancia, las partes firman en unidad de acto y por triplicado.',
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, text: `P. ${empresa.empresa}` }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            filaFirma(empresa.representante_legal, colaborador.nombre),
            filaFirma('EL EMPLEADOR', 'EL TRABAJADOR'),
            filaFirma(`C.C.# ${empresa.cedula_representante}`, `C.C.# ${colaborador.cedula}`),
          ],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
