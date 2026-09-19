import { prisma } from '@/lib/db';
import { buildNarrative, compareResponses, type ComparisonResult } from '@/lib/analytics/compare';
import { keywordFrequency, openTextAnswers } from '@/lib/analytics/aggregate';
import { loadActualResponses } from '@/lib/services/actualSurveyService';
import { loadRunResponses } from '@/lib/services/surveyRunService';
import { logAudit } from '@/lib/services/auditService';
import { safeParseJSON } from '@/lib/utils';
import type { AnswerMap, SurveyQuestion } from '@/lib/types';

export interface CreateComparisonInput {
  projectId: string;
  runId: string;
  actualDatasetId: string;
  title?: string;
}

/** 주관식 키워드 비교 (H2 검증용) */
function compareOpenText(
  questions: SurveyQuestion[],
  synthetic: { localId: string; status: string; answers: AnswerMap }[],
  actual: { respondentId: string; answers: AnswerMap }[]
) {
  const out: {
    questionId: string;
    question: string;
    synthetic: { keyword: string; count: number }[];
    actual: { keyword: string; count: number }[];
    shared: string[];
    syntheticOnly: string[];
    actualOnly: string[];
  }[] = [];

  for (const q of questions.filter((x) => x.type === 'open_text')) {
    const sTexts = openTextAnswers(
      q,
      synthetic.map((s) => ({ clientId: s.localId, localId: s.localId, status: s.status, answers: s.answers }))
    ).map((t) => t.text);
    const aTexts = actual
      .map((r) => r.answers[q.id])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

    if (sTexts.length === 0 && aTexts.length === 0) continue;

    const sKeys = keywordFrequency(sTexts, 12).map((k) => ({ keyword: k.keyword, count: k.count }));
    const aKeys = keywordFrequency(aTexts, 12).map((k) => ({ keyword: k.keyword, count: k.count }));
    const sSet = new Set(sKeys.map((k) => k.keyword));
    const aSet = new Set(aKeys.map((k) => k.keyword));

    out.push({
      questionId: q.id,
      question: q.question,
      synthetic: sKeys,
      actual: aKeys,
      shared: [...sSet].filter((k) => aSet.has(k)),
      syntheticOnly: [...sSet].filter((k) => !aSet.has(k)),
      actualOnly: [...aSet].filter((k) => !sSet.has(k)),
    });
  }

  return out;
}

export async function createComparison(input: CreateComparisonInput) {
  const run = await prisma.surveyRun.findUnique({
    where: { id: input.runId },
    include: { survey: true },
  });
  if (!run) throw new Error('Synthetic 실행 기록을 찾을 수 없습니다.');

  const actualDataset = await prisma.actualDataset.findUnique({ where: { id: input.actualDatasetId } });
  if (!actualDataset) throw new Error('실제 조사 데이터를 찾을 수 없습니다.');

  const questions = safeParseJSON<SurveyQuestion[]>(run.survey.questions, []);
  const syntheticAll = await loadRunResponses(input.runId);
  const synthetic = syntheticAll.filter((r) => r.status === 'SUCCESS');
  const actual = await loadActualResponses(input.actualDatasetId);

  const result = compareResponses(questions, synthetic, actual);
  const openText = compareOpenText(questions, synthetic, actual);
  const narrative = buildNarrative(result);

  const title =
    input.title?.trim() ||
    `Synthetic Client 사전조사 vs 실제 이용자 조사 — ${run.survey.name} v${run.surveyVersion}`;

  const report = await prisma.comparisonReport.create({
    data: {
      projectId: input.projectId,
      surveyId: run.surveyId,
      runId: input.runId,
      actualDatasetId: input.actualDatasetId,
      title,
      result: JSON.stringify({ ...result, openText }),
      narrative,
    },
  });

  await logAudit('COMPARISON_CREATE', input.projectId, {
    reportId: report.id,
    runId: input.runId,
    actualDatasetId: input.actualDatasetId,
  });

  return report;
}

export type StoredComparison = ComparisonResult & {
  openText?: ReturnType<typeof compareOpenText>;
};

export async function getComparison(id: string) {
  const report = await prisma.comparisonReport.findUnique({
    where: { id },
    include: {
      run: { include: { survey: true, dataset: true } },
      actualDataset: true,
      project: { select: { id: true, name: true } },
    },
  });
  if (!report) return null;

  return {
    ...report,
    parsed: safeParseJSON<StoredComparison>(report.result, {
      generatedAt: '',
      syntheticSample: 0,
      actualSample: 0,
      comparisons: [],
      skipped: [],
    }),
  };
}

export async function listComparisons(projectId: string) {
  return prisma.comparisonReport.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      run: { select: { id: true, modelProvider: true, modelName: true, repeatIndex: true } },
      actualDataset: { select: { name: true, rowCount: true } },
      survey: { select: { name: true, version: true } },
    },
  });
}

export async function deleteComparison(id: string) {
  await prisma.comparisonReport.delete({ where: { id } });
}
