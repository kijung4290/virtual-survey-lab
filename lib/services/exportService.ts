import { prisma } from '@/lib/db';
import { toCsv } from '@/lib/import/csv';
import { answerToDisplay, choiceDistribution, numericValues, scaleStats } from '@/lib/analytics/aggregate';
import { allClients } from '@/lib/services/clientDatasetService';
import { loadRunResponses } from '@/lib/services/surveyRunService';
import { getComparison } from '@/lib/services/comparisonService';
import { loadActualResponses } from '@/lib/services/actualSurveyService';
import { safeParseJSON } from '@/lib/utils';
import type { SurveyQuestion } from '@/lib/types';

/** Synthetic Client CSV */
export async function exportClientsCsv(datasetId: string) {
  const clients = await allClients(datasetId);
  const extraKeys = [...new Set(clients.flatMap((c) => Object.keys(c.attributes)))];

  const headers = [
    'id',
    'age',
    'sex',
    'province',
    'district',
    'household_type',
    'marital_status',
    'housing_type',
    'education_level',
    'employment_status',
    'economic_status',
    'health_status',
    'mobility_difficulty',
    'digital_literacy',
    'social_contact',
    'care_need',
    'current_service_use',
    'persona_summary',
    'source_type',
    ...extraKeys,
  ];

  const rows = clients.map((c) => [
    c.localId,
    c.age,
    c.sex,
    c.province,
    c.district,
    c.householdType,
    c.maritalStatus,
    c.housingType,
    c.educationLevel,
    c.employmentStatus,
    c.economicStatus,
    c.healthStatus,
    c.mobilityDifficulty,
    c.digitalLiteracy,
    c.socialContactLevel,
    c.careNeed,
    c.currentServiceUse.join('|'),
    c.personaSummary.replace(/\n/g, ' '),
    c.sourceType,
    ...extraKeys.map((k) => (c.attributes[k] === undefined ? '' : String(c.attributes[k]))),
  ]);

  return toCsv(headers, rows);
}

/** Survey JSON */
export async function exportSurveyJson(surveyId: string) {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) throw new Error('설문지를 찾을 수 없습니다.');
  return JSON.stringify(
    {
      name: survey.name,
      description: survey.description,
      version: survey.version,
      questions: safeParseJSON<SurveyQuestion[]>(survey.questions, []),
      exportedAt: new Date().toISOString(),
      notice: '이 설문지는 Synthetic Client Survey Lab 에서 내보낸 정의 파일입니다.',
    },
    null,
    2
  );
}

/** 응답 전체 CSV (응답자 속성 + 문항별 응답) */
export async function exportResponsesCsv(runId: string) {
  const run = await prisma.surveyRun.findUnique({ where: { id: runId }, include: { survey: true } });
  if (!run) throw new Error('실행 기록을 찾을 수 없습니다.');

  const questions = safeParseJSON<SurveyQuestion[]>(run.survey.questions, []);
  const responses = await loadRunResponses(runId);

  const headers = [
    'respondent_id',
    'status',
    'attempts',
    'age',
    'sex',
    'household_type',
    'economic_status',
    'mobility_difficulty',
    'digital_literacy',
    'social_contact',
    ...questions.map((q) => q.id),
    'error',
  ];

  const rows = responses.map((r) => [
    r.localId,
    r.status,
    r.attempts,
    r.client.age,
    r.client.sex,
    r.client.householdType,
    r.client.economicStatus,
    r.client.mobilityDifficulty,
    r.client.digitalLiteracy,
    r.client.socialContactLevel,
    ...questions.map((q) => answerToDisplay(r.answers[q.id] ?? null)),
    r.errorMessage ?? '',
  ]);

  return toCsv(headers, rows);
}

/** 문항별 요약 CSV */
export async function exportSummaryCsv(runId: string) {
  const run = await prisma.surveyRun.findUnique({ where: { id: runId }, include: { survey: true } });
  if (!run) throw new Error('실행 기록을 찾을 수 없습니다.');

  const questions = safeParseJSON<SurveyQuestion[]>(run.survey.questions, []);
  const responses = (await loadRunResponses(runId)).filter((r) => r.status === 'SUCCESS');

  const headers = ['question_id', 'question', 'type', 'metric', 'label', 'value'];
  const rows: (string | number)[][] = [];

  for (const q of questions) {
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      const dist = choiceDistribution(q, responses);
      for (const item of dist.items) {
        rows.push([q.id, q.question, q.type, 'count', item.option, item.count]);
        rows.push([q.id, q.question, q.type, 'percent', item.option, item.percent]);
      }
    } else if (q.type === 'scale_5' || q.type === 'number') {
      const stats = scaleStats(numericValues(q, responses));
      rows.push([q.id, q.question, q.type, 'n', '-', stats.n]);
      rows.push([q.id, q.question, q.type, 'mean', '-', stats.mean]);
      rows.push([q.id, q.question, q.type, 'median', '-', stats.median]);
      rows.push([q.id, q.question, q.type, 'sd', '-', stats.sd]);
      for (const d of stats.distribution) {
        rows.push([q.id, q.question, q.type, 'count', String(d.value), d.count]);
      }
    } else {
      const texts = responses
        .map((r) => r.answers[q.id])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
      rows.push([q.id, q.question, q.type, 'response_count', '-', texts.length]);
    }
  }

  return toCsv(headers, rows);
}

/** 비교 리포트 CSV */
export async function exportComparisonCsv(reportId: string) {
  const report = await getComparison(reportId);
  if (!report) throw new Error('비교 리포트를 찾을 수 없습니다.');

  const headers = [
    'question_id',
    'question',
    'option',
    'synthetic_percent',
    'actual_percent',
    'gap_pp',
    'synthetic_rank',
    'actual_rank',
    'rank_diff',
  ];
  const rows: (string | number)[][] = [];

  for (const c of report.parsed.comparisons) {
    if (c.type === 'choice') {
      for (const r of c.rows) {
        rows.push([
          c.questionId,
          c.question,
          r.option,
          r.syntheticPercent,
          r.actualPercent,
          r.gapPp,
          r.syntheticRank,
          r.actualRank,
          r.rankDiff,
        ]);
      }
      rows.push([c.questionId, c.question, 'MAE(%p)', c.mae, '', '', '', '', '']);
      if (c.spearman !== null) {
        rows.push([c.questionId, c.question, 'Spearman', c.spearman, '', '', '', '', '']);
      }
    } else {
      rows.push([
        c.questionId,
        c.question,
        '척도 평균',
        c.syntheticMean,
        c.actualMean,
        c.meanDiff,
        '',
        '',
        '',
      ]);
    }
  }

  return toCsv(headers, rows);
}

/** 전체 프로젝트 JSON 백업 */
export async function exportProjectJson(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      datasets: true,
      surveys: true,
      runs: { include: { responses: true } },
      actualDatasets: { include: { responses: true } },
      comparisons: true,
    },
  });
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const clients = await prisma.syntheticClient.findMany({ where: { projectId } });

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      notice:
        '이 파일은 Synthetic Client Survey Lab 백업입니다. Synthetic 응답은 AI 시뮬레이션 결과이며 실제 이용자 조사 결과가 아닙니다.',
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        targetPopulation: project.targetPopulation,
        createdAt: project.createdAt,
      },
      datasets: project.datasets,
      clients,
      surveys: project.surveys,
      runs: project.runs,
      actualDatasets: project.actualDatasets,
      comparisons: project.comparisons,
    },
    null,
    2
  );
}

/** 실제 조사 응답 CSV (로컬 백업용) */
export async function exportActualCsv(datasetId: string) {
  const dataset = await prisma.actualDataset.findUnique({ where: { id: datasetId } });
  if (!dataset) throw new Error('실제 조사 데이터를 찾을 수 없습니다.');
  const responses = await loadActualResponses(datasetId);
  const keys = [...new Set(responses.flatMap((r) => Object.keys(r.answers)))];
  const headers = ['respondent_id', ...keys];
  const rows = responses.map((r) => [r.respondentId, ...keys.map((k) => answerToDisplay(r.answers[k] ?? null))]);
  return toCsv(headers, rows);
}
