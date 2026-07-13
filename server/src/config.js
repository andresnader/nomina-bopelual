import 'dotenv/config';

export const PORT = process.env.PORT || 3001;
export const DATABASE_URL = process.env.DATABASE_URL;
export const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN;
export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';
export const SESSION_SECRET = process.env.SESSION_SECRET || 'nomina-dev-secret-change-in-prod';
export const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT;
export const STORAGE_REGION = process.env.STORAGE_REGION || 'auto';
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET;
export const STORAGE_ACCESS_KEY_ID = process.env.STORAGE_ACCESS_KEY_ID;
export const STORAGE_SECRET_ACCESS_KEY = process.env.STORAGE_SECRET_ACCESS_KEY;
