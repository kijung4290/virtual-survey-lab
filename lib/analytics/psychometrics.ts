import type { AnswerMap, SurveyQuestion } from '@/lib/types';

/**
 * 척도 문항 점검 지표.
 *
 * 합성 응답으로 계산하므로 "이 척도는 타당하다"를 증명하지 못한다.
 * 대신 실제 조사 전에 다음과 같은 **구조적 결함**을 찾는 데 쓴다.
 *  - 다른 문항과 전혀 같이 움직이지 않는 문항(변별도 낮음)
 *  - 모두 같은 답만 나오는 문항(분산 0)
 *  - 천장·바닥 효과로 변별이 안 되는 문항
 *  - 역채점 처리가 꼬인 문항
 *  - 성의 없는 일괄 응답(straight-lining)이 쉽게 나오는 구조
 */

export interface ItemStat {
  questionId: string;
  question: string;
  reverse: boolean;
  n: number;
  mean: number;
  sd: number;
  /** 최댓값(5점)에 몰린 비율 */
  ceilingPercent: number;
  /** 최솟값(1점)에 몰린 비율 */
  floorPercent: number;
  /** 수정된 문항-총점 상관 (이 문항을 뺀 나머지 총점과의 상관) */
  itemTotal: number | null;
  /** 이 문항을 빼면 알파가 얼마가 되는지 */
  alphaIfDeleted: number | null;
  zeroVariance: boolean;
  warnings: string[];
}

export interface ConstructReliability {
  construct: string;
  itemCount: number;
  /** 모든 문항에 답한 응답자 수 (listwise) */
  n: number;
  alpha: number | null;
  items: ItemStat[];
  interItem: { a: string; b: string; r: number }[];
  warnings: string[];
}

export interface ConsistencyReport {
  /** 척도 문항에 전부 같은 값을 답한 응답자 */
  straightLining: { count: number; percent: number };
  /** 같은 묶음인데 음의 상관이 나온 문항 쌍(역채점 처리 확인 필요) */
  contradictions: { construct: string; a: string; b: string; r: number; message: string }[];
  /** 상위 2개 보기(4~5점)에 쏠린 문항 — 사회적 바람직성 편향 의심 */
  topBoxSkew: { questionId: string; question: string; topBoxPercent: number }[];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 표본분산 (n-1) */
export function variance(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  return values.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
}

export function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return Number((num / Math.sqrt(da * db)).toFixed(3));
}

/**
 * Cronbach's α
 * columns[i] = 문항 i 에 대한 모든 응답자의 점수(같은 순서)
 */
export function cronbachAlpha(columns: number[][]): number | null {
  const k = columns.length;
  if (k < 2) return null;
  const n = columns[0]?.length ?? 0;
  if (n < 3) return null;
  if (columns.some((c) => c.length !== n)) return null;

  const itemVarSum = columns.reduce((acc, c) => acc + variance(c), 0);
  const totals = Array.from({ length: n }, (_, r) => columns.reduce((acc, c) => acc + c[r], 0));
  const totalVar = variance(totals);
  if (totalVar === 0) return null;

  const alpha = (k / (k - 1)) * (1 - itemVarSum / totalVar);
  return Number(alpha.toFixed(3));
}

/** 역채점 문항 점수를 뒤집는다 (5점 척도: 6 - x) */
export function scoreOf(q: SurveyQuestion, raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;

  if (!q.reverse) return n;

  if (q.type === 'scale_5') return 6 - n;
  const min = q.min ?? 0;
  const max = q.max ?? 10;
  return max + min - n;
}

function alphaLabel(alpha: number | null): string | null {
  if (alpha === null) return null;
  if (alpha >= 0.9) return '문항이 지나치게 비슷할 수 있습니다(중복 문항 확인).';
  if (alpha >= 0.7) return null;
  if (alpha >= 0.6) return '내적 일관성이 낮은 편입니다. 문항 표현을 다듬어보세요.';
  return '내적 일관성이 매우 낮습니다. 같은 개념을 재지 않는 문항이 섞였을 수 있습니다.';
}

/** 척도 묶음별 신뢰도·문항 변별도 계산 */
export function analyzeConstructs(
  questions: SurveyQuestion[],
  responses: { answers: AnswerMap }[]
): ConstructReliability[] {
  const groups = new Map<string, SurveyQuestion[]>();
  for (const q of questions) {
    if (!q.construct) continue;
    if (q.type !== 'scale_5' && q.type !== 'number') continue;
    const list = groups.get(q.construct) ?? [];
    list.push(q);
    groups.set(q.construct, list);
  }

  const result: ConstructReliability[] = [];

  for (const [construct, items] of groups) {
    // 묶음 내 모든 문항에 답한 응답자만 사용(listwise)
    const rows: number[][] = [];
    for (const r of responses) {
      const scores = items.map((q) => scoreOf(q, r.answers[q.id]));
      if (scores.some((v) => v === null)) continue;
      rows.push(scores as number[]);
    }

    const n = rows.length;
    const columns = items.map((_, i) => rows.map((row) => row[i]));
    const alpha = cronbachAlpha(columns);

    const hasReverseItem = items.some((x) => x.reverse);

    const itemStats: ItemStat[] = items.map((q, i) => {
      const values = columns[i] ?? [];
      const v = variance(values);
      const sd = Math.sqrt(v);
      const maxScore = q.type === 'scale_5' ? 5 : (q.max ?? 10);
      const minScore = q.type === 'scale_5' ? 1 : (q.min ?? 0);

      // 수정된 문항-총점 상관: 자기 자신을 제외한 나머지 합계와의 상관
      const rest = rows.map((row) => row.reduce((acc, x, j) => (j === i ? acc : acc + x), 0));
      const itemTotal = values.length >= 3 ? pearson(values, rest) : null;

      // 이 문항을 뺐을 때의 알파
      const without = columns.filter((_, j) => j !== i);
      const alphaIfDeleted = without.length >= 2 ? cronbachAlpha(without) : null;

      const warnings: string[] = [];
      if (v === 0 && values.length > 0) {
        warnings.push('모든 응답이 같은 값입니다. 변별이 전혀 되지 않습니다.');
      }
      if (itemTotal !== null && itemTotal < 0.3) {
        if (itemTotal < 0 && hasReverseItem && !q.reverse) {
          warnings.push('다른 문항과 반대로 움직입니다(변별도 낮음). 역채점 표시가 빠지지 않았는지 확인하세요.');
        } else if (itemTotal < 0) {
          warnings.push('다른 문항과 반대로 움직입니다(변별도 낮음). 같은 개념을 재는 문항이 맞는지 확인하세요.');
        } else {
          warnings.push('다른 문항과 거의 같이 움직이지 않습니다(변별도 낮음).');
        }
      }
      if (alpha !== null && alphaIfDeleted !== null && alphaIfDeleted > alpha + 0.05) {
        warnings.push(`이 문항을 빼면 α 가 ${alpha} → ${alphaIfDeleted} 로 올라갑니다.`);
      }

      const ceiling = values.length ? (values.filter((x) => x >= maxScore).length / values.length) * 100 : 0;
      const floor = values.length ? (values.filter((x) => x <= minScore).length / values.length) * 100 : 0;
      if (ceiling >= 80) warnings.push(`${Math.round(ceiling)}% 가 최고점에 몰려 있습니다(천장 효과).`);
      if (floor >= 80) warnings.push(`${Math.round(floor)}% 가 최저점에 몰려 있습니다(바닥 효과).`);

      return {
        questionId: q.id,
        question: q.question,
        reverse: Boolean(q.reverse),
        n: values.length,
        mean: Number(mean(values).toFixed(2)),
        sd: Number(sd.toFixed(2)),
        ceilingPercent: Number(ceiling.toFixed(1)),
        floorPercent: Number(floor.toFixed(1)),
        itemTotal,
        alphaIfDeleted,
        zeroVariance: v === 0,
        warnings,
      };
    });

    const interItem: { a: string; b: string; r: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const r = pearson(columns[i] ?? [], columns[j] ?? []);
        if (r !== null) interItem.push({ a: items[i].id, b: items[j].id, r });
      }
    }

    const warnings: string[] = [];
    if (items.length < 3) warnings.push('문항이 3개 미만이라 α 값이 불안정합니다.');
    if (n < 30) warnings.push(`계산에 사용된 응답이 ${n}건입니다. 해석은 참고용으로만 보세요.`);
    const label = alphaLabel(alpha);
    if (label) warnings.push(label);

    result.push({ construct, itemCount: items.length, n, alpha, items: itemStats, interItem, warnings });
  }

  return result;
}

/** 응답 일관성 점검 (역문항 처리, 일괄 응답, 쏠림) */
export function analyzeConsistency(
  questions: SurveyQuestion[],
  responses: { answers: AnswerMap }[]
): ConsistencyReport {
  const scaleItems = questions.filter((q) => q.type === 'scale_5');

  // 1) 일괄 응답 (척도 문항 3개 이상에 전부 같은 값)
  let straight = 0;
  let evaluated = 0;
  if (scaleItems.length >= 3) {
    for (const r of responses) {
      const raw = scaleItems.map((q) => r.answers[q.id]).filter((v) => typeof v === 'number') as number[];
      if (raw.length < 3) continue;
      evaluated += 1;
      if (new Set(raw).size === 1) straight += 1;
    }
  }

  // 2) 같은 묶음 안에서 음의 상관 (역채점 처리 후에도 반대로 움직이는 문항)
  const contradictions: ConsistencyReport['contradictions'] = [];
  for (const c of analyzeConstructs(questions, responses)) {
    for (const pair of c.interItem) {
      if (pair.r <= -0.2) {
        contradictions.push({
          construct: c.construct,
          a: pair.a,
          b: pair.b,
          r: pair.r,
          message: `같은 개념을 잰다고 묶었지만 서로 반대로 움직입니다(r=${pair.r}). 역채점 표시가 빠졌거나 다른 개념일 수 있습니다.`,
        });
      }
    }
  }

  // 3) 상위 2개 보기 쏠림 (사회적 바람직성 편향 의심)
  const topBoxSkew: ConsistencyReport['topBoxSkew'] = [];
  for (const q of scaleItems) {
    const values = responses
      .map((r) => r.answers[q.id])
      .filter((v): v is number => typeof v === 'number');
    if (values.length < 5) continue;
    const topBox = (values.filter((v) => v >= 4).length / values.length) * 100;
    if (topBox >= 80) {
      topBoxSkew.push({
        questionId: q.id,
        question: q.question,
        topBoxPercent: Number(topBox.toFixed(1)),
      });
    }
  }

  return {
    straightLining: {
      count: straight,
      percent: evaluated ? Number(((straight / evaluated) * 100).toFixed(1)) : 0,
    },
    contradictions,
    topBoxSkew,
  };
}
