import { hashString, mulberry32 } from '@/lib/utils';
import { buildPersonaSummary } from '@/lib/clients/persona';
import type { ClientDraft } from '@/lib/clients/mapping';

/**
 * 조건 기반 Synthetic Client 생성 (PRD 10.2 / 10.3).
 *
 * 원칙:
 * - 복지 관련 속성을 임의 확률로 "상상"하지 않는다. 사용자가 입력한 분포/교차표만 사용한다.
 * - 같은 seed + 같은 입력이면 항상 같은 결과가 나온다(재현성).
 */

export interface Bucket {
  /** 값 라벨. age 필드는 "65-74" 형태의 구간도 허용 */
  value: string;
  /** 비율(%) */
  percent: number;
}

export interface FieldDistribution {
  field: string;
  buckets: Bucket[];
}

export type RuleOperator = 'eq' | 'neq' | 'lte' | 'gte';

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value: string | number;
}

/** IF 조건 THEN 특정 필드는 이 분포를 따른다 (교차표 기반 sampling) */
export interface ConditionalRule {
  when: RuleCondition[];
  field: string;
  buckets: Bucket[];
}

export interface GenerateSpec {
  total: number;
  distributions: FieldDistribution[];
  conditionalRules?: ConditionalRule[];
  seed?: number;
  idPrefix?: string;
  sourceMetadata?: Record<string, unknown>;
}

/** 최대잔여법으로 비율을 정수 인원으로 배분한다(합계 = total 보장). */
export function allocateCounts(buckets: Bucket[], total: number): number[] {
  const sum = buckets.reduce((a, b) => a + (b.percent || 0), 0);
  if (sum <= 0) return buckets.map(() => 0);

  const exact = buckets.map((b) => ((b.percent || 0) / sum) * total);
  const floors = exact.map((x) => Math.floor(x));
  let remain = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const counts = [...floors];
  let k = 0;
  while (remain > 0 && order.length > 0) {
    counts[order[k % order.length].i] += 1;
    remain -= 1;
    k += 1;
  }
  return counts;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** "65-74", "85+", "~64" 같은 구간 문자열을 숫자로 샘플링한다. */
export function sampleFromBandLabel(label: string, rand: () => number): number | null {
  const cleaned = label.replace(/\s|세|이상|이하/g, '');
  const range = cleaned.match(/^(\d+)[-~](\d+)$/);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return lo + Math.floor(rand() * (hi - lo + 1));
  }
  const plus = cleaned.match(/^(\d+)\+$/);
  if (plus) {
    const lo = Number(plus[1]);
    return lo + Math.floor(rand() * 10);
  }
  const single = cleaned.match(/^(\d+)$/);
  if (single) return Number(single[1]);
  return null;
}

function matches(client: Record<string, unknown>, cond: RuleCondition): boolean {
  const v = client[cond.field];
  if (v === undefined || v === null) return false;
  switch (cond.operator) {
    case 'eq':
      return String(v) === String(cond.value);
    case 'neq':
      return String(v) !== String(cond.value);
    case 'lte':
      return Number(v) <= Number(cond.value);
    case 'gte':
      return Number(v) >= Number(cond.value);
    default:
      return false;
  }
}

/** 가중 추출(조건부 규칙 적용 시 사용) */
function weightedPick(buckets: Bucket[], rand: () => number): string | null {
  const sum = buckets.reduce((a, b) => a + (b.percent || 0), 0);
  if (sum <= 0) return null;
  let r = rand() * sum;
  for (const b of buckets) {
    r -= b.percent || 0;
    if (r <= 0) return b.value;
  }
  return buckets[buckets.length - 1].value;
}

export interface GenerateResult {
  clients: ClientDraft[];
  warnings: string[];
}

export function generateClients(spec: GenerateSpec): GenerateResult {
  const warnings: string[] = [];
  const total = Math.max(0, Math.floor(spec.total));
  const seed = spec.seed ?? hashString(JSON.stringify(spec.distributions) + total);
  const rand = mulberry32(seed);

  const base: Record<string, unknown>[] = Array.from({ length: total }, () => ({}));

  // 1) 각 필드를 입력 비율대로 정확히 배분한 뒤 섞어서 배정한다(주변분포 보존).
  for (const dist of spec.distributions) {
    if (!dist.buckets.length) continue;
    const sum = dist.buckets.reduce((a, b) => a + (b.percent || 0), 0);
    if (Math.abs(sum - 100) > 0.5) {
      warnings.push(`${dist.field} 분포 합계가 ${sum}% 입니다. 비율에 맞춰 정규화했습니다.`);
    }

    const counts = allocateCounts(dist.buckets, total);
    const pool: string[] = [];
    dist.buckets.forEach((b, i) => {
      for (let n = 0; n < counts[i]; n++) pool.push(b.value);
    });
    const assigned = shuffle(pool, rand);
    assigned.forEach((value, i) => {
      if (dist.field === 'age') {
        const age = sampleFromBandLabel(value, rand);
        base[i].age = age ?? value;
      } else {
        base[i][dist.field] = value;
      }
    });
  }

  // 2) 조건부 규칙(교차표)을 적용해 종속 속성을 다시 샘플링한다.
  for (const rule of spec.conditionalRules ?? []) {
    for (const c of base) {
      if (rule.when.every((cond) => matches(c, cond))) {
        const picked = weightedPick(rule.buckets, rand);
        if (picked !== null) {
          if (rule.field === 'age') c.age = sampleFromBandLabel(picked, rand) ?? picked;
          else c[rule.field] = picked;
        }
      }
    }
  }

  const clients: ClientDraft[] = base.map((c, idx) => {
    const draft: ClientDraft = {
      localId: `${spec.idPrefix ?? 'SC'}-${String(idx + 1).padStart(4, '0')}`,
      age: typeof c.age === 'number' ? (c.age as number) : null,
      sex: (c.sex as string) ?? null,
      province: (c.province as string) ?? null,
      district: (c.district as string) ?? null,
      householdType: (c.householdType as string) ?? null,
      maritalStatus: (c.maritalStatus as string) ?? null,
      housingType: (c.housingType as string) ?? null,
      educationLevel: (c.educationLevel as string) ?? null,
      employmentStatus: (c.employmentStatus as string) ?? null,
      economicStatus: (c.economicStatus as string) ?? null,
      healthStatus: (c.healthStatus as string) ?? null,
      mobilityDifficulty: (c.mobilityDifficulty as string) ?? null,
      digitalLiteracy: (c.digitalLiteracy as string) ?? null,
      socialContactLevel: (c.socialContactLevel as string) ?? null,
      careNeed: (c.careNeed as string) ?? null,
      currentServiceUse: Array.isArray(c.currentServiceUse) ? (c.currentServiceUse as string[]) : [],
      attributes: {},
      personaSummary: '',
      sourceType: 'generated',
      sourceMetadata: {
        generation_method: 'conditional_sampling',
        seed,
        ...(spec.sourceMetadata ?? {}),
      },
    };

    // 표준 필드가 아닌 값은 사용자 정의 필드로 보존
    const known = new Set(Object.keys(draft));
    for (const [k, v] of Object.entries(c)) {
      if (!known.has(k)) draft.attributes[k] = v as never;
    }

    draft.personaSummary = buildPersonaSummary(draft);
    return draft;
  });

  return { clients, warnings };
}
