import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export interface ParsedDocument {
  text: string;
  metadata: {
    pageCount?: number;
    fileType: string;
    fileName: string;
  };
}

export async function parseDocument(
  fileBuffer: Buffer,
  fileName: string
): Promise<ParsedDocument> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  if (ext === 'pdf') {
    return parsePdf(fileBuffer, fileName);
  } else if (ext === 'docx' || ext === 'doc') {
    return parseDocx(fileBuffer, fileName);
  } else if (ext === 'txt') {
    return {
      text: fileBuffer.toString('utf-8'),
      metadata: { fileType: 'txt', fileName },
    };
  }
  
  return {
    text: fileBuffer.toString('utf-8'),
    metadata: { fileType: ext || 'unknown', fileName },
  };
}

async function parsePdf(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  try {
    const data = await pdf(buffer);
    
    return {
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        fileType: 'pdf',
        fileName,
      },
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    return {
      text: buffer.toString('utf-8'),
      metadata: { fileType: 'pdf', fileName },
    };
  }
}

async function parseDocx(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    return {
      text,
      metadata: {
        pageCount: Math.ceil(text.length / 2000),
        fileType: 'docx',
        fileName,
      },
    };
  } catch (error) {
    console.error('DOCX parsing error:', error);
    return {
      text: buffer.toString('utf-8'),
      metadata: { fileType: 'docx', fileName },
    };
  }
}

export function chunkText(text: string, maxChunkSize = 2000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxChunkSize;
    
    if (end < text.length) {
      const periodIndex = text.lastIndexOf('.', end);
      const newlineIndex = text.lastIndexOf('\n', end);
      const breakIndex = Math.max(periodIndex, newlineIndex);
      
      if (breakIndex > start + maxChunkSize / 2) {
        end = breakIndex + 1;
      }
    }
    
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    
    if (start >= text.length) break;
  }
  
  return chunks.filter(c => c.length > 50);
}
