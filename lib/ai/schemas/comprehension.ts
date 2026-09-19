import { z } from 'zod';
import { extractJsonObject } from '@/lib/ai/schemas/response';
import type { SurveyQuestion } from '@/lib/types';

/** 문항 이해도 점검 응답 */
export interface ComprehensionItem {
  restated: string;
  /** 1(아주 쉬움) ~ 5(아주 어려움) */
  difficulty: number;
  hardWords: string[];
}

export type ComprehensionMap = Record<string, ComprehensionItem>;

export const comprehensionSchema = z.object({
  respondent_id: z.string().optional(),
  items: z.array(
    z.object({
      question_id: z.string(),
      restated: z.union([z.string(), z.null()]).optional(),
      difficulty: z.union([z.number(), z.string(), z.null()]).optional(),
      hard_words: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
    })
  ),
});

export interface ComprehensionOutcome {
  ok: boolean;
  items: ComprehensionMap;
  errors: string[];
}

function toDifficulty(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

function toHardWords(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/[,、·]/)
      .map((s) => s.trim())
      .filter((s) => s && s !== '없음' && s !== '없습니다');
  }
  return [];
}

/** 모델 원문 → 문항별 이해도 결과 */
export function validateComprehensionResponse(
  rawText: string,
  questions: SurveyQuestion[]
): ComprehensionOutcome {
  const json = extractJsonObject(rawText);
  if (json === null) {
    return { ok: false, items: {}, errors: ['JSON 을 찾을 수 없습니다. JSON 객체만 출력해야 합니다.'] };
  }

  const parsed = comprehensionSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      items: {},
      errors: ['응답 구조가 올바르지 않습니다: ' + parsed.error.issues.map((i) => i.message).join(', ')],
    };
  }

  const byId = new Map(parsed.data.items.map((i) => [i.question_id, i]));
  const items: ComprehensionMap = {};
  const errors: string[] = [];

  for (const q of questions) {
    const raw = byId.get(q.id);
    if (!raw) {
      errors.push(`${q.id} 문항에 대한 응답이 없습니다.`);
      continue;
    }

    const restated = String(raw.restated ?? '').trim();
    const difficulty = toDifficulty(raw.difficulty);

    if (!restated) {
      errors.push(`${q.id} 문항의 restated(이해한 내용)가 비어 있습니다.`);
      continue;
    }
    if (difficulty === null) {
      errors.push(`${q.id} 문항의 difficulty 가 1~5 정수가 아닙니다.`);
      continue;
    }

    items[q.id] = { restated, difficulty, hardWords: toHardWords(raw.hard_words) };
  }

  return { ok: errors.length === 0, items, errors };
}
