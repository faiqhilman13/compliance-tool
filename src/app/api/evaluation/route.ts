import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createEvaluationSchema } from '@/lib/schemas';
import { enqueueEvaluation } from '@/lib/queue';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = createEvaluationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const reference = await prisma.referenceDoc.findUnique({
      where: { id: parsed.data.referenceId },
      include: {
        requirements: true,
      },
    });

    if (!reference) {
      return NextResponse.json(
        { error: 'Reference document not found' },
        { status: 404 }
      );
    }

    if (reference.requirements.length === 0) {
      return NextResponse.json(
        { error: 'Reference has no requirements. Please add requirements first.' },
        { status: 400 }
      );
    }

    const files = parsed.data.fileNames.map((fileName, index) => ({
      fileName,
      s3Key: parsed.data.fileKeys[index],
    }));

    const evaluation = await prisma.evaluation.create({
      data: {
        referenceId: parsed.data.referenceId,
        status: 'PENDING',
        submittedFiles: {
          create: files,
        },
      },
      include: {
        submittedFiles: true,
      },
    });

    await enqueueEvaluation(evaluation.id);

    return NextResponse.json({
      id: evaluation.id,
      status: evaluation.status,
      submittedFiles: evaluation.submittedFiles.map(f => ({
        id: f.id,
        fileName: f.fileName,
      })),
    });
  } catch (error) {
    console.error('Create evaluation error:', error);
    return NextResponse.json(
      { error: 'Failed to create evaluation' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const evaluations = await prisma.evaluation.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        reference: {
          select: {
            id: true,
            name: true,
          },
        },
        submittedFiles: {
          select: {
            id: true,
            fileName: true,
            fileScore: true,
          },
        },
      },
    });

    return NextResponse.json(evaluations);
  } catch (error) {
    console.error('List evaluations error:', error);
    return NextResponse.json(
      { error: 'Failed to list evaluations' },
      { status: 500 }
    );
  }
}
