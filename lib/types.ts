/**
 * 앱 전역 도메인 타입.
 * DB(SQLite)는 JSON 을 문자열로 저장하므로, 여기 타입은 파싱 후의 형태를 뜻한다.
 */

export const QUESTION_TYPES = [
  'single_choice',
  'multi_choice',
  'scale_5',
  'number',
  'open_text',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: '단일선택',
  multi_choice: '복수선택',
  scale_5: '5점 척도',
  number: '숫자 응답',
  open_text: '주관식',
};

export type ConditionOperator = 'eq' | 'neq' | 'lte' | 'gte' | 'includes';

export const CONDITION_OPERATOR_LABEL: Record<ConditionOperator, string> = {
  eq: '와(과) 같다',
  neq: '와(과) 다르다',
  lte: '이하이다',
  gte: '이상이다',
  includes: '을(를) 포함한다',
};

export interface QuestionCondition {
  /** 이 문항을 보여줄지 결정하는 기준 문항 ID */
  questionId: string;
  operator: ConditionOperator;
  value: string | number;
}

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  question: string;
  /** 응답자에게 보여주는 보조 설명 */
  helpText?: string;
  options?: string[];
  /** 복수선택 최대 선택 개수 */
  maxSelections?: number;
  /** 5점 척도 라벨 (1~5 순서) */
  scaleLabels?: string[];
  min?: number;
  max?: number;
  unit?: string;
  required?: boolean;
  condition?: QuestionCondition;
  /**
   * 같은 개념(구성개념)을 재는 문항끼리 묶는 이름.
   * 예: "참여의향", "사회적 고립감". 신뢰도(α)·문항 변별도 계산 단위가 된다.
   */
  construct?: string;
  /** 역채점 문항 여부(예: "참여할 생각이 없다") */
  reverse?: boolean;
}

export const DEFAULT_SCALE_LABELS = [
  '전혀 그렇지 않다',
  '별로 그렇지 않다',
  '보통이다',
  '그렇다',
  '매우 그렇다',
];

export type AnswerValue = string | number | string[] | null;

/** { "Q1": "병원동행", "Q2": 5, "Q6": ["식사지원", "이동지원"] } */
export type AnswerMap = Record<string, AnswerValue>;

export const RESPONSE_STATUS = [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'INVALID_RESPONSE',
  'RATE_LIMITED',
] as const;
export type ResponseStatus = (typeof RESPONSE_STATUS)[number];

export const RUN_STATUS = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const;
export type RunStatus = (typeof RUN_STATUS)[number];

/** Synthetic Client 의 고정 필드 (세그먼트 분석 후보) */
export const CLIENT_FIELDS = [
  { key: 'age', label: '연령' },
  { key: 'sex', label: '성별' },
  { key: 'province', label: '시도' },
  { key: 'district', label: '시군구' },
  { key: 'householdType', label: '가구형태' },
  { key: 'maritalStatus', label: '혼인상태' },
  { key: 'housingType', label: '주거형태' },
  { key: 'educationLevel', label: '학력' },
  { key: 'employmentStatus', label: '경제활동' },
  { key: 'economicStatus', label: '경제수준' },
  { key: 'healthStatus', label: '건강상태' },
  { key: 'mobilityDifficulty', label: '이동 불편' },
  { key: 'digitalLiteracy', label: '디지털 활용' },
  { key: 'socialContactLevel', label: '사회적 접촉' },
  { key: 'careNeed', label: '돌봄 필요' },
  { key: 'currentServiceUse', label: '현재 이용 서비스' },
] as const;

export type ClientFieldKey = (typeof CLIENT_FIELDS)[number]['key'];

export const CLIENT_FIELD_LABEL: Record<string, string> = Object.fromEntries(
  CLIENT_FIELDS.map((f) => [f.key, f.label])
);

/** 연령 세그먼트 구간 (세그먼트 분석용) */
export const AGE_BANDS: { label: string; min: number; max: number }[] = [
  { label: '64세 이하', min: 0, max: 64 },
  { label: '65~74세', min: 65, max: 74 },
  { label: '75~84세', min: 75, max: 84 },
  { label: '85세 이상', min: 85, max: 200 },
];

export interface PlainClient {
  id: string;
  localId: string;
  age: number | null;
  sex: string | null;
  province: string | null;
  district: string | null;
  householdType: string | null;
  maritalStatus: string | null;
  housingType: string | null;
  educationLevel: string | null;
  employmentStatus: string | null;
  economicStatus: string | null;
  healthStatus: string | null;
  mobilityDifficulty: string | null;
  digitalLiteracy: string | null;
  socialContactLevel: string | null;
  careNeed: string | null;
  currentServiceUse: string[];
  attributes: Record<string, unknown>;
  personaSummary: string;
  sourceType: string;
  sourceMetadata: Record<string, unknown>;
}

export interface SourceMeta {
  base_source?: string;
  welfare_distribution_source?: string;
  generation_method?: string;
  notes?: string;
  [key: string]: unknown;
}

/** Provider 별 권장 분당 호출 수 (무료 등급 기준, 0 = 제한 없음) */
export const RECOMMENDED_RPM: Record<string, number> = {
  mock: 0,
  gemini: 12,
  anthropic: 0,
  openai: 0,
};

export const DISCLAIMER =
  '이 결과는 AI와 합성 페르소나를 이용한 사전 시뮬레이션입니다. 실제 이용자·지역주민의 욕구조사를 대체하지 않습니다.';
