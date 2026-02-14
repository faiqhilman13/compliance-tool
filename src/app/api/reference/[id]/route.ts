import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateRequirementsSchema } from '@/lib/schemas';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reference = await prisma.referenceDoc.findUnique({
      where: { id },
      include: {
        requirements: {
          orderBy: [
            { criticality: 'desc' },
            { createdAt: 'asc' },
          ],
        },
      },
    });

    if (!reference) {
      return NextResponse.json(
        { error: 'Reference not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(reference);
  } catch (error) {
    console.error('Get reference error:', error);
    return NextResponse.json(
      { error: 'Failed to get reference' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const parsed = updateRequirementsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const existing = await prisma.referenceDoc.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Reference not found' },
        { status: 404 }
      );
    }

    await prisma.requirement.deleteMany({
      where: { referenceId: id },
    });

    const updated = await prisma.referenceDoc.update({
      where: { id },
      data: {
        requirements: {
          create: parsed.data.requirements.map(r => ({
            text: r.text,
            criticality: r.criticality,
            evidenceNeeded: r.evidenceNeeded,
          })),
        },
      },
      include: {
        requirements: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update requirements error:', error);
    return NextResponse.json(
      { error: 'Failed to update requirements' },
      { status: 500 }
    );
  }
}
