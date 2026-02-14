import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uploadFileLocal, downloadFileLocal, deleteFileLocal, getSignedDownloadUrlLocal } from './localStorage';

const hasAwsCredentials = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET_NAME);

let s3Client: S3Client | null = null;

if (hasAwsCredentials) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'compliance-tool-files';

export function isUsingLocalStorage(): boolean {
  return !hasAwsCredentials;
}

export async function uploadFile(
  file: Buffer,
  fileName: string,
  folder: 'references' | 'submissions'
): Promise<string> {
  if (!hasAwsCredentials || !s3Client) {
    return uploadFileLocal(file, fileName, folder);
  }
  
  const key = `${folder}/${Date.now()}-${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: getContentType(fileName),
  });

  await s3Client.send(command);
  return key;
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  if (!hasAwsCredentials || !s3Client) {
    return getSignedDownloadUrlLocal(key);
  }
  
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getSignedUploadUrl(
  fileName: string,
  folder: 'references' | 'submissions',
  expiresIn = 3600
): Promise<{ uploadUrl: string; key: string }> {
  if (!hasAwsCredentials || !s3Client) {
    throw new Error('Signed upload URLs require AWS credentials. Use direct upload instead.');
  }
  
  const key = `${folder}/${Date.now()}-${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: getContentType(fileName),
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return { uploadUrl, key };
}

export async function deleteFile(key: string): Promise<void> {
  if (!hasAwsCredentials || !s3Client) {
    return deleteFileLocal(key);
  }
  
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

export async function downloadFile(key: string): Promise<Buffer> {
  if (!hasAwsCredentials || !s3Client) {
    return downloadFileLocal(key);
  }
  
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);
  const stream = response.Body as AsyncIterable<Uint8Array>;
  
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks.map(c => Buffer.from(c)));
}

function getContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
  };
  return types[ext || ''] || 'application/octet-stream';
}
