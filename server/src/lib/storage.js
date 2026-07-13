import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_BUCKET,
  STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY,
} from '../config.js';

const client = new S3Client({
  region: STORAGE_REGION,
  endpoint: STORAGE_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: STORAGE_ACCESS_KEY_ID,
    secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
  },
});

export async function subirArchivo(key, buffer, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: STORAGE_BUCKET, Key: key, Body: buffer, ContentType: contentType,
  }));
  return key;
}

export async function descargarArchivo(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}
