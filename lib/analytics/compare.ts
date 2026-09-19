import { choiceDistribution, numericValues, scaleStats, type AnalyzableResponse } from '@/lib/analytics/aggregate';
import type { AnswerMap, SurveyQuestion } from '@/lib/types';

/**
 * Synthetic 결과 vs 실제 조사 결과 비교.
 *
 * 원칙: 차이를 보여주기만 하고 인과관계를 주장하지 않는다.
 */

export interface ChoiceComparisonRow {
  option: string;
  syntheticPercent: number;
  actualPercent: number;
  /** percentage point gap (synthetic - actual) */
  gapPp: number;
  syntheticRank: number;
  actualRank: number;
  rankDiff: number;
}

export interface ChoiceComparison {
  questionId: string;
  question: string;
  type: 'choice';
  syntheticN: number;
  actualN: number;
  rows: ChoiceComparisonRow[];
  /** 평균 절대 오차 (percentage point) */
  mae: number;
  /** 순위 상관 (Spearman) */
  spearman: number | null;
  topMatch: boolean;
}

export interface ScaleComparison {
  questionId: string;
  question: string;
  type: 'scale';
  syntheticN: number;
  actualN: number;
  syntheticMean: number;
  actualMean: number;
  meanDiff: number;
  syntheticSd: number;
  actualSd: number;
}

export type QuestionComparison = ChoiceComparison | ScaleComparison;

export interface ComparisonResult {
  generatedAt: string;
  syntheticSample: number;
  actualSample: number;
  comparisons: QuestionComparison[];
  /** 비교 불가한 문항 (주관식 등) */
  skipped: { questionId: string; reason: string }[];
}

/** Spearman 순위 상관계수. 동순위는 평균 순위로 처리. */
export function spearmanCorrelation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;

  const rank = (xs: number[]): number[] => {
    const idx = xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
    const ranks = new Array<number>(xs.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[idx[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  };

  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const meanA = ra.reduce((x, y) => x + y, 0) / n;
  const meanB = rb.reduce((x, y) => x + y, 0) / n;

  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - meanA) * (rb[i] - meanB);
    da += (ra[i] - meanA) ** 2;
    db += (rb[i] - meanB) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return Number((num / Math.sqrt(da * db)).toFixed(3));
}

export function meanAbsoluteError(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  const sum = a.reduce((acc, v, i) => acc + Math.abs(v - b[i]), 0);
  return Number((sum / a.length).toFixed(2));
}

/** 문항별 Synthetic vs Actual 비교 계산 */
export function compareResponses(
  questions: SurveyQuestion[],
  synthetic: AnalyzableResponse[],
  actual: { answers: AnswerMap }[]
): ComparisonResult {
  const comparisons: QuestionComparison[] = [];
  const skipped: { questionId: string; reason: string }[] = [];

  for (const q of questions) {
    if (q.type === 'open_text') {
      skipped.push({ questionId: q.id, reason: '주관식 문항은 비율 비교 대상이 아닙니다(키워드 비교를 사용하세요).' });
      continue;
    }

    if (q.type === 'scale_5' || q.type === 'number') {
      const s = scaleStats(numericValues(q, synthetic));
      const a = scaleStats(numericValues(q, actual));
      if (s.n === 0 || a.n === 0) {
        skipped.push({ questionId: q.id, reason: '두 조사 중 한쪽에 응답이 없습니다.' });
        continue;
      }
      comparisons.push({
        questionId: q.id,
        question: q.question,
        type: 'scale',
        syntheticN: s.n,
        actualN: a.n,
        syntheticMean: s.mean,
        actualMean: a.mean,
        meanDiff: Number((s.mean - a.mean).toFixed(2)),
        syntheticSd: s.sd,
        actualSd: a.sd,
      });
      continue;
    }

    const sDist = choiceDistribution(q, synthetic);
    const aDist = choiceDistribution(q, actual);
    if (sDist.total === 0 || aDist.total === 0) {
      skipped.push({ questionId: q.id, reason: '두 조사 중 한쪽에 응답이 없습니다.' });
      continue;
    }

    const options = [
      ...new Set([...(q.options ?? []), ...sDist.items.map((i) => i.option), ...aDist.items.map((i) => i.option)]),
    ];

    const sMap = new Map(sDist.items.map((i) => [i.option, i]));
    const aMap = new Map(aDist.items.map((i) => [i.option, i]));

    const rows: ChoiceComparisonRow[] = options.map((option) => {
      const s = sMap.get(option);
      const a = aMap.get(option);
      const sp = s?.percent ?? 0;
      const ap = a?.percent ?? 0;
      const sr = s?.rank ?? options.length;
      const ar = a?.rank ?? options.length;
      return {
        option,
        syntheticPercent: sp,
        actualPercent: ap,
        gapPp: Number((sp - ap).toFixed(1)),
        syntheticRank: sr,
        actualRank: ar,
        rankDiff: sr - ar,
      };
    });

    rows.sort((x, y) => y.syntheticPercent - x.syntheticPercent);

    const mae = meanAbsoluteError(
      rows.map((r) => r.syntheticPercent),
      rows.map((r) => r.actualPercent)
    );
    const spearman = spearmanCorrelation(
      rows.map((r) => r.syntheticPercent),
      rows.map((r) => r.actualPercent)
    );

    const sTop = sDist.items[0]?.option;
    const aTop = aDist.items[0]?.option;

    comparisons.push({
      questionId: q.id,
      question: q.question,
      type: 'choice',
      syntheticN: sDist.total,
      actualN: aDist.total,
      rows,
      mae,
      spearman,
      topMatch: Boolean(sTop && aTop && sTop === aTop),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    syntheticSample: synthetic.length,
    actualSample: actual.length,
    comparisons,
    skipped,
  };
}

/**
 * 리포트 해석 문구 자동 생성 (PRD 37장).
 * 규칙 기반으로 작성하여 LLM 이 과도한 인과관계를 주장하지 않도록 한다.
 */
export function buildNarrative(result: ComparisonResult): string {
  const lines: string[] = [];

  lines.push(
    `Synthetic 응답 ${result.syntheticSample}건과 실제 조사 응답 ${result.actualSample}건을 비교했습니다.`
  );

  for (const c of result.comparisons) {
    if (c.type === 'choice') {
      const sTop = [...c.rows].sort((a, b) => b.syntheticPercent - a.syntheticPercent)[0];
      const aTop = [...c.rows].sort((a, b) => b.actualPercent - a.actualPercent)[0];
      lines.push('');
      lines.push(`[${c.questionId}] ${c.question}`);
      lines.push(
        `Synthetic Survey 에서는 "${sTop.option}"(${sTop.syntheticPercent}%)이 가장 높았고, 실제 조사에서는 "${aTop.option}"(${aTop.actualPercent}%)이 가장 높았습니다.`
      );
      if (c.topMatch) {
        lines.push('두 조사의 1순위 선택지는 같았습니다.');
      } else {
        lines.push('두 조사의 1순위 선택지가 달라, Synthetic Survey 가 선호 순위를 그대로 재현했다고 보기는 어렵습니다.');
      }

      const close = c.rows.filter((r) => Math.abs(r.gapPp) <= 3).map((r) => r.option);
      if (close.length) {
        lines.push(`응답 비율이 비교적 유사한 항목(±3%p 이내): ${close.join(', ')}`);
      }
      const far = c.rows
        .filter((r) => Math.abs(r.gapPp) >= 10)
        .map((r) => `${r.option} (${r.gapPp > 0 ? '+' : ''}${r.gapPp}%p)`);
      if (far.length) {
        lines.push(`차이가 큰 항목(10%p 이상): ${far.join(', ')}`);
      }
      lines.push(`평균 절대 오차(MAE): ${c.mae}%p${c.spearman === null ? '' : ` · 순위 상관(Spearman): ${c.spearman}`}`);
    } else {
      lines.push('');
      lines.push(`[${c.questionId}] ${c.question}`);
      lines.push(
        `척도 평균은 Synthetic ${c.syntheticMean}점, 실제 조사 ${c.actualMean}점으로 차이는 ${c.meanDiff > 0 ? '+' : ''}${c.meanDiff}점입니다.`
      );
    }
  }

  if (result.skipped.length) {
    lines.push('');
    lines.push(`비율 비교에서 제외된 문항: ${result.skipped.map((s) => s.questionId).join(', ')}`);
  }

  lines.push('');
  lines.push(
    '이 비교 결과는 Synthetic Client 생성 변수와 프롬프트를 보완하기 위한 참고자료입니다. 차이의 원인을 단정할 수 없으며, 실제 이용자 조사 결과를 대체하지 않습니다.'
  );

  return lines.join('\n');
}
