import { prisma } from './db';
import { runEvaluation } from './evaluation';

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_EVALUATIONS || '2');
let isRunning = false;

export async function startQueueProcessor(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  console.log('Queue processor started');

  const processLoop = async () => {
    try {
      await processQueue();
    } catch (error) {
      console.error('Queue processing error:', error);
    }

    setTimeout(processLoop, 5000);
  };

  processLoop();
}

async function processQueue(): Promise<void> {
  const runningCount = await prisma.evaluation.count({
    where: { status: 'PROCESSING' },
  });

  if (runningCount >= MAX_CONCURRENT) {
    return;
  }

  const nextJob = await prisma.evaluation.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: MAX_CONCURRENT - runningCount,
  });

  if (!nextJob) {
    return;
  }

  console.log(`Starting evaluation: ${nextJob.id}`);

  runEvaluation(nextJob.id).catch(error => {
    console.error(`Evaluation ${nextJob.id} failed:`, error);
  });
}

export async function enqueueEvaluation(evaluationId: string): Promise<void> {
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { status: 'PENDING' },
  });

  setTimeout(() => processQueue().catch(console.error), 100);
}
