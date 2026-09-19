import { notFound } from 'next/navigation';
import { Card, LinkButton, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { Disclaimer, SyntheticQuoteNotice } from '@/components/Disclaimer';
import { DistributionChart } from '@/components/charts/DistributionChart';
import { SeriesBarChart } from '@/components/charts/SeriesBarChart';
import { analyzeRun, analyzeSegment } from '@/lib/services/analysisService';
import { scaleLabelsOf } from '@/lib/survey/schema';
import { CLIENT_FIELDS, QUESTION_TYPE_LABEL } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RunAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ project?: string; seg?: string; sq?: string }>;
}) {
  const { runId } = await params;
  const { project, seg, sq } = await searchParams;

  const analysis = await analyzeRun(runId);
  if (!analysis) notFound();

  const q = project ? `?project=${project}` : '';
  const segmentField = seg ?? 'householdType';
  const choiceQuestions = analysis.questions.filter(
    (a) => a.question.type !== 'open_text'
  );
  const segmentQuestionId = sq ?? choiceQuestions[0]?.question.id;
  const segment = segmentQuestionId ? await analyzeSegment(runId, segmentQuestionId, segmentField) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="결과 분석 (Synthetic Survey)"
        description={`${analysis.surveyName} v${analysis.surveyVersion} · ${analysis.datasetName} v${analysis.datasetVersion} · ${analysis.provider}/${analysis.model} (temp ${analysis.temperature})`}
        action={
          <>
            <LinkButton href={`/api/export?type=summary&id=${runId}`}>요약 CSV</LinkButton>
            <LinkButton href={`/api/export?type=responses&id=${runId}`}>응답 CSV</LinkButton>
            <LinkButton href={`/validation${q}`} variant="primary">
              실제 조사와 비교
            </LinkButton>
          </>
        }
      />

      <Disclaimer />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="유효 응답" value={`${analysis.successCount.toLocaleString()}명`} />
        <StatCard label="전체 대상" value={`${analysis.totalResponses.toLocaleString()}명`} />
        <StatCard label="처리 실패" value={`${analysis.failedCount.toLocaleString()}건`} />
        <StatCard label="문항 수" value={`${analysis.questions.length}개`} />
      </div>

      {analysis.questions.map((item) => {
        const qn = item.question;
        return (
          <Card
            key={qn.id}
            title={`${qn.id}. ${qn.question}`}
            description={QUESTION_TYPE_LABEL[qn.type]}
          >
            {item.warning && <Notice tone="warning" title="문항 검토 제안">{item.warning}</Notice>}

            {item.distribution && (
              <div className="mt-3 space-y-4">
                <DistributionChart
                  data={item.distribution.items.map((i) => ({
                    label: i.option,
                    percent: i.percent,
                    count: i.count,
                  }))}
                />
                <Table caption={`${qn.id} 응답 분포`}>
                  <thead>
                    <tr>
                      <Th>순위</Th>
                      <Th>선택지</Th>
                      <Th className="text-right">응답 수</Th>
                      <Th className="text-right">비율</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.distribution.items.map((i) => (
                      <tr key={i.option}>
                        <Td>{i.rank}</Td>
                        <Td>{i.option}</Td>
                        <Td className="text-right">{i.count.toLocaleString()}</Td>
                        <Td className="text-right">{i.percent}%</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <p className="text-xs text-slate-500">
                  응답자 {item.distribution.total.toLocaleString()}명 기준
                  {qn.type === 'multi_choice' && ' (복수선택이므로 합계가 100%를 넘을 수 있습니다)'}
                </p>
              </div>
            )}

            {item.stats && (
              <div className="mt-3 space-y-4">
                <div className="grid gap-4 sm:grid-cols-4">
                  <StatCard label="평균" value={item.stats.mean} />
                  <StatCard label="중앙값" value={item.stats.median} />
                  <StatCard label="표준편차" value={item.stats.sd} />
                  <StatCard label="응답 수" value={`${item.stats.n.toLocaleString()}명`} />
                </div>
                <DistributionChart
                  data={item.stats.distribution.map((d) => ({
                    label:
                      qn.type === 'scale_5'
                        ? `${d.value}. ${scaleLabelsOf(qn)[d.value - 1] ?? ''}`
                        : String(d.value),
                    percent: d.percent,
                    count: d.count,
                  }))}
                />
                <Table caption={`${qn.id} 척도 분포`}>
                  <thead>
                    <tr>
                      <Th>값</Th>
                      {qn.type === 'scale_5' && <Th>라벨</Th>}
                      <Th className="text-right">응답 수</Th>
                      <Th className="text-right">비율</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.stats.distribution.map((d) => (
                      <tr key={d.value}>
                        <Td>{d.value}</Td>
                        {qn.type === 'scale_5' && <Td>{scaleLabelsOf(qn)[d.value - 1] ?? '-'}</Td>}
                        <Td className="text-right">{d.count.toLocaleString()}</Td>
                        <Td className="text-right">{d.percent}%</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}

            {item.keywords && (
              <div className="mt-3 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">자주 등장한 표현 (빈도 기반 · AI 생성 응답 분석)</h3>
                  <Table caption={`${qn.id} 키워드 빈도`}>
                    <thead>
                      <tr>
                        <Th>키워드</Th>
                        <Th className="text-right">등장 응답 수</Th>
                        <Th>Synthetic Client 응답 예시</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.keywords.map((k) => (
                        <tr key={k.keyword}>
                          <Td>{k.keyword}</Td>
                          <Td className="text-right">{k.count}</Td>
                          <Td className="text-xs text-slate-600">{k.examples[0] ?? '-'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                <details>
                  <summary className="cursor-pointer text-sm text-blue-800">
                    주관식 응답 원문 보기 ({item.texts?.length.toLocaleString() ?? 0}건)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <SyntheticQuoteNotice />
                    <ul className="max-h-96 space-y-2 overflow-y-auto">
                      {(item.texts ?? []).map((t) => (
                        <li key={t.localId} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                          <span className="mr-2 font-mono text-xs text-slate-500">{t.localId}</span>
                          {t.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              </div>
            )}
          </Card>
        );
      })}

      <Card
        title="세그먼트 분석"
        description="가구형태, 연령, 이동 불편 등 속성별로 응답이 어떻게 달라지는지 확인합니다."
      >
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          {project && <input type="hidden" name="project" value={project} />}
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="seg-question">
              문항
            </label>
            <select
              id="seg-question"
              name="sq"
              defaultValue={segmentQuestionId}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {choiceQuestions.map((c) => (
                <option key={c.question.id} value={c.question.id}>
                  {c.question.id}. {c.question.question.slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="seg-field">
              세그먼트 속성
            </label>
            <select
              id="seg-field"
              name="seg"
              defaultValue={segmentField}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {CLIENT_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            비교하기
          </button>
        </form>

        {!segment ? (
          <p className="text-sm text-slate-600">비교할 문항이 없습니다.</p>
        ) : segment.question.type === 'scale_5' || segment.question.type === 'number' ? (
          <>
            <DistributionChart
              data={segment.rows.map((r) => ({ label: r.segment, percent: r.mean ?? 0, count: r.total }))}
              unitLabel="점"
            />
            <Table caption="세그먼트별 평균">
              <thead>
                <tr>
                  <Th>세그먼트</Th>
                  <Th className="text-right">응답 수</Th>
                  <Th className="text-right">평균</Th>
                </tr>
              </thead>
              <tbody>
                {segment.rows.map((r) => (
                  <tr key={r.segment}>
                    <Td>{r.segment}</Td>
                    <Td className="text-right">{r.total}</Td>
                    <Td className="text-right">{r.mean}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        ) : (
          <>
            <SeriesBarChart
              categories={segment.question.options ?? []}
              series={segment.rows.slice(0, 6).map((r) => ({
                name: `${r.segment} (${r.total}명)`,
                values: (segment.question.options ?? []).map((opt) => r.shares[opt] ?? 0),
              }))}
            />
            <Table caption="세그먼트별 응답 비율">
              <thead>
                <tr>
                  <Th>세그먼트</Th>
                  <Th className="text-right">응답 수</Th>
                  {(segment.question.options ?? []).map((opt) => (
                    <Th key={opt} className="text-right">
                      {opt}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segment.rows.map((r) => (
                  <tr key={r.segment}>
                    <Td>{r.segment}</Td>
                    <Td className="text-right">{r.total}</Td>
                    {(segment.question.options ?? []).map((opt) => (
                      <Td key={opt} className="text-right">
                        {r.shares[opt] ?? 0}%
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Card>

      <Notice tone="info" title="다음 단계 제안">
        응답이 한쪽으로 몰린 문항, 선택된 적 없는 보기, 주관식에서 반복 등장한 표현을 실제 설문지 수정에 활용하세요.
        이 결과는 &quot;실제 이용자가 이렇게 답할 것&quot;이라는 예측이 아니라, 무엇을 더 물어봐야 할지 찾기 위한 가설입니다.
      </Notice>
    </div>
  );
}
