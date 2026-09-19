import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/services/auditService';
import { validateSurveyQuestions } from '@/lib/survey/schema';
import { safeParseJSON } from '@/lib/utils';
import type { SurveyQuestion } from '@/lib/types';

export interface SurveyInput {
  projectId: string;
  name: string;
  description?: string | null;
  questions: unknown;
}

export interface SurveyWithQuestions {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  version: number;
  lineageId: string;
  locked: boolean;
  questions: SurveyQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

function hydrate(row: {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  version: number;
  lineageId: string;
  locked: boolean;
  questions: string;
  createdAt: Date;
  updatedAt: Date;
}): SurveyWithQuestions {
  return { ...row, questions: safeParseJSON<SurveyQuestion[]>(row.questions, []) };
}

export async function createSurvey(input: SurveyInput) {
  const validation = validateSurveyQuestions(input.questions);
  if (!validation.ok) {
    throw new Error(validation.errors.join('\n'));
  }

  const survey = await prisma.survey.create({
    data: {
      projectId: input.projectId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      version: 1,
      lineageId: '',
      questions: JSON.stringify(validation.questions),
    },
  });

  // lineageId 는 첫 버전의 id 를 사용한다.
  const updated = await prisma.survey.update({
    where: { id: survey.id },
    data: { lineageId: survey.id },
  });

  await logAudit('SURVEY_CREATE', input.projectId, {
    surveyId: survey.id,
    name: survey.name,
    questionCount: validation.questions.length,
  });

  return hydrate(updated);
}

/**
 * 설문 수정 = 새 버전 생성 (PRD 40장).
 * 기존 응답은 기존 버전을 그대로 유지한다.
 */
export async function createSurveyVersion(surveyId: string, input: Omit<SurveyInput, 'projectId'>) {
  const base = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!base) throw new Error('설문지를 찾을 수 없습니다.');

  const validation = validateSurveyQuestions(input.questions);
  if (!validation.ok) throw new Error(validation.errors.join('\n'));

  const latest = await prisma.survey.findFirst({
    where: { lineageId: base.lineageId },
    orderBy: { version: 'desc' },
  });

  const runCount = await prisma.surveyRun.count({ where: { surveyId: base.id } });

  // 아직 실행된 적 없는 버전은 새 버전을 만들지 않고 그대로 수정한다.
  if (runCount === 0) {
    const updated = await prisma.survey.update({
      where: { id: base.id },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        questions: JSON.stringify(validation.questions),
      },
    });
    await logAudit('SURVEY_UPDATE', base.projectId, {
      surveyId: base.id,
      version: base.version,
      mode: 'in-place(실행 기록 없음)',
    });
    return hydrate(updated);
  }

  const created = await prisma.survey.create({
    data: {
      projectId: base.projectId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      version: (latest?.version ?? base.version) + 1,
      lineageId: base.lineageId,
      questions: JSON.stringify(validation.questions),
    },
  });

  await prisma.survey.update({ where: { id: base.id }, data: { locked: true } });

  await logAudit('SURVEY_UPDATE', base.projectId, {
    surveyId: created.id,
    fromVersion: base.version,
    toVersion: created.version,
    mode: 'new-version',
  });

  return hydrate(created);
}

export async function listSurveys(projectId: string) {
  const rows = await prisma.survey.findMany({
    where: { projectId },
    orderBy: [{ lineageId: 'asc' }, { version: 'desc' }],
    include: { _count: { select: { runs: true } } },
  });
  return rows.map((r) => ({ ...hydrate(r), runCount: r._count.runs }));
}

export async function getSurvey(id: string) {
  const row = await prisma.survey.findUnique({ where: { id } });
  return row ? hydrate(row) : null;
}

export async function getSurveyVersions(lineageId: string) {
  const rows = await prisma.survey.findMany({
    where: { lineageId },
    orderBy: { version: 'desc' },
  });
  return rows.map(hydrate);
}

export async function deleteSurvey(id: string) {
  const survey = await prisma.survey.findUnique({ where: { id } });
  if (!survey) return;
  await prisma.survey.delete({ where: { id } });
}
