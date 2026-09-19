import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/services/auditService';

export interface ProjectInput {
  name: string;
  description?: string | null;
  targetPopulation?: string | null;
}

export async function listProjects() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { datasets: true, surveys: true, runs: true, actualDatasets: true } },
    },
  });

  // 프로젝트별 Synthetic Client 수 합계
  const counts = await prisma.clientDataset.groupBy({
    by: ['projectId'],
    _sum: { clientCount: true },
  });
  const countMap = new Map(counts.map((c) => [c.projectId, c._sum.clientCount ?? 0]));

  return projects.map((p) => ({
    ...p,
    clientTotal: countMap.get(p.id) ?? 0,
  }));
}

export async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      datasets: { orderBy: [{ name: 'asc' }, { version: 'desc' }] },
      surveys: { orderBy: [{ createdAt: 'desc' }] },
      actualDatasets: { orderBy: { createdAt: 'desc' } },
      runs: {
        orderBy: { startedAt: 'desc' },
        include: { survey: { select: { name: true, version: true } } },
      },
    },
  });
}

export async function createProject(input: ProjectInput) {
  const project = await prisma.project.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      targetPopulation: input.targetPopulation?.trim() || null,
    },
  });
  await logAudit('PROJECT_CREATE', project.id, { name: project.name });
  return project;
}

export async function updateProject(id: string, input: ProjectInput) {
  const project = await prisma.project.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      targetPopulation: input.targetPopulation?.trim() || null,
    },
  });
  await logAudit('PROJECT_UPDATE', id, { name: project.name });
  return project;
}

export async function deleteProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  await prisma.project.delete({ where: { id } });
  await logAudit('PROJECT_DELETE', null, { name: project?.name, projectId: id });
}

/** 대시보드 요약 (PRD 23장) */
export async function dashboardSummary(projectId?: string) {
  const where = projectId ? { projectId } : {};

  const [clientAgg, surveys, runs, actualCount, projectCount] = await Promise.all([
    prisma.clientDataset.aggregate({ where, _sum: { clientCount: true } }),
    prisma.survey.findMany({ where, select: { questions: true } }),
    prisma.surveyRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        totalCount: true,
        completedCount: true,
        failedCount: true,
        startedAt: true,
        completedAt: true,
        modelProvider: true,
        modelName: true,
      },
    }),
    prisma.actualDataset.count({ where }),
    prisma.project.count(),
  ]);

  const questionCount = surveys.reduce((acc, s) => {
    try {
      return acc + (JSON.parse(s.questions) as unknown[]).length;
    } catch {
      return acc;
    }
  }, 0);

  const finished = runs.filter((r) => r.completedAt && r.status === 'SUCCESS');
  const avgDurationMs =
    finished.length === 0
      ? null
      : finished.reduce((acc, r) => acc + (r.completedAt!.getTime() - r.startedAt.getTime()), 0) /
        finished.length;

  const latestRun = runs[0] ?? null;

  return {
    projectCount,
    clientTotal: clientAgg._sum.clientCount ?? 0,
    surveyCount: surveys.length,
    questionCount,
    runCount: runs.length,
    latestRun,
    completed: latestRun ? latestRun.completedCount : 0,
    total: latestRun ? latestRun.totalCount : 0,
    avgDurationMs,
    actualCount,
  };
}
