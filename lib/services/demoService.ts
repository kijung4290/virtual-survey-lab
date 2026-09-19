import { prisma } from '@/lib/db';
import { generateClients } from '@/lib/clients/generate';
import { createDataset } from '@/lib/services/clientDatasetService';
import { createProject } from '@/lib/services/projectService';
import { createSurvey } from '@/lib/services/surveyService';
import { createRuns, executeRun } from '@/lib/services/surveyRunService';
import { importActualDataset } from '@/lib/services/actualSurveyService';
import { createComparison } from '@/lib/services/comparisonService';
import { DEMO_QUESTIONS, DEMO_SURVEY_NAME } from '@/lib/survey/demo';
import { toCsv } from '@/lib/import/csv';
import { mulberry32 } from '@/lib/utils';

/**
 * 데모 데이터 생성.
 *
 * API 키가 없어도 앱이 무엇을 하는 도구인지 바로 볼 수 있도록
 * Mock Provider(비용 0, 결정적)로 전체 파이프라인을 한 번 돌려 결과까지 만들어 둔다.
 *
 * CLI(`npm run seed`)와 화면의 "데모 데이터 만들기" 버튼이 같은 함수를 쓴다.
 */

export const DEMO_PROJECT_NAME = DEMO_SURVEY_NAME;

const DISTRIBUTIONS = [
  {
    field: 'age',
    buckets: [
      { value: '65-74', percent: 45 },
      { value: '75-84', percent: 40 },
      { value: '85+', percent: 15 },
    ],
  },
  {
    field: 'sex',
    buckets: [
      { value: 'F', percent: 62 },
      { value: 'M', percent: 38 },
    ],
  },
  {
    field: 'householdType',
    buckets: [
      { value: '독거', percent: 38 },
      { value: '부부', percent: 42 },
      { value: '자녀동거', percent: 20 },
    ],
  },
  {
    field: 'housingType',
    buckets: [
      { value: '자가', percent: 55 },
      { value: '임대', percent: 45 },
    ],
  },
  {
    field: 'economicStatus',
    buckets: [
      { value: '낮음', percent: 40 },
      { value: '보통', percent: 45 },
      { value: '높음', percent: 15 },
    ],
  },
  {
    field: 'healthStatus',
    buckets: [
      { value: '나쁨', percent: 30 },
      { value: '보통', percent: 45 },
      { value: '좋음', percent: 25 },
    ],
  },
  {
    field: 'mobilityDifficulty',
    buckets: [
      { value: '낮음', percent: 45 },
      { value: '중간', percent: 35 },
      { value: '높음', percent: 20 },
    ],
  },
  {
    field: 'digitalLiteracy',
    buckets: [
      { value: '낮음', percent: 45 },
      { value: '보통', percent: 35 },
      { value: '높음', percent: 20 },
    ],
  },
  {
    field: 'socialContactLevel',
    buckets: [
      { value: '낮음', percent: 35 },
      { value: '보통', percent: 40 },
      { value: '높음', percent: 25 },
    ],
  },
];

const CONDITIONAL_RULES = [
  {
    when: [
      { field: 'age', operator: 'gte' as const, value: 80 },
      { field: 'householdType', operator: 'eq' as const, value: '독거' },
    ],
    field: 'mobilityDifficulty',
    buckets: [
      { value: '낮음', percent: 20 },
      { value: '중간', percent: 35 },
      { value: '높음', percent: 45 },
    ],
  },
];

/** 실제 조사 결과(모의) CSV — Synthetic 과 일부러 다른 경향을 넣어 비교가 보이게 한다. */
function buildActualCsv(count: number): string {
  const rand = mulberry32(987654);
  const programs = DEMO_QUESTIONS[0].options!;
  const barriers = DEMO_QUESTIONS[3].options!;
  const supports = DEMO_QUESTIONS[5].options!;

  // 실제 조사에서는 스마트폰 교육이 가장 높게 나오는 상황을 가정
  const programWeights = [30, 18, 16, 22, 8, 6];
  const barrierWeights = [24, 18, 14, 12, 10, 8, 8, 6];

  const reasons = [
    '배우고 싶은데 알려주는 곳이 없어서',
    '사람들과 어울릴 수 있어서',
    '건강 관리에 도움이 될 것 같아서',
    '혼자 다니기 어려워서 도움이 필요해서',
    '집에만 있기 답답해서',
  ];
  const conditions = [
    '가까운 곳에서 하면 좋겠다',
    '오전 시간이면 참여할 수 있다',
    '참가비가 없으면 좋겠다',
    '차량으로 데려다주면 좋겠다',
    '천천히 여러 번 알려주면 좋겠다',
  ];

  const pick = (items: string[], weights: number[]) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = rand() * sum;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  const rows: (string | number)[][] = [];
  for (let i = 1; i <= count; i++) {
    const chosenSupports = [...supports].sort(() => rand() - 0.5).slice(0, 3).join('|');
    rows.push([
      `R${String(i).padStart(3, '0')}`,
      pick(programs, programWeights),
      Math.max(1, Math.min(5, Math.round(3.4 + (rand() - 0.5) * 2))),
      reasons[Math.floor(rand() * reasons.length)],
      pick(barriers, barrierWeights),
      conditions[Math.floor(rand() * conditions.length)],
      chosenSupports,
    ]);
  }

  return toCsv(['respondent_id', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'], rows);
}

export interface DemoOptions {
  clientCount?: number;
  actualCount?: number;
  /** 반복 실행 횟수(안정성 비교용) */
  repeat?: number;
  /** 같은 이름의 데모 프로젝트가 있으면 지우고 다시 만들지 */
  replace?: boolean;
  onProgress?: (message: string) => void;
}

export interface DemoResult {
  projectId: string;
  projectName: string;
  clientCount: number;
  runIds: string[];
  actualCount: number;
  reportId: string;
}

/** 데모 프로젝트 전체(패널 → 설문 → Mock 실행 → 실제조사 → 비교 리포트)를 한 번에 만든다. */
export async function createDemoProject(options: DemoOptions = {}): Promise<DemoResult> {
  const clientCount = options.clientCount ?? 30;
  const actualCount = options.actualCount ?? 50;
  const repeat = options.repeat ?? 2;
  const log = options.onProgress ?? (() => {});

  const existing = await prisma.project.findFirst({ where: { name: DEMO_PROJECT_NAME } });
  if (existing) {
    if (!options.replace) {
      throw new Error('이미 데모 프로젝트가 있습니다. 기존 프로젝트를 열어보세요.');
    }
    log('기존 데모 프로젝트를 삭제합니다.');
    await prisma.project.delete({ where: { id: existing.id } });
  }

  const project = await createProject({
    name: DEMO_PROJECT_NAME,
    description: '데모 데이터입니다. Synthetic Client 사전조사 → 실제 조사 비교 흐름을 확인할 수 있습니다.',
    targetPopulation: '65세 이상 지역주민',
  });
  log(`프로젝트 생성: ${project.name}`);

  const { clients } = generateClients({
    total: clientCount,
    distributions: DISTRIBUTIONS,
    conditionalRules: CONDITIONAL_RULES,
    seed: 20270101,
    sourceMetadata: {
      base_source: '데모용 합성 데이터(앱 내 생성)',
      welfare_distribution_source: '예시 분포(실제 통계 아님)',
      notes: '개인 식별정보 없음. 데모 목적으로만 사용하세요.',
    },
  });

  const dataset = await createDataset({
    projectId: project.id,
    name: 'WelfarePersona-demo',
    description: `분포 기반 생성 ${clientCount}명 (seed 20270101)`,
    sourceMeta: {
      base_source: '데모용 합성 데이터(앱 내 생성)',
      welfare_distribution_source: '예시 분포(실제 통계 아님)',
      generation_method: 'conditional_sampling',
      notes: '개인 식별정보 없음',
    },
    clients,
  });
  log(`가상 이용자 ${clients.length}명 생성`);

  const survey = await createSurvey({
    projectId: project.id,
    name: DEMO_SURVEY_NAME,
    description: '데모 설문 6문항 (단일선택/척도/주관식/복수선택)',
    questions: DEMO_QUESTIONS,
  });
  log(`설문지 생성: ${survey.questions.length}문항`);

  const { runs } = await createRuns({
    projectId: project.id,
    surveyId: survey.id,
    datasetId: dataset.id,
    label: '데모 실행 (Mock)',
    provider: 'mock',
    model: 'mock-deterministic-v1',
    temperature: 0.3,
    repeat,
    concurrency: 5,
  });

  for (const run of runs) {
    await executeRun(run.id);
    log(`Mock 실행 ${run.repeatIndex}회차 완료`);
  }

  const actual = await importActualDataset({
    projectId: project.id,
    surveyId: survey.id,
    name: '실제 조사(모의 데이터)',
    surveyDate: '2027-03',
    notes: '데모용 모의 응답입니다. 실제 조사 결과가 아닙니다.',
    csv: buildActualCsv(actualCount),
    columnMap: {
      respondent_id: '__respondent_id__',
      Q1: 'Q1',
      Q2: 'Q2',
      Q3: 'Q3',
      Q4: 'Q4',
      Q5: 'Q5',
      Q6: 'Q6',
    },
  });
  log(`실제 조사(모의) ${actual.rowCount}건 등록`);

  const report = await createComparison({
    projectId: project.id,
    runId: runs[0].id,
    actualDatasetId: actual.id,
  });
  log('비교 리포트 생성 완료');

  return {
    projectId: project.id,
    projectName: project.name,
    clientCount: clients.length,
    runIds: runs.map((r) => r.id),
    actualCount: actual.rowCount,
    reportId: report.id,
  };
}

/** 데모 프로젝트가 이미 있는지 */
export async function findDemoProject() {
  return prisma.project.findFirst({
    where: { name: DEMO_PROJECT_NAME },
    select: { id: true, name: true },
  });
}
