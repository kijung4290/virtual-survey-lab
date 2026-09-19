import type { PlainClient } from '@/lib/types';

/**
 * Persona Summary 생성 (규칙 기반).
 *
 * PRD 11장 원칙:
 * - 입력 필드에 없는 정보를 새로 만들지 않는다.
 * - 진단명, 성격, 감정 상태를 임의로 추가하지 않는다.
 * - "불쌍하다", "취약하다" 같은 가치 판단 표현을 쓰지 않는다.
 *
 * 따라서 LLM 이 아니라 결정적 템플릿으로 생성한다.
 */

export type PersonaInput = Partial<
  Pick<
    PlainClient,
    | 'age'
    | 'sex'
    | 'province'
    | 'district'
    | 'householdType'
    | 'maritalStatus'
    | 'housingType'
    | 'educationLevel'
    | 'employmentStatus'
    | 'economicStatus'
    | 'healthStatus'
    | 'mobilityDifficulty'
    | 'digitalLiteracy'
    | 'socialContactLevel'
    | 'careNeed'
    | 'currentServiceUse'
  >
>;

const LEVEL_LOW = ['낮음', '하', 'low', '적음', '없음'];
const LEVEL_MID = ['중간', '보통', '중', 'medium', 'mid'];
const LEVEL_HIGH = ['높음', '상', 'high', '많음'];

function level(value?: string | null): 'low' | 'mid' | 'high' | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (LEVEL_LOW.some((x) => v === x.toLowerCase())) return 'low';
  if (LEVEL_MID.some((x) => v === x.toLowerCase())) return 'mid';
  if (LEVEL_HIGH.some((x) => v === x.toLowerCase())) return 'high';
  return null;
}

function sexLabel(sex?: string | null): string | null {
  if (!sex) return null;
  const v = String(sex).trim().toUpperCase();
  if (['F', '여', '여성', 'FEMALE', '2'].includes(v)) return '여성';
  if (['M', '남', '남성', 'MALE', '1'].includes(v)) return '남성';
  return null;
}

/** 구조화 필드만으로 사람이 읽기 쉬운 요약문을 만든다. */
export function buildPersonaSummary(c: PersonaInput): string {
  const sentences: string[] = [];

  // 1문장: 연령/성별/가구형태
  const parts1: string[] = [];
  if (c.age !== undefined && c.age !== null) parts1.push(`${c.age}세`);
  const sx = sexLabel(c.sex);
  if (sx) parts1.push(sx);
  const who = parts1.join(' ');
  if (who && c.householdType) {
    sentences.push(`${who}이며 가구형태는 ${c.householdType}이다.`);
  } else if (who) {
    sentences.push(`${who}이다.`);
  } else if (c.householdType) {
    sentences.push(`가구형태는 ${c.householdType}이다.`);
  }

  // 2문장: 거주지/주거형태/경제수준
  const parts2: string[] = [];
  const region = [c.province, c.district].filter(Boolean).join(' ');
  if (region) parts2.push(`${region}에 거주한다`);
  if (c.housingType) parts2.push(`주거형태는 ${c.housingType}이다`);
  if (c.economicStatus) parts2.push(`경제수준은 ${c.economicStatus} 수준으로 기록되어 있다`);
  if (parts2.length) sentences.push(parts2.join('. ') + '.');

  // 3문장: 건강/이동
  const parts3: string[] = [];
  if (c.healthStatus) parts3.push(`건강상태는 ${c.healthStatus}으로 기록되어 있다`);
  const mob = level(c.mobilityDifficulty);
  if (c.mobilityDifficulty) {
    if (mob === 'high') parts3.push('외출과 이동에 어려움이 큰 편이다');
    else if (mob === 'mid') parts3.push('외출과 이동에 어느 정도 어려움이 있다');
    else if (mob === 'low') parts3.push('외출과 이동에 큰 어려움은 없다');
    else parts3.push(`이동 불편 수준은 ${c.mobilityDifficulty}이다`);
  }
  if (parts3.length) sentences.push(parts3.join('. ') + '.');

  // 4문장: 디지털 활용
  const dig = level(c.digitalLiteracy);
  if (c.digitalLiteracy) {
    if (dig === 'high') sentences.push('스마트폰과 디지털 기기 활용 수준은 높은 편이다.');
    else if (dig === 'mid') sentences.push('스마트폰 활용 수준은 보통이다.');
    else if (dig === 'low') sentences.push('스마트폰 활용 수준은 낮은 편이다.');
    else sentences.push(`디지털 활용 수준은 ${c.digitalLiteracy}이다.`);
  }

  // 5문장: 사회적 접촉
  const soc = level(c.socialContactLevel);
  if (c.socialContactLevel) {
    if (soc === 'high') sentences.push('가까운 사람들과 만나는 빈도는 잦은 편이다.');
    else if (soc === 'mid') sentences.push('가까운 사람들과 만나는 빈도는 보통이다.');
    else if (soc === 'low') sentences.push('가까운 사람들과 만나는 빈도는 적은 편이다.');
    else sentences.push(`사회적 접촉 수준은 ${c.socialContactLevel}이다.`);
  }

  // 6문장: 돌봄 필요 / 현재 이용 서비스
  if (c.careNeed) sentences.push(`돌봄 필요 수준은 ${c.careNeed}으로 기록되어 있다.`);
  const services = (c.currentServiceUse ?? []).filter(Boolean);
  if (services.length) {
    sentences.push(`현재 이용 중인 서비스는 ${services.join(', ')}이다.`);
  } else if (c.currentServiceUse) {
    sentences.push('현재 이용 중으로 기록된 서비스는 없다.');
  }

  // 7문장: 학력/경제활동
  const parts7: string[] = [];
  if (c.educationLevel) parts7.push(`학력은 ${c.educationLevel}`);
  if (c.employmentStatus) parts7.push(`경제활동 상태는 ${c.employmentStatus}`);
  if (parts7.length) sentences.push(parts7.join(', ') + '으로 기록되어 있다.');

  if (sentences.length === 0) {
    return '제공된 속성 정보가 없어 요약을 생성할 수 없다.';
  }
  return sentences.join('\n');
}

/** LLM 프롬프트에 넣을 구조화 필드 블록 */
export function buildPersonaFields(c: PersonaInput & { attributes?: Record<string, unknown> }): string {
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) {
      if (v.length === 0) return;
      lines.push(`${label}: ${v.join(', ')}`);
      return;
    }
    lines.push(`${label}: ${String(v)}`);
  };

  push('Age', c.age);
  push('Sex', sexLabel(c.sex) ?? c.sex);
  push('Province', c.province);
  push('District', c.district);
  push('Household type', c.householdType);
  push('Marital status', c.maritalStatus);
  push('Housing', c.housingType);
  push('Education', c.educationLevel);
  push('Employment', c.employmentStatus);
  push('Economic status', c.economicStatus);
  push('Health status', c.healthStatus);
  push('Mobility difficulty', c.mobilityDifficulty);
  push('Digital literacy', c.digitalLiteracy);
  push('Social contact', c.socialContactLevel);
  push('Care need', c.careNeed);
  push('Current service use', c.currentServiceUse);

  for (const [k, v] of Object.entries(c.attributes ?? {})) {
    if (typeof v === 'object' && v !== null) continue;
    push(k, v);
  }

  return lines.join('\n');
}
