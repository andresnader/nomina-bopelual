import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatearFechaLarga(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha.slice(0, 10) + 'T00:00:00Z');
  return d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
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
    children: [new TextRun({ text: titulo + '\n', bold: true }), new TextRun(texto)],
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

export async function generarAcuerdoConfidencialidadDocx({ empresa, colaborador, emision }) {
  const tratamiento = colaborador.sexo === 'F' ? 'la senora' : 'el senor';
  const la_o_el = colaborador.sexo === 'F' ? 'la' : 'el';
  const fecha = formatearFechaLarga(emision.fecha_celebracion);

  const textoApertura =
    'Este Acuerdo de Confidencialidad, que para efectos de este documento se lo denominara ' +
    'simplemente como "el Acuerdo", se celebra el ' + fecha + ', entre: ' + empresa.empresa + ', ' +
    'sociedad legalmente constituida de conformidad con las leyes y normativa vigente en el ' +
    'territorio ecuatoriano, con domicilio en la ciudad de Guayaquil, avenida Juan Tanca Marengo, ' +
    'Km. 1, representada en legal y debida forma en este acto por ' + empresa.representante_legal + ', ' +
    'en su calidad de ' + (empresa.cargo_representante || 'Gerente General') + ', parte que en adelante ' +
    'sera denominada como "LA EMPRESA"; y por otra parte, ' + tratamiento + ' ' + colaborador.nombre + ', ' +
    'con C.C. ' + colaborador.cedula + ', a quien en adelante se ' + la_o_el + ' denominara como "EL EMPLEADO".';

  const doc = new Document({
    sections: [{
      children: [
        parrafoTitulo('ACUERDO DE CONFIDENCIALIDAD'),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun(textoApertura)],
        }),
        new Paragraph({ spacing: { before: 200, after: 200 }, text: 'Ambas partes, en adelante conjuntamente denominadas "LAS PARTES", acuerdan lo siguiente:' }),
        parrafoClausula('1. OBJETO DEL ACUERDO',
          'EL EMPLEADO, en el ejercicio de sus funciones de ' + emision.cargo + ', tendra acceso a informacion ' +
          'confidencial de LA EMPRESA. El presente Acuerdo tiene por objeto establecer los terminos y ' +
          'condiciones bajo los cuales EL EMPLEADO se obliga a mantener la confidencialidad de dicha informacion.'
        ),
        parrafoClausula('2. DEFINICION DE INFORMACION CONFIDENCIAL',
          'Para efectos de este Acuerdo, se considerara "Informacion Confidencial" toda aquella informacion, ' +
          'en cualquier formato, que LA EMPRESA proporcione a EL EMPLEADO, incluyendo:\n' +
          'Estrategias comerciales, marketing y operativas.\nDatos de clientes y proveedores.\n' +
          'Contratos, adendum y acuerdos comerciales.\nProcedimientos internos y tecnologicos.\n' +
          'Claves y usuarios de correos y de acceso a los sistemas informaticos.'
        ),
        parrafoClausula('3. OBLIGACIONES DE CONFIDENCIALIDAD',
          'EL EMPLEADO se compromete a:\nNo divulgar, revelar, transferir o hacer accesible la Informacion ' +
          'Confidencial a terceros sin autorizacion previa y por escrito de LA EMPRESA.\nUtilizar la ' +
          'Informacion Confidencial exclusivamente para los fines de la relacion contractual.\nAdoptar todas ' +
          'las medidas razonables para proteger la confidencialidad de la informacion recibida.\nDevolver o ' +
          'destruir toda la Informacion Confidencial una vez concluida la relacion, salvo que exista ' +
          'obligacion legal de conservacion.'
        ),
        parrafoClausula('4. EXCEPCIONES',
          'La obligacion de confidencialidad no se aplicara a informacion que:\nSea de dominio publico ' +
          'sin incumplimiento del presente Acuerdo.\nHaya sido obtenida legítimamente de un tercero sin ' +
          'restricciones de confidencialidad.\nDeba ser revelada por requerimiento legal o de una autoridad ' +
          'competente, en cuyo caso EL EMPLEADO debera notificar a LA EMPRESA con antelacion.'
        ),
        parrafoClausula('5. DURACION',
          'El presente Acuerdo tendra una vigencia indefinida a partir de la firma y continuara en vigor ' +
          'pese a que la denominacion de LA EMPRESA sea cambiada; para lo cual, no ameritara la suscripcion ' +
          'de un nuevo acuerdo y se respetaran las clausulas aqui estipuladas.'
        ),
        parrafoClausula('6. INCUMPLIMIENTO',
          'El incumplimiento de las obligaciones de confidencialidad dara derecho a LA EMPRESA a tomar las ' +
          'acciones legales que correspondan, incluyendo la reclamacion de danos y perjuicios, por un monto ' +
          'de CINCUENTA MIL DOLARES DE LOS ESTADOS UNIDOS DE AMERICA ($50.000,00).'
        ),
        parrafoClausula('7. LEGISLACION APLICABLE Y JURISDICCION',
          'Este Acuerdo se regira por las leyes vigentes tanto en el ambito civil como penal del Ecuador, ' +
          'y cualquier controversia sera resuelta en los tribunales competentes de la ciudad de Guayaquil.'
        ),
        new Paragraph({
          spacing: { before: 200, after: 400 },
          text: 'En prueba de conformidad, LAS PARTES firman el presente Acuerdo en la ciudad de Guayaquil a los ' + fecha + '.',
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, text: 'P. ' + empresa.empresa }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, text: 'R.U.C. # ' + empresa.ruc }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            filaFirma(empresa.representante_legal, colaborador.nombre),
            filaFirma(empresa.cargo_representante || 'Representante Legal', 'EL EMPLEADO'),
            filaFirma('C.C. N° ' + empresa.cedula_representante, 'C.C. ' + colaborador.cedula),
          ],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
