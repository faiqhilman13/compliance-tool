import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { uploadFile } from '@/lib/s3';
import { parseDocument } from '@/lib/parser';
import { extractRequirementsWithFallback } from '@/lib/llm';
import { uploadReferenceSchema } from '@/lib/schemas';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string | null;

    const parsed = uploadReferenceSchema.safeParse({ name });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const s3Key = await uploadFile(buffer, file.name, 'references');

    const parsedDoc = await parseDocument(buffer, file.name);

    const requirementsResult = await extractRequirementsWithFallback(parsedDoc.text);

    const reference = await prisma.referenceDoc.create({
      data: {
        name: parsed.data.name || file.name,
        s3Key,
        textContent: parsedDoc.text,
        isPreloaded: false,
        requirements: {
          create: requirementsResult.requirements.map((r, index) => ({
            text: r.text,
            criticality: r.criticality as 'CRITICAL' | 'MAJOR' | 'MINOR',
            evidenceNeeded: r.evidenceNeeded,
          })),
        },
      },
      include: {
        requirements: true,
      },
    });

    return NextResponse.json({
      id: reference.id,
      name: reference.name,
      requirementCount: reference.requirements.length,
      requirements: reference.requirements,
    });
  } catch (error) {
    console.error('Reference upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload reference document' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const references = await prisma.referenceDoc.findMany({
      select: {
        id: true,
        name: true,
        isPreloaded: true,
        requirements: {
          select: {
            id: true,
            criticality: true,
          },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      references.map(r => ({
        id: r.id,
        name: r.name,
        isPreloaded: r.isPreloaded,
        requirementCount: r.requirements.length,
        criticalCount: r.requirements.filter(q => q.criticality === 'CRITICAL').length,
        createdAt: r.createdAt,
      }))
    );
  } catch (error) {
    console.error('List references error:', error);
    return NextResponse.json(
      { error: 'Failed to list references' },
      { status: 500 }
    );
  }
}
