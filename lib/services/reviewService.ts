import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getProvider } from '@/lib/ai';
import { REVIEW_PROMPT_VERSION, REVIEW_SYSTEM_PROMPT, buildReviewPrompt } from '@/lib/ai/prompts/reviewPrompt';
import { extractJsonObject } from '@/lib/ai/schemas/response';
import { REVIEW_TYPES, reviewSurvey, type ReviewFinding, type ReviewResult } from '@/lib/survey/review';
import { getSurvey } from '@/lib/services/surveyService';
import { safeParseJSON } from '@/lib/utils';

/**
 * 설문지 사전점검 - 문항 표현 검토.
 *
 * - rule: 규칙 기반(무료, 항상 같은 결과). API 키가 없어도 동작한다.
 * - ai: 모델이 문항 문장을 읽고 보완 지적을 추가한다(설문 1개당 호출 1회).
 */

const aiReviewSchema = z.object({
  findings: z
    .array(
      z.object({
        question_id: z.union([z.string(), z.null()]).optional(),
        type: z.string().optional(),
        severity: z.string().optional(),
        message: z.string(),
        suggestion: z.union([z.string(), z.null()]).optional(),
      })
    )
    .default([]),
  summary: z.string().optional(),
});

export interface StoredReview {
  id: string;
  source: 'rule' | 'ai';
  modelProvider: string | null;
  modelName: string | null;
  surveyVersion: number;
  createdAt: Date;
  result: ReviewResult & { summary?: string };
}

function normalizeSeverity(value: unknown): ReviewFinding['severity'] {
  const s = String(value ?? '').toLowerCase();
  if (s === 'high' || s === '높음') return 'high';
  if (s === 'low' || s === '낮음') return 'low';
  return 'medium';
}

function normalizeType(value: unknown): ReviewFinding['type'] {
  const s = String(value ?? '');
  return (s in REVIEW_TYPES ? s : 'ambiguous') as ReviewFinding['type'];
}

/**
 * 모델 원문 → 검토 결과.
 * 모델이 없는 문항 ID 나 낯선 유형·심각도를 내놓아도 안전한 값으로 정규화한다.
 */
export function parseAiReview(rawText: string, questionIds: string[]): ReviewResult & { summary?: string } {
  const json = extractJsonObject(rawText);
  const parsed = aiReviewSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('모델이 올바른 형식으로 답하지 않았습니다. 다시 시도해보세요.');
  }

  const validIds = new Set(questionIds);
  const findings: ReviewFinding[] = parsed.data.findings
    .filter((f) => f.message.trim().length > 0)
    .map((f) => ({
      questionId: f.question_id && validIds.has(f.question_id) ? f.question_id : null,
      type: normalizeType(f.type),
      severity: normalizeSeverity(f.severity),
      message: f.message.trim(),
      suggestion: (f.suggestion ?? '').trim() || '개선 방향을 직접 판단해 반영하세요.',
    }));

  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return {
    findings,
    counts,
    checkedQuestions: questionIds.length,
    summary: parsed.data.summary?.trim(),
  };
}

/** 규칙 기반 검토 실행 후 저장 */
export async function runRuleReview(projectId: string, surveyId: string) {
  const survey = await getSurvey(surveyId);
  if (!survey) throw new Error('설문지를 찾을 수 없습니다.');

  const result = reviewSurvey(survey.questions);

  const row = await prisma.surveyReview.create({
    data: {
      projectId,
      surveyId,
      surveyVersion: survey.version,
      source: 'rule',
      result: JSON.stringify(result),
    },
  });

  return { id: row.id, result };
}

/** AI 보강 검토 실행 후 저장 (호출 1회) */
export async function runAiReview(
  projectId: string,
  surveyId: string,
  options: { provider: string; model: string; temperature?: number; targetPopulation?: string | null }
) {
  const survey = await getSurvey(surveyId);
  if (!survey) throw new Error('설문지를 찾을 수 없습니다.');

  const provider = getProvider(options.provider);
  if (!provider.isReady()) {
    throw new Error(`${provider.label} 는 API Key 가 없어 사용할 수 없습니다. 규칙 기반 검토만 이용하세요.`);
  }
  if (!provider.generateText) {
    throw new Error(`${provider.label} 는 문항 검토를 지원하지 않습니다. 다른 Provider 를 선택하세요.`);
  }

  const raw = await provider.generateText({
    systemPrompt: REVIEW_SYSTEM_PROMPT,
    userPrompt: buildReviewPrompt(survey.name, survey.questions, options.targetPopulation),
    model: options.model,
    temperature: options.temperature ?? 0.2,
  });

  const result = parseAiReview(
    raw.text,
    survey.questions.map((q) => q.id)
  );

  const row = await prisma.surveyReview.create({
    data: {
      projectId,
      surveyId,
      surveyVersion: survey.version,
      source: 'ai',
      modelProvider: options.provider,
      modelName: raw.model || options.model,
      result: JSON.stringify({ ...result, promptVersion: REVIEW_PROMPT_VERSION }),
    },
  });

  return { id: row.id, result, latencyMs: raw.latencyMs };
}

/** 설문지의 최근 검토 결과 (source 별 최신 1건) */
export async function latestReviews(surveyId: string): Promise<StoredReview[]> {
  const rows = await prisma.surveyReview.findMany({
    where: { surveyId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const seen = new Set<string>();
  const out: StoredReview[] = [];
  for (const row of rows) {
    if (seen.has(row.source)) continue;
    seen.add(row.source);
    out.push({
      id: row.id,
      source: row.source as 'rule' | 'ai',
      modelProvider: row.modelProvider,
      modelName: row.modelName,
      surveyVersion: row.surveyVersion,
      createdAt: row.createdAt,
      result: safeParseJSON(row.result, {
        findings: [],
        counts: { high: 0, medium: 0, low: 0 },
        checkedQuestions: 0,
      }),
    });
  }
  return out;
}
