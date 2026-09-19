import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '@/lib/import/csv';
import { scanColumns, scanValues } from '@/lib/privacy/detect';
import { applyMapping, suggestMapping, SKIP_COLUMN } from '@/lib/clients/mapping';
import { allocateCounts, generateClients, sampleFromBandLabel } from '@/lib/clients/generate';
import { buildPersonaSummary } from '@/lib/clients/persona';
import { coerceAnswer, isQuestionVisible, validateSurveyQuestions } from '@/lib/survey/schema';
import { extractJsonObject, validateLLMResponse } from '@/lib/ai/schemas/response';
import { deterministicMockResponse } from '@/lib/ai/providers/mock';
import {
  choiceDistribution,
  keywordFrequency,
  scaleStats,
  segmentBreakdown,
  segmentValue,
  skewWarning,
  stabilityAcrossRuns,
} from '@/lib/analytics/aggregate';
import { compareResponses, meanAbsoluteError, spearmanCorrelation } from '@/lib/analytics/compare';
import { filterClients } from '@/lib/services/surveyRunService';
import { DEMO_QUESTIONS } from '@/lib/survey/demo';
import { mulberry32 } from '@/lib/utils';
import type { PlainClient, SurveyQuestion } from '@/lib/types';

// ─────────────────────────────── CSV ───────────────────────────────

describe('CSV 파싱', () => {
  it('헤더와 행을 읽는다', () => {
    const { headers, rows } = parseCsv('age,sex\n78,F\n69,M\n');
    expect(headers).toEqual(['age', 'sex']);
    expect(rows).toEqual([
      { age: '78', sex: 'F' },
      { age: '69', sex: 'M' },
    ]);
  });

  it('따옴표 안의 콤마와 줄바꿈, 이스케이프를 처리한다', () => {
    const csv = 'id,memo\n1,"이동이 어렵고, 비용도 부담"\n2,"줄바꿈\n포함"\n3,"따옴표 ""인용"" 포함"';
    const { rows } = parseCsv(csv);
    expect(rows[0].memo).toBe('이동이 어렵고, 비용도 부담');
    expect(rows[1].memo).toBe('줄바꿈\n포함');
    expect(rows[2].memo).toBe('따옴표 "인용" 포함');
  });

  it('BOM 과 CRLF, 빈 줄을 무시한다', () => {
    const { headers, rows } = parseCsv('﻿a,b\r\n1,2\r\n\r\n');
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toHaveLength(1);
  });

  it('직렬화 후 다시 파싱해도 값이 유지된다', () => {
    const csv = toCsv(['id', 'memo'], [['R1', '쉼표, 그리고 "따옴표"']]);
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual({ id: 'R1', memo: '쉼표, 그리고 "따옴표"' });
  });
});

// ─────────────────────── 개인정보 컬럼 탐지 ───────────────────────

describe('개인정보 의심 컬럼 탐지', () => {
  it('금지 컬럼명을 차단 대상으로 분류한다', () => {
    const result = scanColumns(['age', 'name', '전화번호', 'resident_number', '주소', 'email']);
    expect(result.hasBlocked).toBe(true);
    expect(result.blocked.map((b) => b.column)).toEqual(['name', '전화번호', 'resident_number', '주소', 'email']);
  });

  it('대소문자, 공백, 구분기호를 무시하고 탐지한다', () => {
    expect(scanColumns(['Phone_Number']).hasBlocked).toBe(true);
    expect(scanColumns([' 성 명 ']).hasBlocked).toBe(true);
  });

  it('준식별정보는 경고로만 분류한다', () => {
    const result = scanColumns(['birth_date']);
    expect(result.hasBlocked).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });

  it('안전한 컬럼만 있으면 아무것도 걸리지 않는다', () => {
    const result = scanColumns(['age', 'household_type', 'mobility_difficulty']);
    expect(result.findings).toHaveLength(0);
  });

  it('값에서 주민번호/휴대폰/이메일 패턴을 찾는다', () => {
    const suspects = scanValues([
      { memo: '연락은 010-1234-5678 로', code: 'A1' },
      { memo: '문제 없음', code: '801201-1234567' },
    ]);
    expect(suspects.sort()).toEqual(['code', 'memo']);
  });
});

// ─────────────────────────── 컬럼 매핑 ───────────────────────────

describe('컬럼 매핑', () => {
  it('별칭을 이용해 필드를 추천한다', () => {
    const mapping = suggestMapping(['age', 'family_type', 'digital_literacy', 'unknown_col']);
    expect(mapping.age).toBe('age');
    expect(mapping.family_type).toBe('householdType');
    expect(mapping.digital_literacy).toBe('digitalLiteracy');
    expect(mapping.unknown_col).toBe('');
  });

  it('매핑에 따라 값을 변환하고 매핑되지 않은 컬럼은 사용자 정의 필드로 보존한다', () => {
    const { clients, extraColumns } = applyMapping(
      [{ age: '78', family_type: '독거', services: '식사배달|경로식당', memo: '메모' }],
      { age: 'age', family_type: 'householdType', services: 'currentServiceUse', memo: '' }
    );
    expect(clients[0].age).toBe(78);
    expect(clients[0].householdType).toBe('독거');
    expect(clients[0].currentServiceUse).toEqual(['식사배달', '경로식당']);
    expect(clients[0].attributes.memo).toBe('메모');
    expect(extraColumns).toEqual(['memo']);
  });

  it('저장하지 않음으로 지정한 컬럼은 어디에도 저장하지 않는다', () => {
    const { clients } = applyMapping([{ age: '70', name: '홍길동' }], { age: 'age', name: SKIP_COLUMN });
    expect(clients[0].attributes.name).toBeUndefined();
    expect(clients[0].age).toBe(70);
  });

  it('숫자로 바꿀 수 없는 연령은 오류로 보고한다', () => {
    const { errors } = applyMapping([{ age: '알 수 없음' }], { age: 'age' });
    expect(errors).toHaveLength(1);
  });
});

// ───────────────────────── Persona Summary ─────────────────────────

describe('Persona Summary 생성', () => {
  it('제공된 필드만 사용해 요약을 만든다', () => {
    const summary = buildPersonaSummary({
      age: 78,
      sex: 'F',
      householdType: '독거',
      housingType: '임대',
      economicStatus: '낮음',
      mobilityDifficulty: '중간',
      digitalLiteracy: '낮음',
      socialContactLevel: '낮음',
      currentServiceUse: ['경로식당'],
    });
    expect(summary).toContain('78세');
    expect(summary).toContain('독거');
    expect(summary).toContain('경로식당');
    // 가치 판단 표현이나 없는 정보를 만들지 않는다
    expect(summary).not.toMatch(/불쌍|취약|우울|치매/);
  });

  it('정보가 없으면 만들어내지 않는다', () => {
    expect(buildPersonaSummary({})).toContain('요약을 생성할 수 없다');
  });
});

// ───────────────────────── 조건부 샘플 생성 ─────────────────────────

describe('조건 기반 Synthetic Client 생성', () => {
  it('비율을 정수 인원으로 정확히 배분한다', () => {
    const counts = allocateCounts(
      [
        { value: 'a', percent: 45 },
        { value: 'b', percent: 40 },
        { value: 'c', percent: 15 },
      ],
      300
    );
    expect(counts).toEqual([135, 120, 45]);
    expect(counts.reduce((x, y) => x + y, 0)).toBe(300);
  });

  it('합계가 100이 아니어도 총원을 맞춘다', () => {
    const counts = allocateCounts(
      [
        { value: 'a', percent: 1 },
        { value: 'b', percent: 1 },
      ],
      7
    );
    expect(counts.reduce((x, y) => x + y, 0)).toBe(7);
  });

  it('연령 구간 문자열을 숫자로 변환한다', () => {
    const rand = mulberry32(1);
    const age = sampleFromBandLabel('65-74', rand);
    expect(age).toBeGreaterThanOrEqual(65);
    expect(age).toBeLessThanOrEqual(74);
    expect(sampleFromBandLabel('85+', mulberry32(2))).toBeGreaterThanOrEqual(85);
    expect(sampleFromBandLabel('없음', rand)).toBeNull();
  });

  it('같은 seed 면 같은 패널을 만든다(재현성)', () => {
    const spec = {
      total: 20,
      seed: 42,
      distributions: [
        {
          field: 'householdType',
          buckets: [
            { value: '독거', percent: 50 },
            { value: '부부', percent: 50 },
          ],
        },
      ],
    };
    const a = generateClients(spec).clients.map((c) => c.householdType);
    const b = generateClients(spec).clients.map((c) => c.householdType);
    expect(a).toEqual(b);
    expect(a.filter((x) => x === '독거')).toHaveLength(10);
  });

  it('조건부 규칙이 해당 대상에만 적용된다', () => {
    const { clients } = generateClients({
      total: 40,
      seed: 7,
      distributions: [
        { field: 'age', buckets: [{ value: '85+', percent: 100 }] },
        { field: 'householdType', buckets: [{ value: '독거', percent: 100 }] },
        { field: 'mobilityDifficulty', buckets: [{ value: '낮음', percent: 100 }] },
      ],
      conditionalRules: [
        {
          when: [
            { field: 'age', operator: 'gte', value: 80 },
            { field: 'householdType', operator: 'eq', value: '독거' },
          ],
          field: 'mobilityDifficulty',
          buckets: [{ value: '높음', percent: 100 }],
        },
      ],
    });
    expect(clients.every((c) => c.mobilityDifficulty === '높음')).toBe(true);
  });
});

// ─────────────────────── 설문 정의 검증 ───────────────────────

describe('설문 JSON 검증', () => {
  it('데모 설문은 유효하다', () => {
    const result = validateSurveyQuestions(DEMO_QUESTIONS);
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(6);
  });

  it('선택지가 부족한 선택형 문항을 거부한다', () => {
    const result = validateSurveyQuestions([
      { id: 'Q1', type: 'single_choice', question: '문항', options: ['하나'] },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain('선택지가 2개 이상');
  });

  it('문항 ID 중복을 거부한다', () => {
    const result = validateSurveyQuestions([
      { id: 'Q1', type: 'open_text', question: 'a' },
      { id: 'Q1', type: 'open_text', question: 'b' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain('중복');
  });

  it('뒤 문항을 참조하는 조건을 거부한다', () => {
    const result = validateSurveyQuestions([
      { id: 'Q1', type: 'open_text', question: 'a', condition: { questionId: 'Q2', operator: 'eq', value: 'x' } },
      { id: 'Q2', type: 'open_text', question: 'b' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain('앞 순서의 문항');
  });

  it('조건부 문항 표시 여부를 판단한다', () => {
    const q: SurveyQuestion = {
      id: 'Q3',
      type: 'open_text',
      question: '이유',
      condition: { questionId: 'Q2', operator: 'lte', value: 2 },
    };
    expect(isQuestionVisible(q, { Q2: 2 })).toBe(true);
    expect(isQuestionVisible(q, { Q2: 4 })).toBe(false);
    expect(isQuestionVisible(q, {})).toBe(false);
  });
});

// ─────────────────── LLM 응답 스키마 검증 ───────────────────

describe('LLM 응답 검증', () => {
  const questions: SurveyQuestion[] = [
    { id: 'Q1', type: 'single_choice', question: '선호', options: ['병원동행', '건강걷기'] },
    { id: 'Q2', type: 'scale_5', question: '의향' },
    { id: 'Q3', type: 'open_text', question: '이유' },
  ];

  it('코드펜스가 섞인 응답에서 JSON 을 추출한다', () => {
    const json = extractJsonObject('```json\n{"a":1}\n```');
    expect(json).toEqual({ a: 1 });
  });

  it('앞뒤 설명이 붙은 응답에서도 JSON 객체를 찾는다', () => {
    expect(extractJsonObject('다음과 같습니다. {"a":{"b":2}} 이상입니다.')).toEqual({ a: { b: 2 } });
  });

  it('올바른 응답을 통과시킨다', () => {
    const raw = JSON.stringify({
      respondent_id: 'SC-0001',
      answers: [
        { question_id: 'Q1', value: '병원동행' },
        { question_id: 'Q2', value: 5 },
        { question_id: 'Q3', value: '혼자 가기 어려워서' },
      ],
    });
    const result = validateLLMResponse(raw, questions);
    expect(result.ok).toBe(true);
    expect(result.answers).toEqual({ Q1: '병원동행', Q2: 5, Q3: '혼자 가기 어려워서' });
  });

  it('보기에 없는 값과 범위를 벗어난 척도를 오류로 남긴다', () => {
    const raw = JSON.stringify({
      answers: [
        { question_id: 'Q1', value: '요리교실' },
        { question_id: 'Q2', value: 9 },
        { question_id: 'Q3', value: '' },
      ],
    });
    const result = validateLLMResponse(raw, questions);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it('JSON 이 아니면 실패한다', () => {
    expect(validateLLMResponse('죄송하지만 응답할 수 없습니다.', questions).ok).toBe(false);
  });

  it('문항 유형에 맞게 값을 보정한다', () => {
    const multi: SurveyQuestion = {
      id: 'Q6',
      type: 'multi_choice',
      question: '지원',
      options: ['식사 지원', '이동 지원', '건강 지원'],
      maxSelections: 2,
    };
    expect(coerceAnswer(multi, '식사 지원, 이동 지원, 건강 지원')).toEqual(['식사 지원', '이동 지원']);
    expect(coerceAnswer({ id: 'Q2', type: 'scale_5', question: '' }, '4점')).toBe(4);
    expect(coerceAnswer({ id: 'Q5', type: 'number', question: '', min: 0, max: 5 }, 12)).toBe(5);
  });
});

// ───────────────────── Mock Provider ─────────────────────

describe('MockLLMProvider', () => {
  it('설문 스키마를 통과하는 결정적 응답을 만든다', () => {
    const input = {
      respondentId: 'SC-0001',
      personaFields: 'Age: 82\nHousehold type: 독거\nMobility difficulty: 높음\nDigital literacy: 낮음',
      personaSummary: '82세 여성이며 가구형태는 독거이다.',
      questions: DEMO_QUESTIONS,
      systemPrompt: 'test',
      temperature: 0.3,
      model: 'mock-deterministic-v1',
    };
    const first = deterministicMockResponse(input);
    const second = deterministicMockResponse(input);
    expect(first).toBe(second);

    const validation = validateLLMResponse(first, DEMO_QUESTIONS);
    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });
});

// ───────────────────────── 집계/비율 ─────────────────────────

describe('응답 집계', () => {
  const q: SurveyQuestion = {
    id: 'Q1',
    type: 'single_choice',
    question: '선호',
    options: ['병원동행', '스마트폰', '건강걷기'],
  };

  it('비율과 순위를 계산한다', () => {
    const responses = [
      { answers: { Q1: '병원동행' } },
      { answers: { Q1: '병원동행' } },
      { answers: { Q1: '스마트폰' } },
      { answers: { Q1: '건강걷기' } },
    ];
    const dist = choiceDistribution(q, responses);
    expect(dist.total).toBe(4);
    expect(dist.items[0]).toMatchObject({ option: '병원동행', count: 2, percent: 50, rank: 1 });
    expect(dist.items.find((i) => i.option === '건강걷기')?.percent).toBe(25);
  });

  it('응답이 없으면 0으로 처리한다', () => {
    const dist = choiceDistribution(q, []);
    expect(dist.total).toBe(0);
    expect(dist.items.every((i) => i.percent === 0)).toBe(true);
  });

  it('복수선택은 응답자 수 기준 비율을 낸다', () => {
    const multi: SurveyQuestion = { id: 'Q6', type: 'multi_choice', question: '', options: ['a', 'b', 'c'] };
    const dist = choiceDistribution(multi, [{ answers: { Q6: ['a', 'b'] } }, { answers: { Q6: ['a'] } }]);
    expect(dist.total).toBe(2);
    expect(dist.items.find((i) => i.option === 'a')?.percent).toBe(100);
    expect(dist.items.find((i) => i.option === 'b')?.percent).toBe(50);
  });

  it('척도 통계를 계산한다', () => {
    const stats = scaleStats([5, 4, 4, 3, 1]);
    expect(stats.n).toBe(5);
    expect(stats.mean).toBe(3.4);
    expect(stats.median).toBe(4);
    expect(stats.sd).toBeGreaterThan(0);
    expect(stats.distribution.find((d) => d.value === 4)?.count).toBe(2);
  });

  it('응답 편중을 경고한다', () => {
    const dist = choiceDistribution(q, [
      { answers: { Q1: '병원동행' } },
      { answers: { Q1: '병원동행' } },
      { answers: { Q1: '병원동행' } },
      { answers: { Q1: '스마트폰' } },
    ]);
    expect(skewWarning(dist.items)).toContain('75%');
  });

  it('한국어 주관식에서 키워드를 뽑는다', () => {
    const keywords = keywordFrequency([
      '이동이 어려워서 참여가 힘들다',
      '이동 수단이 없어서 어렵다',
      '비용이 부담된다',
    ]);
    expect(keywords[0].count).toBeGreaterThanOrEqual(2);
    expect(keywords.map((k) => k.keyword)).toContain('이동');
  });

  it('반복 실행 간 변동폭을 계산한다', () => {
    const result = stabilityAcrossRuns(q, [
      { runId: 'a', label: 'A', responses: [{ answers: { Q1: '병원동행' } }, { answers: { Q1: '스마트폰' } }] },
      { runId: 'b', label: 'B', responses: [{ answers: { Q1: '병원동행' } }, { answers: { Q1: '병원동행' } }] },
    ]);
    const row = result.rows.find((r) => r.option === '병원동행')!;
    expect(row.byRun.a).toBe(50);
    expect(row.byRun.b).toBe(100);
    expect(row.range).toBe(50);
  });
});

// ───────────────────────── 세그먼트 ─────────────────────────

function client(partial: Partial<PlainClient>): PlainClient {
  return {
    id: partial.id ?? 'c1',
    localId: partial.localId ?? 'SC-0001',
    age: partial.age ?? null,
    sex: null,
    province: null,
    district: null,
    householdType: partial.householdType ?? null,
    maritalStatus: null,
    housingType: null,
    educationLevel: null,
    employmentStatus: null,
    economicStatus: null,
    healthStatus: null,
    mobilityDifficulty: partial.mobilityDifficulty ?? null,
    digitalLiteracy: null,
    socialContactLevel: null,
    careNeed: null,
    currentServiceUse: partial.currentServiceUse ?? [],
    attributes: {},
    personaSummary: '',
    sourceType: 'generated',
    sourceMetadata: {},
  };
}

describe('세그먼트 분석/필터', () => {
  it('연령은 구간으로 묶는다', () => {
    expect(segmentValue(client({ age: 78 }), 'age')).toBe('75~84세');
    expect(segmentValue(client({ age: 90 }), 'age')).toBe('85세 이상');
    expect(segmentValue(client({}), 'age')).toBe('(정보 없음)');
  });

  it('세그먼트별 응답 비율을 계산한다', () => {
    const q: SurveyQuestion = { id: 'Q1', type: 'single_choice', question: '', options: ['병원동행', '건강걷기'] };
    const responses = [
      { clientId: '1', localId: 'SC-1', status: 'SUCCESS', answers: { Q1: '병원동행' }, client: client({ householdType: '독거' }) },
      { clientId: '2', localId: 'SC-2', status: 'SUCCESS', answers: { Q1: '병원동행' }, client: client({ householdType: '독거' }) },
      { clientId: '3', localId: 'SC-3', status: 'SUCCESS', answers: { Q1: '건강걷기' }, client: client({ householdType: '부부' }) },
    ];
    const { rows } = segmentBreakdown(q, responses, 'householdType');
    expect(rows.find((r) => r.segment === '독거')?.shares['병원동행']).toBe(100);
    expect(rows.find((r) => r.segment === '부부')?.shares['건강걷기']).toBe(100);
  });

  it('세그먼트 필터로 대상자를 좁힌다', () => {
    const clients = [
      client({ id: '1', age: 70, householdType: '독거' }),
      client({ id: '2', age: 82, householdType: '독거' }),
      client({ id: '3', age: 82, householdType: '부부' }),
    ];
    expect(filterClients(clients, { householdType: ['독거'] })).toHaveLength(2);
    expect(filterClients(clients, { age: ['75-84'] })).toHaveLength(2);
    expect(filterClients(clients, { age: ['85+'] })).toHaveLength(0);
    expect(filterClients(clients, {})).toHaveLength(3);
  });
});

// ─────────────────── Synthetic vs Actual 비교 ───────────────────

describe('실제 조사 비교 계산', () => {
  const questions: SurveyQuestion[] = [
    { id: 'Q1', type: 'single_choice', question: '선호', options: ['병원동행', '스마트폰', '건강걷기'] },
    { id: 'Q2', type: 'scale_5', question: '의향' },
    { id: 'Q3', type: 'open_text', question: '이유' },
  ];

  const synthetic = [
    { clientId: '1', localId: 'SC-1', status: 'SUCCESS', answers: { Q1: '병원동행', Q2: 4 } },
    { clientId: '2', localId: 'SC-2', status: 'SUCCESS', answers: { Q1: '병원동행', Q2: 5 } },
    { clientId: '3', localId: 'SC-3', status: 'SUCCESS', answers: { Q1: '스마트폰', Q2: 3 } },
    { clientId: '4', localId: 'SC-4', status: 'SUCCESS', answers: { Q1: '건강걷기', Q2: 4 } },
  ];

  const actual = [
    { answers: { Q1: '스마트폰', Q2: 4 } },
    { answers: { Q1: '스마트폰', Q2: 3 } },
    { answers: { Q1: '병원동행', Q2: 4 } },
    { answers: { Q1: '건강걷기', Q2: 2 } },
  ];

  it('percentage point gap 과 순위 차이를 낸다', () => {
    const result = compareResponses(questions, synthetic, actual);
    const q1 = result.comparisons.find((c) => c.questionId === 'Q1');
    expect(q1?.type).toBe('choice');
    if (q1?.type !== 'choice') throw new Error('unexpected');

    const hospital = q1.rows.find((r) => r.option === '병원동행')!;
    expect(hospital.syntheticPercent).toBe(50);
    expect(hospital.actualPercent).toBe(25);
    expect(hospital.gapPp).toBe(25);
    expect(q1.topMatch).toBe(false);
    expect(q1.mae).toBeGreaterThan(0);
  });

  it('척도 평균 차이를 낸다', () => {
    const result = compareResponses(questions, synthetic, actual);
    const q2 = result.comparisons.find((c) => c.questionId === 'Q2');
    if (q2?.type !== 'scale') throw new Error('unexpected');
    expect(q2.syntheticMean).toBe(4);
    expect(q2.actualMean).toBe(3.25);
    expect(q2.meanDiff).toBe(0.75);
  });

  it('주관식은 비율 비교에서 제외한다', () => {
    const result = compareResponses(questions, synthetic, actual);
    expect(result.skipped.map((s) => s.questionId)).toContain('Q3');
  });

  it('MAE 와 Spearman 상관을 계산한다', () => {
    expect(meanAbsoluteError([50, 25, 25], [25, 50, 25])).toBe(16.67);
    expect(spearmanCorrelation([1, 2, 3, 4], [1, 2, 3, 4])).toBe(1);
    expect(spearmanCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
    expect(spearmanCorrelation([1, 2], [2, 1])).toBeNull();
  });
});
