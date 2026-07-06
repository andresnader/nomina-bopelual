import pg from 'pg';
import { DATABASE_URL, DATABASE_URL_TEST } from '../config.js';

const connectionString = process.env.NODE_ENV === 'test' ? DATABASE_URL_TEST : DATABASE_URL;
const pool = new pg.Pool({ connectionString });

export default pool;
