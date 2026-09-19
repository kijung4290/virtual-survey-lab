import { z } from 'zod';
import { coerceAnswer, isQuestionVisible } from '@/lib/survey/schema';
import type { AnswerMap, SurveyQuestion } from '@/lib/types';

/** LLM 이 반환해야 하는 최소 구조 */
export const llmAnswerSchema = z.object({
  respondent_id: z.string().optional(),
  answers: z.array(
    z.object({
      question_id: z.string(),
      value: z.union([z.string(), z.number(), z.array(z.string()), z.null()]),
    })
  ),
});

export type LLMAnswerPayload = z.infer<typeof llmAnswerSchema>;

/** 코드펜스/앞뒤 설명이 섞여 있어도 첫 JSON 객체를 뽑아낸다. */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fence ? fence[1] : null, trimmed].filter(Boolean) as string[];

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // 계속 진행
    }
  }

  // 중괄호 균형을 맞춰 첫 객체를 잘라낸다.
  const start = trimmed.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface ValidationOutcome {
  ok: boolean;
  answers: AnswerMap;
  /** 검증 실패 사유(재시도 힌트로 사용) */
  errors: string[];
}

/**
 * LLM 원문 → 문항 스키마에 맞는 AnswerMap.
 * - 조건부 문항은 조건을 만족할 때만 필수로 본다.
 * - 값이 보기와 달라도 근접 매칭으로 교정하고, 불가하면 오류로 남긴다.
 */
export function validateLLMResponse(rawText: string, questions: SurveyQuestion[]): ValidationOutcome {
  const json = extractJsonObject(rawText);
  if (json === null) {
    return { ok: false, answers: {}, errors: ['JSON 을 찾을 수 없습니다. JSON 객체만 출력해야 합니다.'] };
  }

  const parsed = llmAnswerSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      answers: {},
      errors: ['응답 구조가 올바르지 않습니다: ' + parsed.error.issues.map((i) => i.message).join(', ')],
    };
  }

  const byId = new Map(parsed.data.answers.map((a) => [a.question_id, a.value]));
  const answers: AnswerMap = {};
  const errors: string[] = [];

  for (const q of questions) {
    // 앞 문항 응답을 반영해 이 문항이 필요한지 판단
    if (!isQuestionVisible(q, answers)) continue;

    const raw = byId.get(q.id);
    if (raw === undefined || raw === null) {
      errors.push(`${q.id} 문항의 응답이 없습니다.`);
      continue;
    }

    const value = coerceAnswer(q, raw);
    if (value === null) {
      errors.push(`${q.id} 문항의 값(${JSON.stringify(raw)})이 허용된 형식/보기와 맞지 않습니다.`);
      continue;
    }
    answers[q.id] = value;
  }

  return { ok: errors.length === 0, answers, errors };
}
