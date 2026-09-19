import { AGE_BANDS, type AnswerMap, type AnswerValue, type PlainClient, type SurveyQuestion } from '@/lib/types';
import { pct } from '@/lib/utils';

/** 분석 입력: 응답 1건 + 응답자(세그먼트용) */
export interface AnalyzableResponse {
  clientId: string;
  localId: string;
  status: string;
  answers: AnswerMap;
  client?: PlainClient | null;
}

export interface OptionShare {
  option: string;
  count: number;
  percent: number;
  rank: number;
}

/** 선택형 문항의 응답 분포. 복수선택은 응답자 수 기준 비율(중복 선택 허용). */
export function choiceDistribution(
  question: SurveyQuestion,
  responses: { answers: AnswerMap }[]
): { total: number; items: OptionShare[] } {
  const counts = new Map<string, number>();
  for (const opt of question.options ?? []) counts.set(opt, 0);

  let total = 0;
  for (const r of responses) {
    const v = r.answers[question.id];
    if (v === undefined || v === null) continue;
    total += 1;
    const values = Array.isArray(v) ? v : [v];
    for (const one of values) {
      const key = String(one);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const items = [...counts.entries()]
    .map(([option, count]) => ({ option, count, percent: pct(count, total), rank: 0 }))
    .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option));

  items.forEach((item, i) => {
    item.rank = i + 1;
  });

  return { total, items };
}

export interface ScaleStats {
  n: number;
  mean: number;
  median: number;
  sd: number;
  /** 1~5 응답 수 */
  distribution: { value: number; count: number; percent: number }[];
}

export function scaleStats(values: number[]): ScaleStats {
  const nums = values.filter((v) => Number.isFinite(v));
  const n = nums.length;
  if (n === 0) {
    return {
      n: 0,
      mean: 0,
      median: 0,
      sd: 0,
      distribution: [1, 2, 3, 4, 5].map((value) => ({ value, count: 0, percent: 0 })),
    };
  }

  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const sorted = [...nums].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;

  const distribution = [1, 2, 3, 4, 5].map((value) => {
    const count = nums.filter((v) => Math.round(v) === value).length;
    return { value, count, percent: pct(count, n) };
  });

  return {
    n,
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    sd: Number(Math.sqrt(variance).toFixed(2)),
    distribution,
  };
}

export function numericValues(question: SurveyQuestion, responses: { answers: AnswerMap }[]): number[] {
  const out: number[] = [];
  for (const r of responses) {
    const v = r.answers[question.id];
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) out.push(Number(v));
  }
  return out;
}

/** 세그먼트 값(연령은 구간으로 묶는다) */
export function segmentValue(client: PlainClient | null | undefined, field: string): string {
  if (!client) return '(정보 없음)';
  if (field === 'age') {
    const age = client.age;
    if (age === null || age === undefined) return '(정보 없음)';
    const band = AGE_BANDS.find((b) => age >= b.min && age <= b.max);
    return band ? band.label : '(정보 없음)';
  }
  const raw = (client as unknown as Record<string, unknown>)[field];
  if (raw === null || raw === undefined || raw === '') return '(정보 없음)';
  if (Array.isArray(raw)) return raw.length ? raw.join(', ') : '(정보 없음)';
  return String(raw);
}

export interface SegmentRow {
  segment: string;
  total: number;
  /** 선택형: 보기별 비율 / 척도형: 평균 */
  shares: Record<string, number>;
  mean?: number;
}

/** 세그먼트별 교차 분석 */
export function segmentBreakdown(
  question: SurveyQuestion,
  responses: AnalyzableResponse[],
  field: string
): { segments: string[]; rows: SegmentRow[] } {
  const groups = new Map<string, AnalyzableResponse[]>();
  for (const r of responses) {
    const key = segmentValue(r.client, field);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const rows: SegmentRow[] = [];
  for (const [segment, list] of groups) {
    if (question.type === 'scale_5' || question.type === 'number') {
      const stats = scaleStats(numericValues(question, list));
      rows.push({ segment, total: stats.n, shares: {}, mean: stats.mean });
    } else {
      const dist = choiceDistribution(question, list);
      const shares: Record<string, number> = {};
      for (const item of dist.items) shares[item.option] = item.percent;
      rows.push({ segment, total: dist.total, shares });
    }
  }

  rows.sort((a, b) => b.total - a.total || a.segment.localeCompare(b.segment));
  return { segments: rows.map((r) => r.segment), rows };
}

/** 주관식 응답 수집 */
export function openTextAnswers(
  question: SurveyQuestion,
  responses: AnalyzableResponse[]
): { localId: string; text: string; client?: PlainClient | null }[] {
  const out: { localId: string; text: string; client?: PlainClient | null }[] = [];
  for (const r of responses) {
    const v = r.answers[question.id];
    if (typeof v === 'string' && v.trim()) out.push({ localId: r.localId, text: v.trim(), client: r.client });
  }
  return out;
}

const STOPWORDS = new Set([
  '그리고', '그런데', '하지만', '그래서', '때문에', '있다', '없다', '한다', '이다', '되다',
  '같다', '정도', '경우', '생각', '그것', '이것', '저것', '우리', '제가', '내가', '것이',
  '수가', '조금', '매우', '아주', '너무', '좋겠다', '싶다', '있는', '없는', '하는', '위해',
]);

/** 조사(어미) 제거용 — 한국어 형태소 분석 없이 쓰는 간이 규칙 */
const PARTICLES = ['으로써', '으로서', '에서는', '에게서', '이라고', '으로', '에서', '에게', '까지', '부터', '보다', '이나', '처럼', '마다', '조차', '라도', '은', '는', '이', '가', '을', '를', '에', '와', '과', '도', '만', '의', '로'];

export function tokenizeKorean(text: string): string[] {
  const rough = text
    .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const tokens: string[] = [];
  for (const raw of rough) {
    let t = raw;
    for (const p of PARTICLES) {
      if (t.length > p.length + 1 && t.endsWith(p)) {
        t = t.slice(0, -p.length);
        break;
      }
    }
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    tokens.push(t);
  }
  return tokens;
}

export interface KeywordCount {
  keyword: string;
  count: number;
  /** 이 키워드를 포함한 대표 응답 (합성 응답임을 UI 에 표시) */
  examples: string[];
}

/** 빈도 기반 키워드 추출 (v1 단순 분석) */
export function keywordFrequency(texts: string[], topN = 15): KeywordCount[] {
  const counts = new Map<string, number>();
  const examples = new Map<string, string[]>();

  for (const text of texts) {
    const seen = new Set(tokenizeKorean(text));
    for (const token of seen) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
      const ex = examples.get(token) ?? [];
      if (ex.length < 3) {
        ex.push(text);
        examples.set(token, ex);
      }
    }
  }

  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count, examples: examples.get(keyword) ?? [] }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, topN);
}

/** 반복 실행 안정성: 런별 보기 비율과 변동폭 */
export interface StabilityRow {
  option: string;
  /** runId → percent */
  byRun: Record<string, number>;
  min: number;
  max: number;
  range: number;
}

export function stabilityAcrossRuns(
  question: SurveyQuestion,
  runs: { runId: string; label: string; responses: { answers: AnswerMap }[] }[]
): { rows: StabilityRow[]; maxRange: number; meanByRun: Record<string, number> } {
  const optionSet = new Set<string>(question.options ?? []);
  const perRun: Record<string, Record<string, number>> = {};
  const meanByRun: Record<string, number> = {};

  for (const run of runs) {
    if (question.type === 'scale_5' || question.type === 'number') {
      meanByRun[run.runId] = scaleStats(numericValues(question, run.responses)).mean;
      continue;
    }
    const dist = choiceDistribution(question, run.responses);
    const map: Record<string, number> = {};
    for (const item of dist.items) {
      map[item.option] = item.percent;
      optionSet.add(item.option);
    }
    perRun[run.runId] = map;
  }

  const rows: StabilityRow[] = [...optionSet].map((option) => {
    const byRun: Record<string, number> = {};
    for (const run of runs) byRun[run.runId] = perRun[run.runId]?.[option] ?? 0;
    const values = Object.values(byRun);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    return { option, byRun, min, max, range: Number((max - min).toFixed(1)) };
  });

  rows.sort((a, b) => b.max - a.max);
  const maxRange = rows.reduce((a, r) => Math.max(a, r.range), 0);
  return { rows, maxRange, meanByRun };
}

/** 응답 편중(한 보기에 쏠림) 확인 — 설문 문항 사전검토용 */
export function skewWarning(items: OptionShare[]): string | null {
  if (items.length < 2) return null;
  const top = items[0];
  if (top.percent >= 70) {
    return `"${top.option}" 보기에 ${top.percent}% 가 몰려 있습니다. 보기 구성이나 문항 표현을 점검해보세요.`;
  }
  const zero = items.filter((i) => i.count === 0);
  if (zero.length > 0 && items.length - zero.length >= 2) {
    return `선택된 적 없는 보기가 ${zero.length}개 있습니다 (${zero.map((z) => z.option).join(', ')}).`;
  }
  return null;
}

export function answerToDisplay(value: AnswerValue): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
