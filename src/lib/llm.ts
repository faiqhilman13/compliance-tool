import { BedrockMessage, BedrockResponse, invokeClaude } from './bedrock';
import { 
  OpenAIMessage, 
  OpenAIResponse, 
  invokeOpenAI,
  extractRequirementsOpenAI,
  evaluateRequirementOpenAI,
  generateSummaryOpenAI,
  RequirementEvaluationOpenAI 
} from './openai';

export type LLMMessage = BedrockMessage | OpenAIMessage;
export type LLMResponse = BedrockResponse | OpenAIResponse;

export interface RequirementEvaluation {
  requirementId: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_FOUND';
  confidence: number;
  evidence: string;
  explanation: string;
}

async function invokeWithFallback(
  messages: BedrockMessage[],
  systemPrompt?: string,
  useFallback: boolean = false
): Promise<BedrockResponse> {
  try {
    return await invokeClaude(messages, systemPrompt);
  } catch (error) {
    if (useFallback) {
      console.warn('Bedrock failed, falling back to OpenAI:', error);
      try {
        const openAIMessages: OpenAIMessage[] = messages;
        const response = await invokeOpenAI(openAIMessages, systemPrompt);
        return {
          content: response.content,
          usage: response.usage,
        };
      } catch (fallbackError) {
        console.error('OpenAI fallback also failed:', fallbackError);
        throw new Error(`All LLM providers failed. Bedrock: ${error}, OpenAI: ${fallbackError}`);
      }
    }
    throw error;
  }
}

export async function invokeWithFallbackWrapper(
  messages: BedrockMessage[],
  systemPrompt?: string,
  useFallback: boolean = true
): Promise<BedrockResponse> {
  return invokeWithFallback(messages, systemPrompt, useFallback);
}

export async function extractRequirementsWithFallback(
  documentText: string,
  useFallback: boolean = true
): Promise<{ requirements: Array<{ text: string; criticality: string; evidenceNeeded: string }> }> {
  const systemPrompt = `You are a compliance expert. Analyze the provided document and extract all compliance requirements.

For each requirement, identify:
1. text: The exact requirement text
2. criticality: CRITICAL (hard fail if missing), MAJOR (significant), or MINOR (minor detail)
3. evidenceNeeded: What type of evidence would satisfy this requirement

Return ONLY a valid JSON object with this structure:
{
  "requirements": [
    { "text": "...", "criticality": "CRITICAL|MAJOR|MINOR", "evidenceNeeded": "..." }
  ]
}

Do not include any other text or explanation.`;

  const userMessage = `Extract compliance requirements from this document:\n\n${documentText.substring(0, 15000)}`;

  try {
    const response = await invokeWithFallback(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      false 
    );
    try {
      const parsed = JSON.parse(response.content);
      return parsed;
    } catch {
      console.error('Failed to parse requirements:', response.content);
      return { requirements: [] };
    }
  } catch (error) {
    if (useFallback) {
      console.warn('Bedrock failed for extractRequirements, trying OpenAI:', error);
      return extractRequirementsOpenAI(documentText);
    }
    return { requirements: [] };
  }
}

export async function evaluateRequirementWithFallback(
  requirementText: string,
  evidenceNeeded: string,
  submittedText: string,
  requirementId: string,
  useFallback: boolean = true
): Promise<RequirementEvaluation> {
  const systemPrompt = `You are a compliance evaluator. Determine if the submitted document satisfies a specific requirement.

For each requirement, evaluate:
1. status: PASS (fully satisfies), PARTIAL (some aspects), FAIL (does not satisfy), NOT_FOUND (requirement not addressed)
2. confidence: 0-1 score of your certainty
3. evidence: Exact text snippets from the submitted document that relate to this requirement
4. explanation: Brief explanation of your evaluation

Return ONLY a valid JSON object:
{
  "status": "PASS|PARTIAL|FAIL|NOT_FOUND",
  "confidence": 0.0-1.0,
  "evidence": "...",
  "explanation": "..."
}`;

  const userMessage = `Reference Requirement: ${requirementText}

Evidence Needed: ${evidenceNeeded}

Submitted Document Content:
${submittedText.substring(0, 12000)}

Evaluate if the submitted document satisfies the requirement above.`;

  try {
    const response = await invokeWithFallback(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      false
    );

    try {
      const parsed = JSON.parse(response.content);
      return {
        ...parsed,
        requirementId,
        confidence: parsed.confidence ?? 0.5,
      };
    } catch {
      console.error('Failed to parse evaluation:', response.content);
      return {
        requirementId,
        status: 'NOT_FOUND',
        confidence: 0,
        evidence: '',
        explanation: 'Failed to evaluate requirement',
      };
    }
  } catch (error) {
    if (useFallback) {
      console.warn('Bedrock failed for evaluateRequirement, trying OpenAI:', error);
      const result = await evaluateRequirementOpenAI(requirementText, evidenceNeeded, submittedText, requirementId);
      return {
        requirementId: result.requirementId,
        status: result.status,
        confidence: result.confidence,
        evidence: result.evidence,
        explanation: result.explanation,
      };
    }
    return {
      requirementId,
      status: 'NOT_FOUND',
      confidence: 0,
      evidence: '',
      explanation: 'Failed to evaluate requirement',
    };
  }
}

export async function generateSummaryWithFallback(
  evaluations: RequirementEvaluation[],
  fileName: string,
  useFallback: boolean = true
): Promise<string> {
  const systemPrompt = `You are a compliance reporting expert. Generate a summary of the evaluation results.

Create a concise summary that:
1. States overall compliance status
2. Highlights critical failures
3. Mentions key findings

Return ONLY a valid JSON object:
{
  "summary": "..."
}`;

  const evalSummary = evaluations.map(e => 
    `Requirement: ${e.requirementId}\nStatus: ${e.status}\nExplanation: ${e.explanation}`
  ).join('\n\n');

  const userMessage = `File evaluated: ${fileName}

Evaluation Results:
${evalSummary}

Generate a summary of these findings.`;

  try {
    const response = await invokeWithFallback(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      false
    );

    try {
      const parsed = JSON.parse(response.content);
      return parsed.summary || 'Evaluation complete.';
    } catch {
      return 'Evaluation complete.';
    }
  } catch (error) {
    if (useFallback) {
      console.warn('Bedrock failed for generateSummary, trying OpenAI:', error);
      const openAIEvals: RequirementEvaluationOpenAI[] = evaluations;
      return generateSummaryOpenAI(openAIEvals, fileName);
    }
    return 'Evaluation complete.';
  }
}
