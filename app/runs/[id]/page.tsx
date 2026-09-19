import { notFound } from 'next/navigation';
import { Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { ResponseStatusBadge } from '@/components/RunStatusBadge';
import { RunProgress } from '@/components/RunProgress';
import { getRun, loadRunResponses } from '@/lib/services/surveyRunService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { id } = await params;
  const { project } = await searchParams;

  const run = await getRun(id);
  if (!run) notFound();

  const projectId = project ?? run.projectId;
  const responses = await loadRunResponses(id);
  const problems = responses.filter((r) => r.status !== 'SUCCESS');

  return (
    <div className="space-y-6">
      <PageHeader
        title="설문 실행"
        description={`${run.survey.name} v${run.surveyVersion} · ${run.dataset.name} v${run.clientDatasetVersion}`}
      />

      <Card title="진행 상황">
        <RunProgress runId={id} projectId={projectId} />
      </Card>

      <Card title="재현성 정보" description="같은 결과를 다시 만들거나 결과가 달라진 원인을 추적할 때 사용합니다.">
        <Table caption="실행 설정">
          <tbody>
            {[
              ['실행 ID', run.id],
              ['AI Provider', run.modelProvider],
              ['모델', run.modelName],
              ['Temperature', String(run.temperature)],
              ['프롬프트 템플릿 버전', run.promptTemplateVersion],
              ['설문 버전', `v${run.surveyVersion}`],
              ['데이터셋 버전', `v${run.clientDatasetVersion}`],
              ['반복 회차', `${run.repeatIndex}회차`],
              ['동시 실행 수', String(run.concurrency)],
              ['분당 최대 호출 수', run.requestsPerMinute > 0 ? `${run.requestsPerMinute}회` : '제한 없음'],
              ['세그먼트 필터', Object.keys(run.segmentFilter).length ? JSON.stringify(run.segmentFilter) : '없음(전체)'],
              ['시작', formatDateTime(run.startedAt)],
              ['완료', formatDateTime(run.completedAt)],
            ].map(([label, value]) => (
              <tr key={label}>
                <Th className="w-56">{label}</Th>
                <Td className="font-mono text-xs">{value}</Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-blue-800">System Prompt 보기</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            {run.systemPrompt}
          </pre>
        </details>
      </Card>

      {problems.length > 0 && (
        <Card title={`처리되지 않은 응답 (${problems.length}건)`} description="재실행하면 이 항목만 다시 호출합니다.">
          <Table caption="실패 응답 목록">
            <thead>
              <tr>
                <Th>응답자</Th>
                <Th>상태</Th>
                <Th className="text-right">시도</Th>
                <Th>오류 내용</Th>
              </tr>
            </thead>
            <tbody>
              {problems.slice(0, 50).map((r) => (
                <tr key={r.clientId}>
                  <Td className="font-mono text-xs">{r.localId}</Td>
                  <Td>
                    <ResponseStatusBadge status={r.status} />
                  </Td>
                  <Td className="text-right">{r.attempts}</Td>
                  <Td className="max-w-md text-xs text-slate-600">{r.errorMessage ?? '-'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {problems.length > 50 && (
            <p className="mt-2 text-xs text-slate-500">상위 50건만 표시했습니다.</p>
          )}
        </Card>
      )}

      <Disclaimer />
    </div>
  );
}
