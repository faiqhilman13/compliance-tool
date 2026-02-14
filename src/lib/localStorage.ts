import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'storage');

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export async function uploadFileLocal(
  file: Buffer,
  fileName: string,
  folder: 'references' | 'submissions'
): Promise<string> {
  ensureStorageDir();
  
  const folderPath = path.join(STORAGE_DIR, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  
  const key = `${folder}/${Date.now()}-${fileName}`;
  const fullPath = path.join(STORAGE_DIR, key);
  
  fs.writeFileSync(fullPath, file);
  return key;
}

export async function downloadFileLocal(key: string): Promise<Buffer> {
  const fullPath = path.join(STORAGE_DIR, key);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${key}`);
  }
  
  return fs.readFileSync(fullPath);
}

export async function deleteFileLocal(key: string): Promise<void> {
  const fullPath = path.join(STORAGE_DIR, key);
  
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

export async function getSignedDownloadUrlLocal(key: string): Promise<string> {
  // For local storage, we'll return a data URL or simple path
  // In a real app, you'd set up a route handler for serving files
  return `/api/storage/${key}`;
}
