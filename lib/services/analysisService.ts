import { prisma } from '@/lib/db';
import {
  choiceDistribution,
  keywordFrequency,
  numericValues,
  openTextAnswers,
  scaleStats,
  segmentBreakdown,
  skewWarning,
  stabilityAcrossRuns,
  type AnalyzableResponse,
} from '@/lib/analytics/aggregate';
import { loadRunResponses } from '@/lib/services/surveyRunService';
import { safeParseJSON } from '@/lib/utils';
import type { AnswerMap, SurveyQuestion } from '@/lib/types';

export interface QuestionAnalysis {
  question: SurveyQuestion;
  /** 선택형 */
  distribution?: { total: number; items: { option: string; count: number; percent: number; rank: number }[] };
  warning?: string | null;
  /** 척도/숫자형 */
  stats?: ReturnType<typeof scaleStats>;
  /** 주관식 */
  texts?: { localId: string; text: string }[];
  keywords?: ReturnType<typeof keywordFrequency>;
}

export interface RunAnalysis {
  runId: string;
  surveyName: string;
  surveyVersion: number;
  datasetName: string;
  datasetVersion: number;
  provider: string;
  model: string;
  temperature: number;
  totalResponses: number;
  successCount: number;
  failedCount: number;
  questions: QuestionAnalysis[];
}

export async function analyzeRun(runId: string): Promise<RunAnalysis | null> {
  const run = await prisma.surveyRun.findUnique({
    where: { id: runId },
    include: { survey: true, dataset: true },
  });
  if (!run) return null;

  const questions = safeParseJSON<SurveyQuestion[]>(run.survey.questions, []);
  const all = await loadRunResponses(runId);
  const success = all.filter((r) => r.status === 'SUCCESS');

  const analyses: QuestionAnalysis[] = questions.map((q) => {
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      const distribution = choiceDistribution(q, success);
      return { question: q, distribution, warning: skewWarning(distribution.items) };
    }
    if (q.type === 'scale_5' || q.type === 'number') {
      return { question: q, stats: scaleStats(numericValues(q, success)) };
    }
    const texts = openTextAnswers(q, success as AnalyzableResponse[]).map((t) => ({
      localId: t.localId,
      text: t.text,
    }));
    return { question: q, texts, keywords: keywordFrequency(texts.map((t) => t.text)) };
  });

  return {
    runId,
    surveyName: run.survey.name,
    surveyVersion: run.surveyVersion,
    datasetName: run.dataset.name,
    datasetVersion: run.clientDatasetVersion,
    provider: run.modelProvider,
    model: run.modelName,
    temperature: run.temperature,
    totalResponses: all.length,
    successCount: success.length,
    failedCount: all.length - success.length,
    questions: analyses,
  };
}

/** 특정 문항의 세그먼트 분석 */
export async function analyzeSegment(runId: string, questionId: string, field: string) {
  const run = await prisma.surveyRun.findUnique({ where: { id: runId }, include: { survey: true } });
  if (!run) return null;

  const questions = safeParseJSON<SurveyQuestion[]>(run.survey.questions, []);
  const question = questions.find((q) => q.id === questionId);
  if (!question) return null;

  const responses = (await loadRunResponses(runId)).filter((r) => r.status === 'SUCCESS');
  const breakdown = segmentBreakdown(question, responses, field);

  return { question, field, ...breakdown };
}

/** 반복 실행 안정성 분석 (같은 batchKey 또는 지정한 run 목록) */
export async function analyzeStability(runIds: string[]) {
  if (runIds.length < 2) return null;

  const runs = await prisma.surveyRun.findMany({
    where: { id: { in: runIds } },
    include: { survey: true },
    orderBy: { startedAt: 'asc' },
  });
  if (runs.length < 2) return null;

  const questions = safeParseJSON<SurveyQuestion[]>(runs[0].survey.questions, []);

  const loaded = await Promise.all(
    runs.map(async (r) => ({
      runId: r.id,
      label: r.label || `실행 ${r.repeatIndex}`,
      responses: (await loadRunResponses(r.id))
        .filter((x) => x.status === 'SUCCESS')
        .map((x) => ({ answers: x.answers as AnswerMap })),
    }))
  );

  const perQuestion = questions
    .filter((q) => q.type !== 'open_text')
    .map((q) => ({ question: q, ...stabilityAcrossRuns(q, loaded) }));

  return {
    runs: loaded.map((l, i) => ({
      runId: l.runId,
      label: l.label,
      responseCount: l.responses.length,
      startedAt: runs[i].startedAt,
    })),
    perQuestion,
  };
}

/** 프로젝트의 반복 실행 묶음(batchKey) 목록 */
export async function listBatches(projectId: string) {
  const runs = await prisma.surveyRun.findMany({
    where: { projectId, batchKey: { not: null } },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      batchKey: true,
      repeatIndex: true,
      label: true,
      status: true,
      startedAt: true,
      surveyId: true,
      modelName: true,
      modelProvider: true,
      survey: { select: { name: true, version: true } },
    },
  });

  const groups = new Map<string, typeof runs>();
  for (const r of runs) {
    const key = r.batchKey!;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([batchKey, list]) => ({
      batchKey,
      runs: list.sort((a, b) => a.repeatIndex - b.repeatIndex),
      surveyName: list[0].survey.name,
      surveyVersion: list[0].survey.version,
      startedAt: list[0].startedAt,
      model: `${list[0].modelProvider} / ${list[0].modelName}`,
    }))
    .filter((g) => g.runs.length > 1);
}
