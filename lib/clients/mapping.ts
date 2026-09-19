import { CLIENT_FIELDS, type PlainClient } from '@/lib/types';
import { buildPersonaSummary } from '@/lib/clients/persona';

/** CSV 컬럼명 → Synthetic Client 필드 자동 추천용 별칭표 */
const ALIASES: Record<string, string[]> = {
  age: ['age', '나이', '연령', 'age_years'],
  sex: ['sex', 'gender', '성별'],
  province: ['province', 'sido', '시도', '광역시도', 'region'],
  district: ['district', 'sigungu', '시군구', '지역', 'city'],
  householdType: ['household_type', 'householdtype', 'family_type', '가구형태', '가구유형', '세대구성'],
  maritalStatus: ['marital_status', 'marital', '혼인상태', '결혼상태'],
  housingType: ['housing_type', 'housing', '주거형태', '주택유형'],
  educationLevel: ['education', 'education_level', '학력', '교육수준'],
  employmentStatus: ['employment', 'employment_status', 'job', '경제활동', '직업', '취업상태'],
  economicStatus: ['economic_status', 'income_level', 'income', '경제수준', '소득수준', '경제상태'],
  healthStatus: ['health_status', 'health', '건강상태', '주관적건강'],
  mobilityDifficulty: ['mobility_difficulty', 'mobility', '이동불편', '보행불편', '외출어려움'],
  digitalLiteracy: ['digital_literacy', 'digital', 'smartphone', '디지털활용', '스마트폰활용'],
  socialContactLevel: ['social_contact', 'social_contact_level', 'social', '사회적접촉', '사회관계'],
  careNeed: ['care_need', 'care', '돌봄필요', '장기요양'],
  currentServiceUse: ['current_service_use', 'services', 'service_use', '이용서비스', '현재이용서비스'],
  localId: ['id', 'client_id', 'sc_id', '번호', '식별번호', 'no'],
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s._-]/g, '');
}

/** CSV 헤더 → 필드 매핑을 자동 추천한다. 값은 필드 키 또는 ''(무시) */
export function suggestMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const n = norm(h);
    let hit = '';
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (aliases.some((a) => norm(a) === n)) {
        hit = field;
        break;
      }
    }
    if (!hit) {
      // 부분 일치는 오탐이 쉽다("unknown_col" 이 "no" 를 포함하는 식).
      // 그래서 4글자 이상 별칭에만 적용한다.
      for (const [field, aliases] of Object.entries(ALIASES)) {
        if (aliases.some((a) => norm(a).length >= 4 && n.includes(norm(a)))) {
          hit = field;
          break;
        }
      }
    }
    map[h] = hit;
  }
  return map;
}

/** 매핑에서 "저장하지 않음"을 뜻하는 값 */
export const SKIP_COLUMN = '__skip__';

export const MAPPABLE_FIELDS = [
  { key: 'localId', label: '식별번호(일련번호)' },
  ...CLIENT_FIELDS.map((f) => ({ key: f.key as string, label: f.label })),
];

export type ClientDraft = Omit<PlainClient, 'id'>;

export interface MappingResult {
  clients: ClientDraft[];
  /** 매핑되지 않아 attributes 로 들어간 컬럼 */
  extraColumns: string[];
  errors: string[];
}

/**
 * CSV 행 + 컬럼 매핑 → Synthetic Client 초안.
 * 매핑되지 않은 컬럼은 사용자 정의 필드(attributes)로 보존한다.
 */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  options: { sourceType?: string; sourceMetadata?: Record<string, unknown>; idPrefix?: string } = {}
): MappingResult {
  const errors: string[] = [];
  const extraColumns = Object.entries(mapping)
    .filter(([, field]) => !field)
    .map(([col]) => col);

  const clients: ClientDraft[] = rows.map((row, idx) => {
    const draft: ClientDraft = {
      localId: `${options.idPrefix ?? 'SC'}-${String(idx + 1).padStart(4, '0')}`,
      age: null,
      sex: null,
      province: null,
      district: null,
      householdType: null,
      maritalStatus: null,
      housingType: null,
      educationLevel: null,
      employmentStatus: null,
      economicStatus: null,
      healthStatus: null,
      mobilityDifficulty: null,
      digitalLiteracy: null,
      socialContactLevel: null,
      careNeed: null,
      currentServiceUse: [],
      attributes: {},
      personaSummary: '',
      sourceType: options.sourceType ?? 'imported',
      sourceMetadata: options.sourceMetadata ?? {},
    };

    for (const [col, value] of Object.entries(row)) {
      const field = mapping[col];
      if (field === SKIP_COLUMN) continue;
      if (!field) {
        // 매핑하지 않은 컬럼은 사용자 정의 필드로 보존한다.
        if (value !== '') draft.attributes[col] = value;
        continue;
      }
      if (value === '') continue;

      if (field === 'age') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        const n = cleaned === '' ? Number.NaN : Number(cleaned);
        if (Number.isFinite(n)) draft.age = Math.round(n);
        else errors.push(`${idx + 2}행: 연령 값을 숫자로 변환할 수 없습니다 (${value})`);
      } else if (field === 'currentServiceUse') {
        draft.currentServiceUse = value
          .split(/[,|;·]/)
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (field === 'localId') {
        draft.localId = value;
      } else {
        (draft as unknown as Record<string, unknown>)[field] = value;
      }
    }

    draft.personaSummary = buildPersonaSummary(draft);
    return draft;
  });

  return { clients, extraColumns, errors };
}
