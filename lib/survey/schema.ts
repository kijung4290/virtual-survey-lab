import { z } from 'zod';
import {
  DEFAULT_SCALE_LABELS,
  QUESTION_TYPES,
  type AnswerMap,
  type AnswerValue,
  type SurveyQuestion,
} from '@/lib/types';

/** 설문 문항 정의 스키마 (설문지 저장 시 검증) */
export const questionConditionSchema = z.object({
  questionId: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'lte', 'gte', 'includes']),
  value: z.union([z.string(), z.number()]),
});

export const surveyQuestionSchema = z
  .object({
    id: z
      .string()
      .min(1, '문항 ID 는 비워둘 수 없습니다.')
      .regex(/^[A-Za-z0-9_-]+$/, '문항 ID 는 영문/숫자/_/- 만 사용할 수 있습니다.'),
    type: z.enum(QUESTION_TYPES),
    question: z.string().min(1, '문항 내용을 입력하세요.'),
    helpText: z.string().optional(),
    options: z.array(z.string().min(1)).optional(),
    maxSelections: z.number().int().positive().optional(),
    scaleLabels: z.array(z.string()).length(5).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().optional(),
    required: z.boolean().optional(),
    condition: questionConditionSchema.optional(),
  })
  .superRefine((q, ctx) => {
    if ((q.type === 'single_choice' || q.type === 'multi_choice') && (!q.options || q.options.length < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `[${q.id}] 선택형 문항은 선택지가 2개 이상 필요합니다.`,
      });
    }
    if (q.type === 'multi_choice' && q.maxSelections && q.options && q.maxSelections > q.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `[${q.id}] 최대 선택 개수가 선택지 수보다 많습니다.`,
      });
    }
    if (q.type === 'number' && q.min !== undefined && q.max !== undefined && q.min > q.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `[${q.id}] 최솟값이 최댓값보다 큽니다.` });
    }
  });

export const surveyQuestionsSchema = z.array(surveyQuestionSchema);

export interface SurveyValidationResult {
  ok: boolean;
  errors: string[];
  questions: SurveyQuestion[];
}

/** 설문 전체(문항 배열)를 검증한다. 문항 ID 중복/조건 참조 오류까지 확인. */
export function validateSurveyQuestions(input: unknown): SurveyValidationResult {
  const parsed = surveyQuestionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message), questions: [] };
  }

  const questions = parsed.data as SurveyQuestion[];
  const errors: string[] = [];

  if (questions.length === 0) errors.push('문항이 최소 1개 필요합니다.');

  const seen = new Set<string>();
  questions.forEach((q, idx) => {
    if (seen.has(q.id)) errors.push(`문항 ID 가 중복되었습니다: ${q.id}`);
    seen.add(q.id);

    if (q.condition) {
      const targetIdx = questions.findIndex((x) => x.id === q.condition!.questionId);
      if (targetIdx === -1) {
        errors.push(`[${q.id}] 조건에서 참조하는 문항(${q.condition.questionId})이 없습니다.`);
      } else if (targetIdx >= idx) {
        errors.push(`[${q.id}] 조건은 앞 순서의 문항만 참조할 수 있습니다.`);
      }
    }
  });

  return { ok: errors.length === 0, errors, questions };
}

/** 조건부 문항 표시 여부 판단 */
export function isQuestionVisible(question: SurveyQuestion, answers: AnswerMap): boolean {
  const cond = question.condition;
  if (!cond) return true;

  const target = answers[cond.questionId];
  if (target === undefined || target === null) return false;

  switch (cond.operator) {
    case 'eq':
      return String(target) === String(cond.value);
    case 'neq':
      return String(target) !== String(cond.value);
    case 'lte':
      return Number(target) <= Number(cond.value);
    case 'gte':
      return Number(target) >= Number(cond.value);
    case 'includes':
      if (Array.isArray(target)) return target.map(String).includes(String(cond.value));
      return String(target).includes(String(cond.value));
    default:
      return true;
  }
}

/** 조건을 적용해 실제로 응답해야 하는 문항만 남긴다. */
export function visibleQuestions(questions: SurveyQuestion[], answers: AnswerMap): SurveyQuestion[] {
  return questions.filter((q) => isQuestionVisible(q, answers));
}

export function scaleLabelsOf(q: SurveyQuestion): string[] {
  return q.scaleLabels && q.scaleLabels.length === 5 ? q.scaleLabels : DEFAULT_SCALE_LABELS;
}

/** LLM 에게 전달할 응답 JSON Schema(설명용). 구조화 응답 강제에 사용한다. */
export function buildAnswerJsonSchema(questions: SurveyQuestion[]) {
  const properties: Record<string, unknown> = {};
  for (const q of questions) {
    switch (q.type) {
      case 'single_choice':
        properties[q.id] = { type: 'string', enum: q.options ?? [] };
        break;
      case 'multi_choice':
        properties[q.id] = {
          type: 'array',
          items: { type: 'string', enum: q.options ?? [] },
          maxItems: q.maxSelections ?? q.options?.length ?? 3,
        };
        break;
      case 'scale_5':
        properties[q.id] = { type: 'integer', minimum: 1, maximum: 5 };
        break;
      case 'number':
        properties[q.id] = {
          type: 'number',
          ...(q.min !== undefined ? { minimum: q.min } : {}),
          ...(q.max !== undefined ? { maximum: q.max } : {}),
        };
        break;
      case 'open_text':
        properties[q.id] = { type: 'string', minLength: 1 };
        break;
    }
  }

  return {
    type: 'object',
    required: ['respondent_id', 'answers'],
    properties: {
      respondent_id: { type: 'string' },
      answers: {
        type: 'array',
        items: {
          type: 'object',
          required: ['question_id', 'value'],
          properties: {
            question_id: { type: 'string', enum: questions.map((q) => q.id) },
            value: { description: '문항 유형에 맞는 값', ...{} },
          },
        },
      },
    },
    /** 참고용: 문항별 기대 값 형태 */
    'x-answer-shapes': properties,
  };
}

/** 문항 유형에 맞게 값을 정규화한다. 변환 불가하면 null. */
export function coerceAnswer(q: SurveyQuestion, raw: unknown): AnswerValue {
  if (raw === null || raw === undefined) return null;

  switch (q.type) {
    case 'single_choice': {
      const s = String(raw).trim();
      if (!q.options) return s;
      const exact = q.options.find((o) => o === s);
      if (exact) return exact;
      const loose = q.options.find(
        (o) => o.replace(/\s/g, '') === s.replace(/\s/g, '') || s.includes(o) || o.includes(s)
      );
      return loose ?? null;
    }
    case 'multi_choice': {
      const arr = Array.isArray(raw)
        ? raw
        : String(raw)
            .split(/[,|;·]/)
            .map((s) => s.trim())
            .filter(Boolean);
      const mapped = arr
        .map((v) => {
          const s = String(v).trim();
          if (!q.options) return s;
          return (
            q.options.find((o) => o === s) ??
            q.options.find((o) => o.replace(/\s/g, '') === s.replace(/\s/g, '')) ??
            null
          );
        })
        .filter((v): v is string => Boolean(v));
      const unique = [...new Set(mapped)];
      if (unique.length === 0) return null;
      const limit = q.maxSelections ?? unique.length;
      return unique.slice(0, limit);
    }
    case 'scale_5': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(n)) return null;
      const r = Math.round(n);
      return r >= 1 && r <= 5 ? r : null;
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(n)) return null;
      if (q.min !== undefined && n < q.min) return q.min;
      if (q.max !== undefined && n > q.max) return q.max;
      return n;
    }
    case 'open_text': {
      const s = String(raw).trim();
      return s.length > 0 ? s : null;
    }
    default:
      return null;
  }
}
