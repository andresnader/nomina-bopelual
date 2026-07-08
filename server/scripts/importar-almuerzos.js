import fs from 'fs';
import xlsx from 'xlsx';
import path from 'path';
import pool from '../src/db/pool.js';
import { round2 } from '../src/lib/round.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: node scripts/importar-almuerzos.js <ruta-al-excel>');
  process.exit(1);
}

function normalizar(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function matchScore(excelName, dbName) {
  const exParts = normalizar(excelName).split(/\s+/).filter(Boolean);
  const dbParts = normalizar(dbName).split(/\s+/).filter(Boolean);
  if (exParts.length === 0 || dbParts.length === 0) return 0;
  let matches = 0;
  for (const ex of exParts) {
    if (dbParts.some(dp => dp === ex || dp.includes(ex) || ex.includes(dp))) {
      matches++; continue;
    }
    if (ex.length >= 4 && dbParts.some(dp => dp.length >= 4 && dp.slice(0, 4) === ex.slice(0, 4))) {
      matches++; continue;
    }
  }
  return matches / exParts.length;
}

const NO_COLABORADORES = new Set([
  'BOPELUAL', 'ALMUERZO COMPLETO', 'SEGUNDO', 'SEGUNDO REFORZADO DIETA',
  'SOPA', 'TOTAL',
]);

async function run() {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Archivo no encontrado: ${absolutePath}`);
    process.exit(1);
  }

  const fileData = fs.readFileSync(absolutePath);
  const wb = xlsx.read(fileData, { type: 'buffer' });
  const sheet = wb.Sheets['ALMUERZOS'];
  if (!sheet) {
    console.error('No se encontró la hoja ALMUERZOS en el Excel.');
    process.exit(1);
  }

  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  // Row 0: merged headers, Row 1: day numbers
  // Q1: columns 2-16 (days 1-15), Q2: columns 17-31 (days 16-30)
  const rows = data.slice(2).filter(r => r[1]);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: colaboradores } = await client.query('SELECT id, nombre FROM colaboradores');
    let noEncontrados = 0;
    let importados = 0;

    for (const r of rows) {
      const nombreExcel = r[1].toString().trim();
      const normExcel = normalizar(nombreExcel);

      if (NO_COLABORADORES.has(normExcel)) {
        console.log(`  (saltado: "${nombreExcel}" no es colaborador)`);
        continue;
      }

      const q1Vals = r.slice(2, 17).filter(v => v !== null && v !== undefined && v !== '');
      const q2Vals = r.slice(17, 32).filter(v => v !== null && v !== undefined && v !== '');
      const q1 = q1Vals.reduce((a, b) => a + (Number(b) || 0), 0);
      const q2 = q2Vals.reduce((a, b) => a + (Number(b) || 0), 0);

      if (q1 === 0 && q2 === 0) {
        console.log(`  (saltado: "${nombreExcel}" tiene $0 en ambas quincenas)`);
        continue;
      }

      let best = { idx: -1, score: 0 };
      colaboradores.forEach((c, i) => {
        const score = matchScore(normExcel, c.nombre);
        if (score > best.score) best = { idx: i, score };
      });

      if (best.idx === -1 || best.score < 0.5) {
        console.warn(`[WARN] Colaborador no encontrado: "${nombreExcel}". Saltando.`);
        noEncontrados++;
        continue;
      }

      const colaborador = colaboradores[best.idx];
      const colId = colaborador.id;
      console.log(`→ ${nombreExcel} → ${colaborador.nombre} (Q1: $${q1}, Q2: $${q2})`);

      if (q1 > 0) {
        await client.query(
          `INSERT INTO descuentos_recurrentes (colaborador_id, tipo_linea, monto, aplicar_en, notas)
           VALUES ($1, 'ALIMENTACION', $2, 1, 'Almuerzo 1ra quincena — Importado de ALMUERZOS DE CASTRO')`,
          [colId, round2(q1)]
        );
      }
      if (q2 > 0) {
        await client.query(
          `INSERT INTO descuentos_recurrentes (colaborador_id, tipo_linea, monto, aplicar_en, notas)
           VALUES ($1, 'ALIMENTACION', $2, 2, 'Almuerzo 2da quincena — Importado de ALMUERZOS DE CASTRO')`,
          [colId, round2(q2)]
        );
      }
      importados++;
    }

    await client.query('COMMIT');
    console.log(`\n¡Importación completada!`);
    console.log(`- Colaboradores importados: ${importados}`);
    console.log(`- No encontrados (saltados): ${noEncontrados}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error durante la importación. ROLLBACK.', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
