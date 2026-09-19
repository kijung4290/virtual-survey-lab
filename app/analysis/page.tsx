import Link from 'next/link';
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { listRuns } from '@/lib/services/surveyRunService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AnalysisIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title="결과 분석" />
        <RequireProject />
      </div>
    );
  }

  const runs = (await listRuns(project)).filter((r) => r.completedCount > 0);
  const q = `?project=${project}`;

  return (
    <div className="space-y-6">
      <PageHeader title="결과 분석" description="분석할 실행을 선택하세요." />

      <Card title="분석 가능한 실행">
        {runs.length === 0 ? (
          <EmptyState
            title="분석할 결과가 없습니다."
            description="설문을 실행하면 이곳에서 결과를 볼 수 있습니다."
            action={<LinkButton href={`/runs/new${q}`} variant="primary">설문 실행하기</LinkButton>}
          />
        ) : (
          <Table caption="분석 가능한 실행 목록">
            <thead>
              <tr>
                <Th>실행 일시</Th>
                <Th>설문지</Th>
                <Th>모델</Th>
                <Th>응답 수</Th>
                <Th>상태</Th>
                <Th>분석</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(r.startedAt)}</Td>
                  <Td>
                    {r.survey.name} v{r.surveyVersion}
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
                  <Td>
                    <Link href={`/analysis/${r.id}${q}`} className="text-blue-800 underline">
                      결과 보기
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
