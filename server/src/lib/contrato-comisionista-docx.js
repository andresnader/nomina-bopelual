import { Document, Packer, Paragraph, TextRun, BorderStyle } from 'docx';

function parrafoTitulo(texto) {
  return new Paragraph({
    alignment: 1,
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

export async function generarContratoComisionistaDocx({ empresa, colaborador, emision }) {
  const tratamiento = colaborador.sexo === 'F' ? 'la señorita' : 'el señor';
  const pronombre = colaborador.sexo === 'F' ? 'la' : 'lo';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const d = new Date();
  const fecha = `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} del ${d.getUTCFullYear()}`;

  const doc = new Document({
    sections: [{
      children: [
        parrafoTitulo('CONTRATO DE COMISIONISTA'),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun(
            `Comparecen a la celebración del presente contrato por una parte el señor ${empresa.representante_legal}, por los derechos que representa de la compañía ${empresa.empresa} en su calidad de ${empresa.cargo_representante || 'Gerente General'} de la compañía, la misma que está domiciliada en la ciudad de Guayaquil, a quien en adelante se le denominará como LA COMITENTE; y por otra parte ${tratamiento} ${colaborador.nombre}, mayor de edad, con cédula de ciudadanía ${colaborador.cedula}, con domicilio en la ciudad de Guayaquil, a quien en adelante y para efectos de este contrato se lo denominará como EL COMISIONISTA.`
          )],
        }),
        parrafoClausula('PRIMERA', 'Regulación.'),
        parrafoNormal('El presente contrato tiene carácter mercantil y se regirá por las cláusulas en él contenidas y, en lo que en ellas no estuviera previsto, por las disposiciones del Código de Comercio y de las demás leyes especiales que se apliquen en este tipo de contrato, los usos del comercio y, en su defecto, por lo dispuesto en el Código Civil.'),
        parrafoClausula('SEGUNDA', 'Objeto.'),
        parrafoNormal('LA COMITENTE entrega al COMISIONISTA la descripción plena de los productos que se comercializarán, los mismos que se reseñan en el documento que se adjunta al presente contrato como Anexo N.º UNO.'),
        parrafoNormal(`PRODUCTOS: ${emision.anexo_productos}`),
        parrafoNormal('EL COMISIONISTA confirma haber recibido la descripción de los productos descritos y singularizados en el Anexo N.º UNO.'),
        parrafoClausula('TERCERA', 'Condiciones de Venta'),
        parrafoNormal('Los precios mínimos de venta de los productos se reseñan en el documento que se adjunta al presente contrato como Anexo N.º DOS.'),
        parrafoNormal(`PRECIOS: ${emision.anexo_precios}`),
        parrafoNormal('Los productos serán ofertados, comercializados y vendidos por EL COMISIONISTA en un período de tiempo prudencial.'),
        parrafoNormal('El comisionista no podrá vender a plazos no estipulados con LA COMITENTE, pudiendo en estos casos la comitente no aceptar la negociación.'),
        parrafoClausula('CUARTA', 'Comisión'),
        parrafoNormal(`EL COMISIONISTA recibirá una comisión de ${emision.comision_porcentaje}`),
        parrafoNormal('Si EL COMISIONISTA, sin causa legal, no cumple la gestión aceptada o su mala gestión causa problemas a LA COMITENTE, será responsable de todos los daños que sobrevengan.'),
        parrafoClausula('QUINTA', 'Obligaciones del Comisionista'),
        parrafoNormal('Para la venta de los productos, EL COMISIONISTA contratará en su propio nombre, quedando obligado de modo directo con las personas con que contrate.'),
        parrafoNormal('EL COMISIONISTA no podrá delegar por su propia voluntad el encargo recibido, sin previa autorización expresa de LA COMITENTE.'),
        parrafoNormal('EL COMISIONISTA no podrá comprar para sí, ni para algún pariente, ni por encargo de terceros, lo que se le ha mandado vender.'),
        parrafoClausula('SEXTA', 'Obligaciones de la Comitente'),
        parrafoNormal('LA COMITENTE deberá satisfacer los valores devengados por el COMISIONISTA, mediante transferencia, cheque o cualquier otro medio de pago debidamente autorizado.'),
        parrafoClausula('SÉPTIMA', 'Jurisdicción'),
        parrafoNormal('Para resolver cualquier cuestión derivada del presente contrato, las partes se someten expresamente en primera instancia a una mediación directa.'),
        parrafoNormal('Renuncian del fuero propio; o bien se someterán al arbitraje de un centro de mediación debidamente autorizado.'),
        new Paragraph({ spacing: { before: 200, after: 100 }, text: 'Las partes firman el presente contrato de COMISIÓN, por duplicado.' }),
        new Paragraph({ spacing: { after: 100 }, text: `En Guayaquil, al día ${fecha}.` }),
        new Paragraph({ spacing: { before: 200, after: 50 }, text: 'LA COMITENTE                                                          EL COMISIONISTA' }),
        new Paragraph({ spacing: { after: 50 }, text: `P. ${empresa.empresa}                                               ${colaborador.nombre}` }),
        new Paragraph({ spacing: { after: 50 }, text: `R.U.C. # ${empresa.ruc}                                                              C.I. ${colaborador.cedula}` }),
        new Paragraph({ spacing: { after: 50 }, text: empresa.representante_legal }),
        new Paragraph({ spacing: { after: 50 }, text: `C.C. N.º ${empresa.cedula_representante}` }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
