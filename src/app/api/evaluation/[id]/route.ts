import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
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
            results: {
              include: {
                requirement: {
                  select: {
                    id: true,
                    text: true,
                    criticality: true,
                    evidenceNeeded: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { error: 'Evaluation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: evaluation.id,
      status: evaluation.status,
      overallScore: evaluation.overallScore,
      summary: evaluation.summary,
      reference: evaluation.reference,
      submittedFiles: evaluation.submittedFiles.map(file => ({
        id: file.id,
        fileName: file.fileName,
        score: file.fileScore,
        results: file.results.map(result => ({
          requirementId: result.requirement.id,
          requirementText: result.requirement.text,
          criticality: result.requirement.criticality,
          evidenceNeeded: result.requirement.evidenceNeeded,
          status: result.status,
          confidence: result.confidence,
          evidence: result.evidence,
          explanation: result.explanation,
        })),
      })),
      createdAt: evaluation.createdAt,
      completedAt: evaluation.completedAt,
    });
  } catch (error) {
    console.error('Get evaluation error:', error);
    return NextResponse.json(
      { error: 'Failed to get evaluation' },
      { status: 500 }
    );
  }
}
