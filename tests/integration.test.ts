import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/services/projectService';
import { createDataset, allClients, datasetFieldValues } from '@/lib/services/clientDatasetService';
import { createSurvey, createSurveyVersion } from '@/lib/services/surveyService';
import { createRuns, executeRun, loadRunResponses, resumeRun } from '@/lib/services/surveyRunService';
import { analyzeRun, analyzeStability } from '@/lib/services/analysisService';
import { importActualDataset } from '@/lib/services/actualSurveyService';
import { createComparison, getComparison } from '@/lib/services/comparisonService';
import { exportResponsesCsv, exportSummaryCsv } from '@/lib/services/exportService';
import { applyMapping, suggestMapping } from '@/lib/clients/mapping';
import { parseCsv } from '@/lib/import/csv';
import { DEMO_QUESTIONS } from '@/lib/survey/demo';

/**
 * 통합 테스트: 프로젝트 생성 → CSV import → 설문 생성 → Mock LLM 실행 →
 * 응답 저장 → 분석 → 실제 조사 비교 → 내보내기
 *
 * tests/.tmp/test.db 를 사용하며 개발용 dev.db 에는 영향을 주지 않는다.
 */

const CLIENT_CSV = `id,age,sex,household_type,economic_status,mobility_difficulty,digital_literacy,social_contact
SC001,78,F,독거,낮음,중간,낮음,낮음
SC002,69,M,부부,보통,낮음,보통,높음
SC003,83,F,독거,낮음,높음,낮음,낮음
SC004,71,F,부부,보통,낮음,보통,보통
SC005,88,M,독거,낮음,높음,낮음,낮음`;

const ACTUAL_CSV = `respondent_id,Q1,Q2,Q3,Q4,Q5,Q6
R001,스마트폰 활용교육,4,배울 곳이 없어서,프로그램이 어렵게 느껴짐,쉽게 알려주면 좋겠다,디지털 기기 사용 지원|식사 지원
R002,병원동행,5,혼자 가기 어려워서,이동 어려움,차량 지원이 있으면 좋겠다,이동·차량 지원|건강관리 지원
R003,소규모 식사모임,3,사람들과 어울리고 싶어서,시간대,오전이면 좋겠다,식사 지원|말벗·정서 지원`;

describe('전체 파이프라인 (Mock Provider)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('프로젝트 생성부터 비교 리포트까지 동작한다', async () => {
    // 1) 프로젝트
    const project = await createProject({
      name: '통합테스트 프로젝트',
      targetPopulation: '65세 이상',
    });
    expect(project.id).toBeTruthy();

    // 2) CSV import (컬럼 자동 매핑)
    const parsed = parseCsv(CLIENT_CSV);
    const mapping = suggestMapping(parsed.headers);
    const { clients } = applyMapping(parsed.rows, mapping);
    const dataset = await createDataset({
      projectId: project.id,
      name: 'TestPersona',
      sourceMeta: { generation_method: 'csv_import', notes: '테스트' },
      clients,
    });
    expect(dataset.clientCount).toBe(5);

    const stored = await allClients(dataset.id);
    expect(stored).toHaveLength(5);
    expect(stored[0].personaSummary.length).toBeGreaterThan(10);

    // 같은 이름으로 다시 만들면 버전이 올라간다
    const v2 = await createDataset({
      projectId: project.id,
      name: 'TestPersona',
      sourceMeta: {},
      clients: clients.slice(0, 2),
    });
    expect(v2.version).toBe(2);

    // 세그먼트 필터 UI 가 쓰는 "실제 존재하는 값" 목록
    const householdValues = await datasetFieldValues(dataset.id, 'householdType');
    expect(householdValues.map((v) => v.value).sort()).toEqual(['독거', '부부']);
    expect(householdValues.reduce((a, v) => a + v.count, 0)).toBe(5);

    const ageValues = await datasetFieldValues(dataset.id, 'age');
    expect(ageValues.every((v) => /^\d+([-+]\d*)?$/.test(v.value))).toBe(true);
    expect(await datasetFieldValues(dataset.id, 'careNeed')).toEqual([]);

    // 3) 설문 생성
    const survey = await createSurvey({
      projectId: project.id,
      name: '통합테스트 설문',
      questions: DEMO_QUESTIONS,
    });
    expect(survey.version).toBe(1);
    expect(survey.questions).toHaveLength(6);

    // 4) Mock LLM 배치 실행 (반복 2회)
    const { runs } = await createRuns({
      projectId: project.id,
      surveyId: survey.id,
      datasetId: dataset.id,
      provider: 'mock',
      model: 'mock-deterministic-v1',
      temperature: 0.3,
      repeat: 2,
      concurrency: 3,
    });
    expect(runs).toHaveLength(2);

    for (const run of runs) await executeRun(run.id);

    const refreshed = await prisma.surveyRun.findUnique({ where: { id: runs[0].id } });
    expect(refreshed?.status).toBe('SUCCESS');
    expect(refreshed?.completedCount).toBe(5);
    expect(refreshed?.failedCount).toBe(0);

    // 5) 응답 저장 확인
    const responses = await loadRunResponses(runs[0].id);
    expect(responses).toHaveLength(5);
    expect(responses.every((r) => r.status === 'SUCCESS')).toBe(true);
    expect(Object.keys(responses[0].answers).length).toBeGreaterThanOrEqual(6);

    // 재실행해도 이미 완료된 응답은 유지된다
    await resumeRun(runs[0].id);
    const afterResume = await loadRunResponses(runs[0].id);
    expect(afterResume.filter((r) => r.status === 'SUCCESS')).toHaveLength(5);

    // 6) 분석
    const analysis = await analyzeRun(runs[0].id);
    expect(analysis).not.toBeNull();
    expect(analysis!.successCount).toBe(5);

    const q1 = analysis!.questions.find((x) => x.question.id === 'Q1');
    expect(q1?.distribution?.total).toBe(5);
    const sumPercent = (q1?.distribution?.items ?? []).reduce((a, b) => a + b.percent, 0);
    expect(sumPercent).toBeGreaterThan(99);

    const q3 = analysis!.questions.find((x) => x.question.id === 'Q3');
    expect(q3?.texts?.length).toBe(5);
    expect((q3?.keywords ?? []).length).toBeGreaterThan(0);

    // 반복 실행 안정성
    const stability = await analyzeStability(runs.map((r) => r.id));
    expect(stability?.runs).toHaveLength(2);
    expect(stability!.perQuestion.length).toBeGreaterThan(0);

    // 7) 실제 조사 import + 비교
    const actual = await importActualDataset({
      projectId: project.id,
      surveyId: survey.id,
      name: '실제 조사(테스트)',
      csv: ACTUAL_CSV,
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
    expect(actual.rowCount).toBe(3);

    const report = await createComparison({
      projectId: project.id,
      runId: runs[0].id,
      actualDatasetId: actual.id,
    });
    const loaded = await getComparison(report.id);
    expect(loaded?.parsed.comparisons.length).toBeGreaterThan(0);
    expect(loaded?.narrative).toContain('Synthetic');

    const choice = loaded!.parsed.comparisons.find((c) => c.questionId === 'Q1');
    if (choice?.type !== 'choice') throw new Error('Q1 비교 결과가 없습니다.');
    expect(choice.rows.length).toBeGreaterThan(0);
    expect(typeof choice.mae).toBe('number');

    // 8) 내보내기
    const responseCsv = await exportResponsesCsv(runs[0].id);
    expect(responseCsv).toContain('respondent_id');
    expect(parseCsv(responseCsv).rows).toHaveLength(5);

    const summaryCsv = await exportSummaryCsv(runs[0].id);
    expect(summaryCsv).toContain('question_id');
  });

  it('실행 기록이 있는 설문을 수정하면 새 버전이 생성된다', async () => {
    const project = await createProject({ name: '버전 테스트' });
    const dataset = await createDataset({
      projectId: project.id,
      name: 'VersionPersona',
      sourceMeta: {},
      clients: applyMapping(parseCsv(CLIENT_CSV).rows, suggestMapping(parseCsv(CLIENT_CSV).headers)).clients,
    });

    const survey = await createSurvey({
      projectId: project.id,
      name: '버전 테스트 설문',
      questions: DEMO_QUESTIONS,
    });

    // 실행 전 수정은 같은 버전을 유지한다
    const sameVersion = await createSurveyVersion(survey.id, {
      name: '버전 테스트 설문(수정)',
      questions: DEMO_QUESTIONS,
    });
    expect(sameVersion.version).toBe(1);

    const { runs } = await createRuns({
      projectId: project.id,
      surveyId: survey.id,
      datasetId: dataset.id,
      provider: 'mock',
      model: 'mock-deterministic-v1',
      temperature: 0.3,
      repeat: 1,
      concurrency: 2,
      limit: 2,
    });
    await executeRun(runs[0].id);

    const next = await createSurveyVersion(survey.id, {
      name: '버전 테스트 설문 v2',
      questions: [...DEMO_QUESTIONS, { id: 'Q7', type: 'open_text', question: '추가 의견' }],
    });
    expect(next.version).toBe(2);
    expect(next.questions).toHaveLength(7);

    // 기존 실행은 실행 당시 문항 수를 유지한다
    const analysis = await analyzeRun(runs[0].id);
    expect(analysis!.questions).toHaveLength(6);
    expect(analysis!.successCount).toBe(2);
  });
});
