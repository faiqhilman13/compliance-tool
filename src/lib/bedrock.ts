import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  } : undefined,
});

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
const MAX_TOKENS = parseInt(process.env.BEDROCK_MAX_TOKENS || '4096');
const TEMPERATURE = parseFloat(process.env.BEDROCK_TEMPERATURE || '0.1');

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function invokeClaude(
  messages: BedrockMessage[],
  systemPrompt?: string
): Promise<BedrockResponse> {
  const formattedMessages = messages.map(msg => ({
    type: 'text' as const,
    text: msg.content,
    ...(msg.role === 'assistant' ? { source: { type: 'text' as const, leader: 'A' } } : {}),
  }));

  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      ...(systemPrompt ? [{ role: 'user' as const, content: systemPrompt }] : []),
      ...messages,
    ],
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  if (responseBody.type === 'error') {
    throw new Error(`Bedrock error: ${responseBody.error.message}`);
  }

  const content = responseBody.content?.[0]?.text || '';
  
  return {
    content,
    usage: responseBody.usage ? {
      inputTokens: responseBody.usage.input_tokens,
      outputTokens: responseBody.usage.output_tokens,
    } : undefined,
  };
}

export async function extractRequirements(
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

  const response = await invokeClaude(
    [{ role: 'user', content: userMessage }],
    systemPrompt
  );

  try {
    const parsed = JSON.parse(response.content);
    return parsed;
  } catch {
    console.error('Failed to parse requirements:', response.content);
    return { requirements: [] };
  }
}

export interface RequirementEvaluation {
  requirementId: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_FOUND';
  confidence: number;
  evidence: string;
  explanation: string;
}

export async function evaluateRequirement(
  requirementText: string,
  evidenceNeeded: string,
  submittedText: string,
  requirementId: string
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

  const response = await invokeClaude(
    [{ role: 'user', content: userMessage }],
    systemPrompt
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
}

export async function generateSummary(
  evaluations: RequirementEvaluation[],
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

  const response = await invokeClaude(
    [{ role: 'user', content: userMessage }],
    systemPrompt
  );

  try {
    const parsed = JSON.parse(response.content);
    return parsed.summary || 'Evaluation complete.';
  } catch {
    return 'Evaluation complete.';
  }
}
