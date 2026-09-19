import { Card, EmptyState, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { SeriesBarChart } from '@/components/charts/SeriesBarChart';
import { analyzeStability } from '@/lib/services/analysisService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; runs?: string }>;
}) {
  const { runs } = await searchParams;
  const runIds = (runs ?? '').split(',').filter(Boolean);
  const result = runIds.length >= 2 ? await analyzeStability(runIds) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="반복 실행 안정성"
        description="같은 설문·같은 패널을 여러 번 실행했을 때 결과가 얼마나 일관적인지 확인합니다."
      />

      {!result ? (
        <EmptyState
          title="비교할 실행이 2개 이상 필요합니다."
          description="설문 실행 시 '반복 실행 횟수'를 2회 이상으로 지정하면 자동으로 묶여 이 화면에서 비교할 수 있습니다."
        />
      ) : (
        <>
          <Disclaimer />

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="비교 실행 수" value={`${result.runs.length}회`} />
            <StatCard
              label="최대 변동폭"
              value={`${Math.max(
                0,
                ...result.perQuestion.map((p) => p.maxRange)
              )}%p`}
              sub="선택지 비율 기준"
            />
            <StatCard label="비교 문항" value={`${result.perQuestion.length}개`} />
          </div>

          <Card title="비교 대상 실행">
            <Table caption="비교 대상 실행 목록">
              <thead>
                <tr>
                  <Th>실행</Th>
                  <Th>시작 시각</Th>
                  <Th className="text-right">유효 응답</Th>
                </tr>
              </thead>
              <tbody>
                {result.runs.map((r) => (
                  <tr key={r.runId}>
                    <Td>{r.label}</Td>
                    <Td>{formatDateTime(r.startedAt)}</Td>
                    <Td className="text-right">{r.responseCount.toLocaleString()}명</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {result.perQuestion.map((p) => (
            <Card key={p.question.id} title={`${p.question.id}. ${p.question.question}`}>
              {p.question.type === 'scale_5' || p.question.type === 'number' ? (
                <Table caption="실행별 평균">
                  <thead>
                    <tr>
                      <Th>실행</Th>
                      <Th className="text-right">평균</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.runs.map((r) => (
                      <tr key={r.runId}>
                        <Td>{r.label}</Td>
                        <Td className="text-right">{p.meanByRun[r.runId] ?? '-'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="space-y-4">
                  <SeriesBarChart
                    categories={p.rows.map((r) => r.option)}
                    series={result.runs.map((r) => ({
                      name: r.label,
                      values: p.rows.map((row) => row.byRun[r.runId] ?? 0),
                    }))}
                  />
                  <Table caption="실행별 응답 비율">
                    <thead>
                      <tr>
                        <Th>선택지</Th>
                        {result.runs.map((r) => (
                          <Th key={r.runId} className="text-right">
                            {r.label}
                          </Th>
                        ))}
                        <Th className="text-right">변동폭</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.rows.map((row) => (
                        <tr key={row.option}>
                          <Td>{row.option}</Td>
                          {result.runs.map((r) => (
                            <Td key={r.runId} className="text-right">
                              {row.byRun[r.runId] ?? 0}%
                            </Td>
                          ))}
                          <Td className="text-right font-medium">{row.range}%p</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card>
          ))}

          <Notice tone="info" title="해석 시 주의">
            변동폭이 큰 문항은 Synthetic 응답이 불안정하다는 뜻이며, 해당 문항의 결과를 단독 근거로 사용하지 않는 것이
            좋습니다. 변동폭이 작다고 해서 실제 이용자 응답과 일치한다는 의미는 아닙니다.
          </Notice>
        </>
      )}
    </div>
  );
}
