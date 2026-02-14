export type Criticality = 'CRITICAL' | 'MAJOR' | 'MINOR';
export type EvaluationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type RequirementStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_FOUND';

export interface ReferenceDoc {
  id: string;
  name: string;
  s3Key: string;
  textContent: string;
  isPreloaded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Requirement {
  id: string;
  referenceId: string;
  text: string;
  criticality: Criticality;
  evidenceNeeded: string;
  createdAt: Date;
}

export interface Evaluation {
  id: string;
  referenceId: string;
  status: EvaluationStatus;
  overallScore: number | null;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface SubmittedFile {
  id: string;
  evaluationId: string;
  fileName: string;
  s3Key: string;
  fileScore: number | null;
  createdAt: Date;
}

export interface RequirementResult {
  id: string;
  submittedFileId: string;
  requirementId: string;
  status: RequirementStatus;
  confidence: number;
  evidence: string | null;
  explanation: string | null;
  createdAt: Date;
}

export interface EvaluationWithDetails extends Evaluation {
  reference: ReferenceDoc;
  submittedFiles: (SubmittedFile & {
    results: RequirementResult[];
  })[];
}

export interface ReferenceWithRequirements extends ReferenceDoc {
  requirements: Requirement[];
}
