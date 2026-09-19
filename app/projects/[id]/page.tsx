import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { getProject } from '@/lib/services/projectService';
import { listComparisons } from '@/lib/services/comparisonService';
import { formatDateTime, safeParseJSON } from '@/lib/utils';
import type { SourceMeta, SurveyQuestion } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const comparisons = await listComparisons(id);
  const q = `?project=${id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={
          <>
            {project.targetPopulation && <span className="mr-2">조사 대상: {project.targetPopulation}</span>}
            {project.description}
          </>
        }
        action={
          <>
            <LinkButton href={`/runs/new${q}`} variant="primary">
              설문 실행하기
            </LinkButton>
            <LinkButton href={`/api/export?type=project&id=${id}`}>프로젝트 백업(JSON)</LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Synthetic 데이터셋', project.datasets.length],
          ['설문지', project.surveys.length],
          ['실행 기록', project.runs.length],
          ['실제 조사 데이터', project.actualDatasets.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <Card
        title="Synthetic Client 데이터셋"
        description="데이터셋을 수정하면 새 버전으로 저장되어 기존 실행 결과가 바뀌지 않습니다."
        action={
          <>
            <LinkButton href={`/clients/import${q}`}>CSV 가져오기</LinkButton>
            <LinkButton href={`/clients/generate${q}`}>분포로 생성</LinkButton>
          </>
        }
      >
        {project.datasets.length === 0 ? (
          <EmptyState title="데이터셋이 없습니다." description="CSV 를 가져오거나 분포 입력으로 생성하세요." />
        ) : (
          <Table caption="데이터셋 목록">
            <thead>
              <tr>
                <Th>이름</Th>
                <Th>버전</Th>
                <Th className="text-right">인원</Th>
                <Th>출처</Th>
                <Th>생성일</Th>
              </tr>
            </thead>
            <tbody>
              {project.datasets.map((d) => {
                const meta = safeParseJSON<SourceMeta>(d.sourceMeta, {});
                return (
                  <tr key={d.id}>
                    <Td>
                      <Link href={`/clients/${d.id}${q}`} className="font-medium text-blue-800 underline">
                        {d.name}
                      </Link>
                    </Td>
                    <Td>v{d.version}</Td>
                    <Td className="text-right">{d.clientCount.toLocaleString()}명</Td>
                    <Td className="text-xs text-slate-600">
                      {[meta.base_source, meta.welfare_distribution_source, meta.generation_method]
                        .filter(Boolean)
                        .join(' · ') || '-'}
                    </Td>
                    <Td>{formatDateTime(d.createdAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        title="설문지"
        action={<LinkButton href={`/surveys/new${q}`}>설문지 만들기</LinkButton>}
      >
        {project.surveys.length === 0 ? (
          <EmptyState title="설문지가 없습니다." />
        ) : (
          <Table caption="설문지 목록">
            <thead>
              <tr>
                <Th>이름</Th>
                <Th>버전</Th>
                <Th className="text-right">문항</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {project.surveys.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <Link href={`/surveys/${s.id}${q}`} className="font-medium text-blue-800 underline">
                      {s.name}
                    </Link>
                  </Td>
                  <Td>v{s.version}</Td>
                  <Td className="text-right">
                    {safeParseJSON<SurveyQuestion[]>(s.questions, []).length}개
                  </Td>
                  <Td>{s.locked ? <Badge>이전 버전</Badge> : <Badge tone="success">현재 버전</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="최근 실행" action={<LinkButton href={`/runs${q}`}>전체 기록</LinkButton>}>
        {project.runs.length === 0 ? (
          <EmptyState title="실행 기록이 없습니다." />
        ) : (
          <Table caption="최근 실행">
            <thead>
              <tr>
                <Th>설문지</Th>
                <Th>모델</Th>
                <Th>진행</Th>
                <Th>상태</Th>
                <Th>시작</Th>
              </tr>
            </thead>
            <tbody>
              {project.runs.slice(0, 8).map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/analysis/${r.id}${q}`} className="text-blue-800 underline">
                      {r.survey.name} v{r.surveyVersion}
                    </Link>
                    {r.repeatIndex > 1 && <span className="ml-1 text-xs text-slate-500">({r.repeatIndex}회차)</span>}
                  </Td>
                  <Td className="text-xs">
                    {r.modelProvider} / {r.modelName}
                  </Td>
                  <Td>
                    {r.completedCount}/{r.totalCount}
                  </Td>
                  <Td>
                    <RunStatusBadge status={r.status} />
                  </Td>
                  <Td>{formatDateTime(r.startedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        title="실제 조사 비교"
        action={<LinkButton href={`/validation${q}`}>비교 화면 열기</LinkButton>}
      >
        {comparisons.length === 0 ? (
          <EmptyState
            title="비교 리포트가 없습니다."
            description="실제 조사 결과 CSV 를 업로드하면 Synthetic 결과와 비교할 수 있습니다."
          />
        ) : (
          <ul className="space-y-2 text-sm">
            {comparisons.map((c) => (
              <li key={c.id}>
                <Link href={`/validation/${c.id}${q}`} className="text-blue-800 underline">
                  {c.title}
                </Link>
                <span className="ml-2 text-xs text-slate-500">{formatDateTime(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Disclaimer />
    </div>
  );
}
