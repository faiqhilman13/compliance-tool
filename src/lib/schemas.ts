import { z } from 'zod';

export const uploadReferenceSchema = z.object({
  name: z.string().min(1).max(255),
});

export const createEvaluationSchema = z.object({
  referenceId: z.string().min(1),
  fileNames: z.array(z.string().min(1)).min(1).max(5),
  fileKeys: z.array(z.string().min(1)).min(1).max(5),
}).refine(data => data.fileNames.length === data.fileKeys.length, {
  message: "fileNames and fileKeys must have the same length",
});

export const updateRequirementsSchema = z.object({
  requirements: z.array(z.object({
    text: z.string().min(1),
    criticality: z.enum(['CRITICAL', 'MAJOR', 'MINOR']),
    evidenceNeeded: z.string().min(1),
  })).min(1),
});

export type UploadReferenceInput = z.infer<typeof uploadReferenceSchema>;
export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;
export type UpdateRequirementsInput = z.infer<typeof updateRequirementsSchema>;
