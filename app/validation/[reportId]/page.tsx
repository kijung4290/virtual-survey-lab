import { notFound } from 'next/navigation';
import { Badge, Card, LinkButton, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { SeriesBarChart } from '@/components/charts/SeriesBarChart';
import { getComparison } from '@/lib/services/comparisonService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ComparisonReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const report = await getComparison(reportId);
  if (!report) notFound();

  const { parsed } = report;
  const choiceComparisons = parsed.comparisons.filter((c) => c.type === 'choice');

  return (
    <div className="space-y-6">
      <PageHeader
        title={report.title}
        description={`Synthetic ${parsed.syntheticSample.toLocaleString()}명 vs 실제 ${parsed.actualSample.toLocaleString()}명 · ${formatDateTime(report.createdAt)}`}
        action={<LinkButton href={`/api/export?type=comparison&id=${report.id}`}>비교 CSV</LinkButton>}
      />

      <Disclaimer />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Synthetic 표본" value={`${parsed.syntheticSample.toLocaleString()}명`} sub={`${report.run.modelProvider}/${report.run.modelName}`} />
        <StatCard label="실제 표본" value={`${parsed.actualSample.toLocaleString()}명`} sub={report.actualDataset.surveyDate ?? undefined} />
        <StatCard
          label="1순위 일치 문항"
          value={`${choiceComparisons.filter((c) => c.type === 'choice' && c.topMatch).length} / ${choiceComparisons.length}`}
        />
        <StatCard label="설문 버전" value={`v${report.run.surveyVersion}`} sub={report.run.survey.name} />
      </div>

      <Card title="자동 해석" description="규칙 기반으로 생성한 요약입니다. 차이의 원인을 단정하지 않습니다.">
        <pre className="whitespace-pre-wrap text-sm text-slate-800">{report.narrative}</pre>
      </Card>

      {parsed.comparisons.map((c) =>
        c.type === 'choice' ? (
          <Card key={c.questionId} title={`${c.questionId}. ${c.question}`}>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-sm">
                <span>
                  MAE <strong>{c.mae}%p</strong>
                </span>
                {c.spearman !== null && (
                  <span>
                    순위 상관(Spearman) <strong>{c.spearman}</strong>
                  </span>
                )}
                <span>
                  1순위 {c.topMatch ? <Badge tone="success">일치</Badge> : <Badge tone="warning">불일치</Badge>}
                </span>
              </div>

              <SeriesBarChart
                categories={c.rows.map((r) => r.option)}
                series={[
                  { name: 'Synthetic', values: c.rows.map((r) => r.syntheticPercent) },
                  { name: '실제 조사', values: c.rows.map((r) => r.actualPercent) },
                ]}
              />

              <Table caption={`${c.questionId} Synthetic vs 실제 비교`}>
                <thead>
                  <tr>
                    <Th>선택지</Th>
                    <Th className="text-right">Synthetic</Th>
                    <Th className="text-right">실제</Th>
                    <Th className="text-right">차이(%p)</Th>
                    <Th className="text-right">Synthetic 순위</Th>
                    <Th className="text-right">실제 순위</Th>
                    <Th className="text-right">순위 차</Th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((r) => (
                    <tr key={r.option}>
                      <Td>{r.option}</Td>
                      <Td className="text-right">{r.syntheticPercent}%</Td>
                      <Td className="text-right">{r.actualPercent}%</Td>
                      <Td className="text-right font-medium">
                        {r.gapPp > 0 ? '+' : ''}
                        {r.gapPp}%p
                      </Td>
                      <Td className="text-right">{r.syntheticRank}</Td>
                      <Td className="text-right">{r.actualRank}</Td>
                      <Td className="text-right">
                        {r.rankDiff > 0 ? '+' : ''}
                        {r.rankDiff}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="text-xs text-slate-500">
                Synthetic 응답 {c.syntheticN.toLocaleString()}명 / 실제 응답 {c.actualN.toLocaleString()}명 기준
              </p>
            </div>
          </Card>
        ) : (
          <Card key={c.questionId} title={`${c.questionId}. ${c.question}`}>
            <Table caption={`${c.questionId} 척도 평균 비교`}>
              <thead>
                <tr>
                  <Th>구분</Th>
                  <Th className="text-right">응답 수</Th>
                  <Th className="text-right">평균</Th>
                  <Th className="text-right">표준편차</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Synthetic</Td>
                  <Td className="text-right">{c.syntheticN}</Td>
                  <Td className="text-right">{c.syntheticMean}</Td>
                  <Td className="text-right">{c.syntheticSd}</Td>
                </tr>
                <tr>
                  <Td>실제 조사</Td>
                  <Td className="text-right">{c.actualN}</Td>
                  <Td className="text-right">{c.actualMean}</Td>
                  <Td className="text-right">{c.actualSd}</Td>
                </tr>
                <tr>
                  <Td className="font-medium">차이</Td>
                  <Td className="text-right">-</Td>
                  <Td className="text-right font-medium">
                    {c.meanDiff > 0 ? '+' : ''}
                    {c.meanDiff}
                  </Td>
                  <Td className="text-right">-</Td>
                </tr>
              </tbody>
            </Table>
          </Card>
        )
      )}

      {parsed.openText && parsed.openText.length > 0 && (
        <Card
          title="주관식 주요 표현 비교"
          description="빈도 기반 키워드 비교입니다. 두 조사에서 함께 등장한 표현은 실제 조사에서도 확인된 주제일 가능성이 있습니다."
        >
          {parsed.openText.map((o) => (
            <div key={o.questionId} className="mb-6">
              <h3 className="text-sm font-semibold text-slate-800">
                {o.questionId}. {o.question}
              </h3>
              <Table caption={`${o.questionId} 키워드 비교`}>
                <thead>
                  <tr>
                    <Th>구분</Th>
                    <Th>키워드</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td>두 조사 공통</Td>
                    <Td>{o.shared.join(', ') || '-'}</Td>
                  </tr>
                  <tr>
                    <Td>Synthetic 에만</Td>
                    <Td>{o.syntheticOnly.join(', ') || '-'}</Td>
                  </tr>
                  <tr>
                    <Td>실제 조사에만</Td>
                    <Td>{o.actualOnly.join(', ') || '-'}</Td>
                  </tr>
                </tbody>
              </Table>
            </div>
          ))}
        </Card>
      )}

      {parsed.skipped.length > 0 && (
        <Notice tone="info" title="비율 비교에서 제외된 문항">
          <ul className="mt-1 list-disc pl-5">
            {parsed.skipped.map((s) => (
              <li key={s.questionId}>
                {s.questionId} — {s.reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
