import { prisma } from '@/lib/db';
import { safeParseJSON } from '@/lib/utils';

/** 감사 로그 (PRD 38장) — 연구 재현성을 위한 변경 기록 */
export const AUDIT_ACTIONS = {
  PROJECT_CREATE: '프로젝트 생성',
  PROJECT_UPDATE: '프로젝트 수정',
  PROJECT_DELETE: '프로젝트 삭제',
  DATASET_IMPORT: 'Synthetic Client 가져오기',
  DATASET_GENERATE: 'Synthetic Client 생성',
  DATASET_DELETE: 'Dataset 삭제',
  SURVEY_CREATE: '설문지 생성',
  SURVEY_UPDATE: '설문지 새 버전 생성',
  RUN_START: '설문 실행 시작',
  RUN_COMPLETE: '설문 실행 완료',
  RUN_RESUME: '설문 실행 재시도',
  RUN_DELETE: '실행 기록 삭제',
  ACTUAL_IMPORT: '실제 조사 결과 가져오기',
  ACTUAL_DELETE: '실제 조사 결과 삭제',
  COMPARISON_CREATE: '비교 리포트 생성',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export async function logAudit(
  action: AuditAction,
  projectId: string | null,
  detail: Record<string, unknown> = {}
) {
  await prisma.auditLog.create({
    data: { action, projectId, detail: JSON.stringify(detail) },
  });
}

export async function listAudit(projectId?: string, limit = 200) {
  const rows = await prisma.auditLog.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { project: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actionLabel: AUDIT_ACTIONS[r.action as AuditAction] ?? r.action,
    projectName: r.project?.name ?? null,
    detail: safeParseJSON<Record<string, unknown>>(r.detail, {}),
    createdAt: r.createdAt,
  }));
}
