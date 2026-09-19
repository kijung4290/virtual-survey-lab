import Link from 'next/link';
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { listRuns } from '@/lib/services/surveyRunService';
import { listBatches } from '@/lib/services/analysisService';
import { formatDateTime, formatDuration } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title="실행 기록" />
        <RequireProject />
      </div>
    );
  }

  const [runs, batches] = await Promise.all([listRuns(project), listBatches(project)]);
  const q = `?project=${project}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="실행 기록"
        description="각 실행은 사용한 모델·설문 버전·데이터셋 버전을 그대로 보관합니다."
        action={
          <LinkButton href={`/runs/new${q}`} variant="primary">
            새 실행
          </LinkButton>
        }
      />

      {batches.length > 0 && (
        <Card title="반복 실행 묶음" description="같은 설정으로 여러 번 실행한 결과의 안정성을 비교할 수 있습니다.">
          <ul className="space-y-2 text-sm">
            {batches.map((b) => (
              <li key={b.batchKey} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">
                  {b.surveyName} v{b.surveyVersion}
                </span>
                <span className="text-xs text-slate-500">{b.model}</span>
                <span className="text-xs text-slate-500">{b.runs.length}회 실행</span>
                <Link
                  href={`/analysis/stability${q}&runs=${b.runs.map((r) => r.id).join(',')}`}
                  className="text-blue-800 underline"
                >
                  안정성 비교 보기
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="전체 실행">
        {runs.length === 0 ? (
          <EmptyState title="실행 기록이 없습니다." action={<LinkButton href={`/runs/new${q}`}>새 실행</LinkButton>} />
        ) : (
          <Table caption="실행 기록">
            <thead>
              <tr>
                <Th>시작</Th>
                <Th>설문지</Th>
                <Th>데이터셋</Th>
                <Th>모델</Th>
                <Th>회차</Th>
                <Th>진행</Th>
                <Th>상태</Th>
                <Th>소요</Th>
                <Th>보기</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(r.startedAt)}</Td>
                  <Td>
                    {r.survey.name} v{r.surveyVersion}
                  </Td>
                  <Td>
                    {r.dataset.name} v{r.clientDatasetVersion}
                  </Td>
                  <Td className="text-xs">
                    {r.modelProvider} / {r.modelName}
                    <br />
                    <span className="text-slate-500">temp {r.temperature}</span>
                  </Td>
                  <Td>{r.repeatIndex}</Td>
                  <Td>
                    {r.completedCount}/{r.totalCount}
                    {r.failedCount > 0 && <span className="ml-1 text-xs text-red-700">실패 {r.failedCount}</span>}
                  </Td>
                  <Td>
                    <RunStatusBadge status={r.status} />
                  </Td>
                  <Td className="text-xs">
                    {r.completedAt ? formatDuration(r.completedAt.getTime() - r.startedAt.getTime()) : '-'}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Link href={`/runs/${r.id}${q}`} className="text-blue-800 underline">
                      진행
                    </Link>
                    {' · '}
                    <Link href={`/analysis/${r.id}${q}`} className="text-blue-800 underline">
                      분석
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
