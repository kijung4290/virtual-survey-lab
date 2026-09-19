import Link from 'next/link';
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { ComparisonCreator } from '@/components/forms/ComparisonCreator';
import { listActualDatasets } from '@/lib/services/actualSurveyService';
import { listComparisons } from '@/lib/services/comparisonService';
import { listRuns } from '@/lib/services/surveyRunService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ValidationPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title="실제 조사 비교" />
        <RequireProject />
      </div>
    );
  }

  const [runs, actuals, comparisons] = await Promise.all([
    listRuns(project),
    listActualDatasets(project),
    listComparisons(project),
  ]);
  const q = `?project=${project}`;
  const usableRuns = runs.filter((r) => r.completedCount > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="실제 조사 비교 (Validation Experiment)"
        description="Synthetic Client 사전조사 결과와 실제 이용자 조사 결과의 차이를 확인합니다."
        action={
          <LinkButton href={`/validation/import${q}`} variant="primary">
            실제 조사 결과 업로드
          </LinkButton>
        }
      />

      <Card title="비교 리포트 만들기">
        <ComparisonCreator
          projectId={project}
          runs={usableRuns.map((r) => ({
            id: r.id,
            label: `${r.survey.name} v${r.surveyVersion} · ${r.modelProvider}/${r.modelName} · ${r.completedCount}명 (${formatDateTime(r.startedAt)})`,
          }))}
          actualDatasets={actuals.map((a) => ({
            id: a.id,
            label: `${a.name} · ${a._count.responses}건${a.surveyDate ? ` (${a.surveyDate})` : ''}`,
          }))}
        />
      </Card>

      <Card title="업로드된 실제 조사 결과" description="이 데이터는 로컬에만 저장되며 외부 AI 모델로 전송되지 않습니다.">
        {actuals.length === 0 ? (
          <EmptyState
            title="업로드된 실제 조사 결과가 없습니다."
            description="익명화된 CSV 만 업로드하세요."
            action={<LinkButton href={`/validation/import${q}`} variant="primary">업로드하기</LinkButton>}
          />
        ) : (
          <Table caption="실제 조사 결과 목록">
            <thead>
              <tr>
                <Th>이름</Th>
                <Th>조사 시점</Th>
                <Th className="text-right">응답 수</Th>
                <Th>비고</Th>
                <Th>업로드</Th>
                <Th>내보내기</Th>
              </tr>
            </thead>
            <tbody>
              {actuals.map((a) => (
                <tr key={a.id}>
                  <Td>{a.name}</Td>
                  <Td>{a.surveyDate ?? '-'}</Td>
                  <Td className="text-right">{a._count.responses.toLocaleString()}</Td>
                  <Td className="text-xs text-slate-600">{a.notes ?? '-'}</Td>
                  <Td>{formatDateTime(a.createdAt)}</Td>
                  <Td>
                    <a className="text-blue-800 underline" href={`/api/export?type=actual&id=${a.id}`}>
                      CSV
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="비교 리포트">
        {comparisons.length === 0 ? (
          <EmptyState title="아직 비교 리포트가 없습니다." />
        ) : (
          <Table caption="비교 리포트 목록">
            <thead>
              <tr>
                <Th>제목</Th>
                <Th>Synthetic 실행</Th>
                <Th>실제 조사</Th>
                <Th>생성일</Th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/validation/${c.id}${q}`} className="font-medium text-blue-800 underline">
                      {c.title}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {c.run.modelProvider}/{c.run.modelName}
                  </Td>
                  <Td className="text-xs">
                    {c.actualDataset.name} ({c.actualDataset.rowCount}건)
                  </Td>
                  <Td>{formatDateTime(c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
