import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/services/auditService';
import { safeParseJSON } from '@/lib/utils';
import type { ClientDraft } from '@/lib/clients/mapping';
import type { PlainClient, SourceMeta } from '@/lib/types';

/** DB row → 앱에서 쓰는 PlainClient */
export function toPlainClient(row: {
  id: string;
  localId: string;
  age: number | null;
  sex: string | null;
  province: string | null;
  district: string | null;
  householdType: string | null;
  maritalStatus: string | null;
  housingType: string | null;
  educationLevel: string | null;
  employmentStatus: string | null;
  economicStatus: string | null;
  healthStatus: string | null;
  mobilityDifficulty: string | null;
  digitalLiteracy: string | null;
  socialContactLevel: string | null;
  careNeed: string | null;
  currentServiceUse: string;
  attributes: string;
  personaSummary: string;
  sourceType: string;
  sourceMetadata: string;
}): PlainClient {
  return {
    id: row.id,
    localId: row.localId,
    age: row.age,
    sex: row.sex,
    province: row.province,
    district: row.district,
    householdType: row.householdType,
    maritalStatus: row.maritalStatus,
    housingType: row.housingType,
    educationLevel: row.educationLevel,
    employmentStatus: row.employmentStatus,
    economicStatus: row.economicStatus,
    healthStatus: row.healthStatus,
    mobilityDifficulty: row.mobilityDifficulty,
    digitalLiteracy: row.digitalLiteracy,
    socialContactLevel: row.socialContactLevel,
    careNeed: row.careNeed,
    currentServiceUse: safeParseJSON<string[]>(row.currentServiceUse, []),
    attributes: safeParseJSON<Record<string, unknown>>(row.attributes, {}),
    personaSummary: row.personaSummary,
    sourceType: row.sourceType,
    sourceMetadata: safeParseJSON<Record<string, unknown>>(row.sourceMetadata, {}),
  };
}

export interface CreateDatasetInput {
  projectId: string;
  name: string;
  description?: string;
  sourceMeta: SourceMeta;
  clients: ClientDraft[];
  /** 같은 이름의 데이터셋이 있으면 버전을 올린다 */
  bumpVersion?: boolean;
}

export async function createDataset(input: CreateDatasetInput) {
  const existing = await prisma.clientDataset.findFirst({
    where: { projectId: input.projectId, name: input.name },
    orderBy: { version: 'desc' },
  });
  const version = existing ? existing.version + 1 : 1;

  const dataset = await prisma.clientDataset.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      version,
      description: input.description ?? null,
      sourceMeta: JSON.stringify(input.sourceMeta ?? {}),
      clientCount: input.clients.length,
    },
  });

  // SQLite 는 대량 insert 를 청크로 나눠 처리한다.
  const CHUNK = 200;
  for (let i = 0; i < input.clients.length; i += CHUNK) {
    const chunk = input.clients.slice(i, i + CHUNK);
    await prisma.syntheticClient.createMany({
      data: chunk.map((c) => ({
        datasetId: dataset.id,
        projectId: input.projectId,
        localId: c.localId,
        age: c.age,
        sex: c.sex,
        province: c.province,
        district: c.district,
        householdType: c.householdType,
        maritalStatus: c.maritalStatus,
        housingType: c.housingType,
        educationLevel: c.educationLevel,
        employmentStatus: c.employmentStatus,
        economicStatus: c.economicStatus,
        healthStatus: c.healthStatus,
        mobilityDifficulty: c.mobilityDifficulty,
        digitalLiteracy: c.digitalLiteracy,
        socialContactLevel: c.socialContactLevel,
        careNeed: c.careNeed,
        currentServiceUse: JSON.stringify(c.currentServiceUse ?? []),
        attributes: JSON.stringify(c.attributes ?? {}),
        personaSummary: c.personaSummary ?? '',
        sourceType: c.sourceType ?? 'imported',
        sourceMetadata: JSON.stringify(c.sourceMetadata ?? {}),
      })),
    });
  }

  await logAudit(
    input.clients[0]?.sourceType === 'generated' ? 'DATASET_GENERATE' : 'DATASET_IMPORT',
    input.projectId,
    { datasetId: dataset.id, name: dataset.name, version, count: input.clients.length }
  );

  return dataset;
}

export async function listDatasets(projectId: string) {
  const rows = await prisma.clientDataset.findMany({
    where: { projectId },
    orderBy: [{ createdAt: 'desc' }],
  });
  return rows.map((d) => ({ ...d, sourceMeta: safeParseJSON<SourceMeta>(d.sourceMeta, {}) }));
}

export async function getDataset(id: string) {
  const dataset = await prisma.clientDataset.findUnique({ where: { id } });
  if (!dataset) return null;
  return { ...dataset, sourceMeta: safeParseJSON<SourceMeta>(dataset.sourceMeta, {}) };
}

export async function listClients(
  datasetId: string,
  options: { skip?: number; take?: number; search?: string } = {}
) {
  const where = {
    datasetId,
    ...(options.search
      ? {
          OR: [
            { localId: { contains: options.search } },
            { personaSummary: { contains: options.search } },
            { householdType: { contains: options.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.syntheticClient.findMany({
      where,
      orderBy: { localId: 'asc' },
      skip: options.skip ?? 0,
      take: options.take ?? 50,
    }),
    prisma.syntheticClient.count({ where }),
  ]);

  return { clients: rows.map(toPlainClient), total };
}

export async function getClient(id: string) {
  const row = await prisma.syntheticClient.findUnique({ where: { id } });
  return row ? toPlainClient(row) : null;
}

export async function allClients(datasetId: string): Promise<PlainClient[]> {
  const rows = await prisma.syntheticClient.findMany({
    where: { datasetId },
    orderBy: { localId: 'asc' },
  });
  return rows.map(toPlainClient);
}

export async function deleteDataset(id: string) {
  const dataset = await prisma.clientDataset.findUnique({ where: { id } });
  if (!dataset) return;
  await prisma.clientDataset.delete({ where: { id } });
  await logAudit('DATASET_DELETE', dataset.projectId, { name: dataset.name, version: dataset.version });
}

/** 데이터셋 속성 분포 요약 (목록 화면에서 구성 확인용) */
export async function datasetProfile(datasetId: string) {
  const clients = await allClients(datasetId);
  const fields = ['householdType', 'economicStatus', 'mobilityDifficulty', 'digitalLiteracy'] as const;

  const profile: { field: string; buckets: { value: string; count: number }[] }[] = [];
  for (const field of fields) {
    const counts = new Map<string, number>();
    for (const c of clients) {
      const v = (c[field] as string | null) ?? '(정보 없음)';
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    profile.push({
      field,
      buckets: [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
    });
  }

  const ages = clients.map((c) => c.age).filter((a): a is number => typeof a === 'number');
  return {
    total: clients.length,
    ageMin: ages.length ? Math.min(...ages) : null,
    ageMax: ages.length ? Math.max(...ages) : null,
    ageMean: ages.length ? Number((ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)) : null,
    profile,
  };
}
