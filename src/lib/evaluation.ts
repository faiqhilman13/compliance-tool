import { prisma } from './db';
import { downloadFile } from './s3';
import { parseDocument } from './parser';
import { 
  evaluateRequirementWithFallback, 
  generateSummaryWithFallback, 
  RequirementEvaluation 
} from './llm';
import type { Criticality, RequirementStatus } from '@/types';

const CRITICALITY_WEIGHTS: Record<Criticality, number> = {
  CRITICAL: 3,
  MAJOR: 2,
  MINOR: 1,
};

const STATUS_WEIGHTS: Record<RequirementStatus, number> = {
  PASS: 1,
  PARTIAL: 0.5,
  FAIL: 0,
  NOT_FOUND: 0,
};

export async function runEvaluation(evaluationId: string): Promise<void> {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      reference: {
        include: {
          requirements: true,
        },
      },
      submittedFiles: true,
    },
  });

  if (!evaluation) {
    throw new Error('Evaluation not found');
  }

  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { status: 'PROCESSING' },
  });

  try {
    const requirements = evaluation.reference.requirements;
    const referenceText = evaluation.reference.textContent;

    const fileResults = await Promise.all(
      evaluation.submittedFiles.map(async (file) => {
        const fileText = await getFileText(file.s3Key);
        const evaluations = await evaluateFile(
          file.id,
          requirements.map(r => ({
            id: r.id,
            text: r.text,
            criticality: r.criticality as 'CRITICAL' | 'MAJOR' | 'MINOR',
            evidenceNeeded: r.evidenceNeeded,
          })),
          fileText
        );

        const fileScore = calculateScore(evaluations, requirements.map(r => r.criticality as 'CRITICAL' | 'MAJOR' | 'MINOR'));

        await prisma.submittedFile.update({
          where: { id: file.id },
          data: { fileScore },
        });

        await prisma.requirementResult.createMany({
          data: evaluations.map(e => ({
            submittedFileId: file.id,
            requirementId: e.requirementId,
            status: e.status,
            confidence: e.confidence,
            evidence: e.evidence,
            explanation: e.explanation,
          })),
        });

        return { fileName: file.fileName, evaluations };
      })
    );

    const allScores = fileResults
      .map(r => r.evaluations)
      .flat()
      .filter(e => e.status !== 'NOT_FOUND');

    const overallScore = calculateOverallScore(
      fileResults.map(r => r.evaluations),
      requirements.map(r => r.criticality as 'CRITICAL' | 'MAJOR' | 'MINOR')
    );

    const allEvals = fileResults.flatMap(r => r.evaluations);
    const summary = await generateSummaryWithFallback(
      allEvals.map(e => ({
        requirementId: e.requirementId,
        status: e.status,
        confidence: e.confidence,
        evidence: e.evidence,
        explanation: e.explanation,
      })),
      `${fileResults.length} files`
    );

    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'COMPLETED',
        overallScore,
        summary,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Evaluation failed:', error);
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'FAILED',
        summary: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        completedAt: new Date(),
      },
    });
  }
}

async function getFileText(s3Key: string): Promise<string> {
  const buffer = await downloadFile(s3Key);
  const fileName = s3Key.split('/').pop() || 'document';
  const parsed = await parseDocument(buffer, fileName);
  return parsed.text;
}

async function evaluateFile(
  fileId: string,
  requirements: Array<{
    id: string;
    text: string;
    criticality: Criticality;
    evidenceNeeded: string;
  }>,
  fileText: string
): Promise<RequirementEvaluation[]> {
  const results: RequirementEvaluation[] = [];

  for (const req of requirements) {
    const evaluation = await evaluateRequirementWithFallback(
      req.text,
      req.evidenceNeeded,
      fileText,
      req.id
    );
    results.push(evaluation);
  }

  return results;
}

function calculateScore(
  evaluations: RequirementEvaluation[],
  criticalities: Criticality[]
): number {
  if (evaluations.length === 0) return 0;

  const hasCriticalFail = evaluations.some(
    (e, i) => criticalities[i] === 'CRITICAL' && e.status === 'FAIL'
  );

  if (hasCriticalFail) return Math.max(0, calculateWeightedScore(evaluations, criticalities) - 20);

  return calculateWeightedScore(evaluations, criticalities);
}

function calculateWeightedScore(
  evaluations: RequirementEvaluation[],
  criticalities: Criticality[]
): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (let i = 0; i < evaluations.length; i++) {
    const weight = CRITICALITY_WEIGHTS[criticalities[i]] || 1;
    const statusWeight = STATUS_WEIGHTS[evaluations[i].status] || 0;

    totalWeight += weight;
    weightedScore += statusWeight * weight;
  }

  return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0;
}

function calculateOverallScore(
  fileEvaluations: RequirementEvaluation[][],
  criticalities: Criticality[]
): number {
  const allScores = fileEvaluations.map(evals => calculateScore(evals, criticalities));
  const validScores = allScores.filter(s => s > 0);
  return validScores.length > 0
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : 0;
}
