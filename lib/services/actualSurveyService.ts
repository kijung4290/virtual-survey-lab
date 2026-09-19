import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/services/auditService';
import { parseCsv } from '@/lib/import/csv';
import { scanColumns, scanValues } from '@/lib/privacy/detect';
import { coerceAnswer } from '@/lib/survey/schema';
import { getSurvey } from '@/lib/services/surveyService';
import { safeParseJSON } from '@/lib/utils';
import type { AnswerMap, SurveyQuestion } from '@/lib/types';

/**
 * 실제(사람) 설문 결과 처리.
 *
 * 중요: 이 데이터는 로컬 DB 에만 저장하고 외부 LLM 으로 전송하지 않는다.
 * 업로드 전 개인 식별정보 컬럼을 탐지해 차단/경고한다.
 */

export interface ActualImportPreview {
  headers: string[];
  rowCount: number;
  sample: Record<string, string>[];
  privacy: ReturnType<typeof scanColumns>;
  valueSuspects: string[];
  /** 컬럼 → 문항 ID 자동 추천 */
  suggestedMap: Record<string, string>;
}

export function previewActualCsv(csv: string, questions: SurveyQuestion[]): ActualImportPreview {
  const parsed = parseCsv(csv);
  const privacy = scanColumns(parsed.headers);
  const valueSuspects = scanValues(parsed.rows);

  const suggestedMap: Record<string, string> = {};
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s._-]/g, '');
  for (const h of parsed.headers) {
    const n = norm(h);
    if (['respondentid', 'id', 'no', '번호', '응답자'].includes(n)) {
      suggestedMap[h] = '__respondent_id__';
      continue;
    }
    const byId = questions.find((q) => norm(q.id) === n);
    if (byId) {
      suggestedMap[h] = byId.id;
      continue;
    }
    const byText = questions.find((q) => norm(q.question).includes(n) || n.includes(norm(q.id)));
    suggestedMap[h] = byText ? byText.id : '';
  }

  return {
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    sample: parsed.rows.slice(0, 5),
    privacy,
    valueSuspects,
    suggestedMap,
  };
}

export interface ImportActualInput {
  projectId: string;
  surveyId: string;
  name: string;
  surveyDate?: string;
  notes?: string;
  csv: string;
  /** CSV 컬럼 → 문항 ID ('__respondent_id__' 는 응답자 식별번호) */
  columnMap: Record<string, string>;
}

export async function importActualDataset(input: ImportActualInput) {
  const survey = await getSurvey(input.surveyId);
  if (!survey) throw new Error('비교 대상 설문지를 찾을 수 없습니다.');

  const parsed = parseCsv(input.csv);
  const privacy = scanColumns(Object.keys(input.columnMap).filter((c) => input.columnMap[c] !== ''));
  if (privacy.hasBlocked) {
    throw new Error(
      `개인 식별정보로 의심되는 컬럼이 포함되어 있어 업로드를 중단했습니다: ${privacy.blocked
        .map((b) => b.column)
        .join(', ')}`
    );
  }

  const qById = new Map(survey.questions.map((q) => [q.id, q]));

  const dataset = await prisma.actualDataset.create({
    data: {
      projectId: input.projectId,
      name: input.name.trim(),
      surveyDate: input.surveyDate?.trim() || null,
      notes: input.notes?.trim() || null,
      columnMap: JSON.stringify(input.columnMap),
      rowCount: parsed.rows.length,
    },
  });

  let index = 0;
  const records: { datasetId: string; respondentId: string; answers: string }[] = [];

  for (const row of parsed.rows) {
    index += 1;
    let respondentId = `R-${String(index).padStart(4, '0')}`;
    const answers: AnswerMap = {};

    for (const [col, target] of Object.entries(input.columnMap)) {
      if (!target) continue;
      const raw = row[col];
      if (raw === undefined || raw === '') continue;

      if (target === '__respondent_id__') {
        respondentId = raw;
        continue;
      }
      const q = qById.get(target);
      if (!q) continue;
      const value = coerceAnswer(q, raw);
      if (value !== null) answers[q.id] = value;
    }

    records.push({ datasetId: dataset.id, respondentId, answers: JSON.stringify(answers) });
  }

  const CHUNK = 200;
  for (let i = 0; i < records.length; i += CHUNK) {
    await prisma.actualResponse.createMany({ data: records.slice(i, i + CHUNK) });
  }

  await logAudit('ACTUAL_IMPORT', input.projectId, {
    datasetId: dataset.id,
    name: dataset.name,
    rowCount: records.length,
  });

  return dataset;
}

export async function listActualDatasets(projectId: string) {
  return prisma.actualDataset.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { responses: true } } },
  });
}

export async function loadActualResponses(datasetId: string) {
  const rows = await prisma.actualResponse.findMany({ where: { datasetId }, orderBy: { id: 'asc' } });
  return rows.map((r) => ({
    respondentId: r.respondentId,
    answers: safeParseJSON<AnswerMap>(r.answers, {}),
  }));
}

export async function deleteActualDataset(id: string) {
  const dataset = await prisma.actualDataset.findUnique({ where: { id } });
  if (!dataset) return;
  await prisma.actualDataset.delete({ where: { id } });
  await logAudit('ACTUAL_DELETE', dataset.projectId, { name: dataset.name });
}
