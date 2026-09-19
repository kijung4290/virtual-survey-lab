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
import { analyzeConsistency, analyzeConstructs } from '@/lib/analytics/psychometrics';
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

/** 문항 이해도 점검 결과 (mode=comprehension 실행) */
export interface ComprehensionAnalysis {
  runId: string;
  surveyName: string;
  surveyVersion: number;
  provider: string;
  model: string;
  respondentCount: number;
  questions: {
    question: SurveyQuestion;
    n: number;
    /** 1(쉬움) ~ 5(어려움) 평균 */
    meanDifficulty: number;
    /** 4점 이상(어렵다)으로 답한 비율 */
    hardPercent: number;
    distribution: { value: number; count: number }[];
    hardWords: { word: string; count: number }[];
    /** 응답자들이 문항을 어떻게 읽었는지 */
    restatements: { localId: string; text: string; difficulty: number }[];
    /** 세그먼트(디지털 활용 수준)별 평균 난이도 */
    byDigitalLiteracy: { segment: string; n: number; meanDifficulty: number }[];
  }[];
}

export async function analyzeComprehension(runId: string): Promise<ComprehensionAnalysis | null> {
  const run = await prisma.surveyRun.findUnique({
    where: { id: runId },
    include: { survey: true },
  });
  if (!run || run.mode !== 'comprehension') return null;

  const questions = safeParseJSON<SurveyQuestion[]>(run.survey.questions, []);
  const responses = (await loadRunResponses(runId)).filter((r) => r.status === 'SUCCESS');

  const parsed = responses.map((r) => ({
    localId: r.localId,
    digitalLiteracy: r.client.digitalLiteracy ?? '(정보 없음)',
    items: r.answers as unknown as Record<string, { restated: string; difficulty: number; hardWords: string[] }>,
  }));

  const analyzed = questions.map((q) => {
    const rows = parsed
      .map((p) => ({ ...p, item: p.items?.[q.id] }))
      .filter((p) => p.item && typeof p.item.difficulty === 'number');

    const difficulties = rows.map((p) => p.item!.difficulty);
    const n = difficulties.length;
    const meanDifficulty = n ? Number((difficulties.reduce((a, b) => a + b, 0) / n).toFixed(2)) : 0;
    const hardPercent = n ? Number(((difficulties.filter((d) => d >= 4).length / n) * 100).toFixed(1)) : 0;

    const distribution = [1, 2, 3, 4, 5].map((value) => ({
      value,
      count: difficulties.filter((d) => d === value).length,
    }));

    const wordCounts = new Map<string, number>();
    for (const p of rows) {
      for (const w of p.item!.hardWords ?? []) {
        const key = w.trim();
        if (!key) continue;
        wordCounts.set(key, (wordCounts.get(key) ?? 0) + 1);
      }
    }

    const segments = new Map<string, number[]>();
    for (const p of rows) {
      const list = segments.get(p.digitalLiteracy) ?? [];
      list.push(p.item!.difficulty);
      segments.set(p.digitalLiteracy, list);
    }

    return {
      question: q,
      n,
      meanDifficulty,
      hardPercent,
      distribution,
      hardWords: [...wordCounts.entries()]
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      restatements: rows
        .sort((a, b) => b.item!.difficulty - a.item!.difficulty)
        .map((p) => ({ localId: p.localId, text: p.item!.restated, difficulty: p.item!.difficulty })),
      byDigitalLiteracy: [...segments.entries()]
        .map(([segment, values]) => ({
          segment,
          n: values.length,
          meanDifficulty: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
        }))
        .sort((a, b) => b.meanDifficulty - a.meanDifficulty),
    };
  });

  return {
    runId,
    surveyName: run.survey.name,
    surveyVersion: run.surveyVersion,
    provider: run.modelProvider,
    model: run.modelName,
    respondentCount: parsed.length,
    questions: analyzed,
  };
}

/** 척도 신뢰도·일관성 분석 (mode=answer 실행) */
export async function analyzePsychometrics(runId: string) {
  const run = await prisma.surveyRun.findUnique({ where: { id: runId }, include: { survey: true } });
  if (!run) return null;

  const questions = safeParseJSON<SurveyQuestion[]>(run.survey.questions, []);
  const responses = (await loadRunResponses(runId))
    .filter((r) => r.status === 'SUCCESS')
    .map((r) => ({ answers: r.answers as AnswerMap }));

  return {
    runId,
    surveyName: run.survey.name,
    surveyVersion: run.surveyVersion,
    provider: run.modelProvider,
    model: run.modelName,
    responseCount: responses.length,
    constructs: analyzeConstructs(questions, responses),
    consistency: analyzeConsistency(questions, responses),
  };
}
