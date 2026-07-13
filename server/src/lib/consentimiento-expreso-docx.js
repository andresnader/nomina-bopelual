import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';

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

function parrafoTitulo(texto) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: texto, bold: true, size: 28 })],
  });
}

function parrafoNormal(texto) {
  return new Paragraph({ spacing: { after: 200 }, text: texto });
}

function parrafoClausula(titulo, texto) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: `${titulo}\n`, bold: true }), new TextRun(texto)],
  });
}

export async function generarConsentimientoExpresoDocx({ empresa, colaborador, emision }) {
  const tratamiento = colaborador.sexo === 'F' ? 'la señora' : 'el señor';

  const doc = new Document({
    sections: [{
      children: [
        parrafoTitulo('ANEXO DE CONSENTIMIENTO EXPRESO PARA USO DE IMAGEN Y DATOS PERSONALES'),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: empresa.empresa, bold: true, size: 24 })] }),
        new Paragraph({
          spacing: { after: 200 },
          text: `${empresa.empresa} en mérito a su compromiso de respeto a los derechos fundamentales de ` +
            'protección de datos personales y la autodeterminación informativa, da a conocer a sus asesores ' +
            'comisionistas, personal afiliado y/o proveedores que el uso de su imagen y tratamiento de datos ' +
            'personales se regirá por los principios y disposiciones contenidos en la Ley Orgánica de ' +
            'Protección de Datos Personales, la Constitución y los instrumentos internacionales ratificados ' +
            'por el Estado.',
        }),
        new Paragraph({ spacing: { before: 200, after: 200 }, text: 'En ese sentido, a través de la presente, le informamos de manera clara, amplia y precisa como la institución garantizará a todos con quienes mantenga vínculos comerciales o no su protección a los datos personales.' }),
        parrafoClausula('FINES DEL TRATAMIENTO',
          'El tratamiento de los datos personales tendrá los siguientes fines:\n' +
          'Contactar a usted a través de llamadas telefónicas, envío de comunicaciones a través de correos ' +
          'electrónicos, mensajes y demás medios de comunicación físicos y/o telemáticos, así como con ' +
          'visitas domiciliarias con el fin de informarle sobre cualquier beneficio o circunstancias ' +
          'consecuentes a la relación contractual.\n' +
          'Elaborar análisis y estudios relacionados con su comportamiento de consumos, así como ' +
          'investigaciones y monitoreo periódicos sobre su comportamiento crediticio.\n' +
          'Cooperar con entes gubernamentales y/o judiciales en los términos de lo dispuesto por la ' +
          'normatividad aplicable, así como a los requerimientos de autoridades competentes.\n' +
          'Informar del lanzamiento o cambios de nuevos productos, bienes, servicios, promociones y/u ' +
          'ofertas de acuerdo con sus intereses.\nGenerar información de carácter publicitario, promocional ' +
          'y/o informativo que será de interés de la compañía para publicitar la empresa BOPELUAL S.A.\n' +
          'Proporcionar información personal a la compañía y marcas del grupo BOPELUAL S.A., y aceptar el ' +
          'uso de su imagen por el lapso de 5 años posterior a la firma del presente convenio.\n' +
          'Conservar la confidencialidad del presente anexo, dejando a voluntad de BOPELUAL S.A a encaminar ' +
          'las acciones legales pertinentes en caso de irrumpir el presente.'
        ),
        parrafoClausula('TIPOS DE TRATAMIENTO',
          'El tratamiento de los datos personales podrá ser efectuado por personas naturales y jurídicas, ' +
          'públicas y privadas cumpliendo los principios de juridicidad, lealtad, transparencia, ' +
          'confidencialidad, calidad y exactitud y serán obtenidos de manera directa e indirectamente.'
        ),
        parrafoClausula('TIEMPO DE CONSERVACIÓN',
          'Los datos personales serán conservados durante el tiempo requerido para el cumplimiento de los fines antes señalados.'
        ),
        parrafoClausula('CONSECUENCIAS DE LA NEGATIVA',
          'La negativa a proporcionar sus datos personales impedirá que BOPELUAL S.A pueda cumplir con sus ' +
          'obligaciones legales y/o contractuales. Por consiguiente, dicha negativa imposibilitará el inicio ' +
          'o continuidad de la relación comercial.'
        ),
        new Paragraph({
          spacing: { before: 200, after: 200 },
          children: [new TextRun(
            `En efecto de lo expuesto, yo ${colaborador.nombre}, acepto, expresa e irrevocablemente, sin ` +
            `reserva ni limitación alguna, todos y cada uno de los términos y condiciones estipuladas en el ` +
            `presente documento, proporcionado por ${empresa.empresa}.`
          )],
        }),
        new Paragraph({ spacing: { after: 200 }, text: 'Ratifico el contenido íntegro del presente documento y para constancia lo suscribo en un ejemplar.' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            filaFirma(`${colaborador.nombre}`, `${emision.cargo}`),
            filaFirma(`C.C. ${colaborador.cedula}`, 'COMISIONISTA, AFILIADO, PROVEEDOR'),
          ],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
