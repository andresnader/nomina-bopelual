import fs from 'fs';
import xlsx from 'xlsx';
import path from 'path';
import pool from '../src/db/pool.js';
import { round2 } from '../src/lib/round.js';

// Si el usuario pasa la ruta del excel como argumento:
const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: node scripts/importar-descuentos.js <ruta-al-excel>');
  process.exit(1);
}

function parsePlazo(texto) {
  if (!texto) return 1; // 1 mes por defecto
  const match = texto.toString().match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

async function run() {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Archivo no encontrado: ${absolutePath}`);
    process.exit(1);
  }

  const fileData = fs.readFileSync(absolutePath);
  const wb = xlsx.read(fileData, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]]; // Asumimos la primera hoja
  // Leemos como array de arrays para ignorar los nombres mezclados de las columnas fusionadas
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  // A partir de la fila 6 (índice 5) están los datos
  const rows = data.slice(5).filter(r => r[1]); // r[1] es el EMPLEADO

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener todos los colaboradores para mapeo
    const { rows: colaboradores } = await client.query('SELECT id, nombre FROM colaboradores');
    let noEncontrados = 0;
    let importados = 0;

    for (const r of rows) {
      const nombreExcel = r[1].toString().trim().toUpperCase();
      
      // Buscar match (split por espacio, verificar que algún nombre y apellido coincida o similar)
      const partes = nombreExcel.split(' ').filter(Boolean);
      let colaborador = colaboradores.find(c => {
        const full = (c.nombre || '').toUpperCase();
        return partes.every(p => full.includes(p));
      });

      if (!colaborador) {
        console.warn(`[WARN] Colaborador no encontrado: ${nombreExcel}. Saltando fila.`);
        noEncontrados++;
        continue;
      }

      const colId = colaborador.id;
      const FECHA_INICIO = '2026-06-01'; // Como es JUNIO 2026, asumimos que los préstamos empiezan ahí o ya venían

      // --- DESCUENTOS RECURRENTES ---
      // 4: SALUDSA
      if (r[4]) {
        await client.query(
          `INSERT INTO descuentos_recurrentes (colaborador_id, tipo_linea, monto, aplicar_en, notas) VALUES ($1, 'SALUDSA', $2, 0, 'Importado de Excel')`,
          [colId, round2(r[4])]
        );
      }
      // 5: PREVIEX
      if (r[5]) {
        await client.query(
          `INSERT INTO descuentos_recurrentes (colaborador_id, tipo_linea, monto, aplicar_en, notas) VALUES ($1, 'SEGURO_PREVIEX', $2, 0, 'Importado de Excel')`,
          [colId, round2(r[5])]
        );
      }
      // 6: RETENCIÓN TRIBUTARIAS
      if (r[6]) {
        await client.query(
          `INSERT INTO descuentos_recurrentes (colaborador_id, tipo_linea, monto, aplicar_en, notas) VALUES ($1, 'RETENCION_IR', $2, 0, 'Importado de Excel')`,
          [colId, round2(r[6])]
        );
      }

      // --- PRÉSTAMOS E INSTITUCIONALES ---
      // Función helper para insertar préstamos
      const insertarPrestamo = async (monto, saldo, plazoMeses, notas) => {
        const montoNum = parseFloat(monto) || 0;
        const saldoNum = parseFloat(saldo) || montoNum;
        if (montoNum <= 0) return;
        
        const cuotaMensual = montoNum / plazoMeses;
        const cuotaQuincena = round2(cuotaMensual / 2);
        
        await client.query(
          `INSERT INTO prestamos (colaborador_id, monto_total, cuota_quincena, saldo_pendiente, fecha_inicio, notas)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [colId, round2(montoNum), cuotaQuincena, round2(saldoNum), FECHA_INICIO, notas || 'Importado de Excel']
        );
      };

      // 2: MEC (monto), 3: MEC (detalle)
      if (r[2]) await insertarPrestamo(r[2], r[2], 1, `MEC: ${r[3] || ''}`);
      
      // 7-12: PRÉSTAMOS INSTITUCIONALES
      // 8: Monto, 9: Saldo, 10: Plazo, 12: Detalle
      if (r[8]) {
        const plazo = parsePlazo(r[10]);
        await insertarPrestamo(r[8], r[9] ?? r[8], plazo, `Préstamo Institucional (${r[7] || ''}): ${r[12] || ''}`);
      }

      // 13-14: ANTICIPOS
      if (r[13]) await insertarPrestamo(r[13], r[13], 1, `Anticipo de sueldo: ${r[14] || ''}`);

      // 15-19: EQUIPO CELULAR
      if (r[16]) {
        const plazoCel = parsePlazo(r[18]);
        await insertarPrestamo(r[16], r[17] ?? r[16], plazoCel, `Equipo Celular: ${r[15] || ''}`);
      }

      // 20-21: OTROS (Multas)
      if (r[20]) {
        await insertarPrestamo(r[20], r[20], 1, `Otros/Multas (${r[21] || ''} días)`);
      }

      importados++;
    }

    await client.query('COMMIT');
    console.log(`\n¡Migración Completada!`);
    console.log(`- Empleados importados: ${importados}`);
    console.log(`- Empleados no encontrados (saltados): ${noEncontrados}`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error durante la migración. Se abortó todo (ROLLBACK).', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
