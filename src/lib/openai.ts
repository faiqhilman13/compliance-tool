import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const MODEL_NAME = 'gpt-4o';
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.1;

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenAIResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function invokeOpenAI(
  messages: OpenAIMessage[],
  systemPrompt?: string
): Promise<OpenAIResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    formattedMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    formattedMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: formattedMessages,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });

  const content = response.choices[0]?.message?.content || '';

  return {
    content,
    usage: response.usage ? {
      inputTokens: response.usage.prompt_tokens || 0,
      outputTokens: response.usage.completion_tokens || 0,
    } : undefined,
  };
}

function parseJsonFromMarkdown(content: string): any {
  // Remove markdown code fences (```json ... ``` or ``` ... ```)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // Fall through to try parsing as raw
    }
  }
  // Try parsing as raw JSON
  try {
    return JSON.parse(content.trim());
  } catch {
    throw new Error('Failed to parse JSON');
  }
}

export async function extractRequirementsOpenAI(
  documentText: string
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

  const response = await invokeOpenAI(
    [{ role: 'user', content: userMessage }],
    systemPrompt
  );

  try {
    const parsed = parseJsonFromMarkdown(response.content);
    return parsed;
  } catch {
    console.error('Failed to parse requirements:', response.content);
    return { requirements: [] };
  }
}

export interface RequirementEvaluationOpenAI {
  requirementId: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_FOUND';
  confidence: number;
  evidence: string;
  explanation: string;
}

export async function evaluateRequirementOpenAI(
  requirementText: string,
  evidenceNeeded: string,
  submittedText: string,
  requirementId: string
): Promise<RequirementEvaluationOpenAI> {
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

  const response = await invokeOpenAI(
    [{ role: 'user', content: userMessage }],
    systemPrompt
  );

  try {
    const parsed = parseJsonFromMarkdown(response.content);
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
}

export async function generateSummaryOpenAI(
  evaluations: RequirementEvaluationOpenAI[],
  fileName: string
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

  const response = await invokeOpenAI(
    [{ role: 'user', content: userMessage }],
    systemPrompt
  );

  try {
    const parsed = parseJsonFromMarkdown(response.content);
    return parsed.summary || 'Evaluation complete.';
  } catch {
    return 'Evaluation complete.';
  }
}
