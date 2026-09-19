import { notFound } from 'next/navigation';
import { Badge, Card, LinkButton, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { RunProgress } from '@/components/RunProgress';
import { DistributionChart } from '@/components/charts/DistributionChart';
import { analyzeComprehension } from '@/lib/services/analysisService';
import { getRun } from '@/lib/services/surveyRunService';

export const dynamic = 'force-dynamic';

const DIFFICULTY_LABEL = ['', '아주 쉬움', '쉬움', '보통', '어려움', '아주 어려움'];

export default async function ComprehensionResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { runId } = await params;
  const { project } = await searchParams;

  const run = await getRun(runId);
  if (!run) notFound();

  const projectId = project ?? run.projectId;
  const analysis = await analyzeComprehension(runId);
  const q = `?project=${projectId}`;

  const sorted = analysis ? [...analysis.questions].sort((a, b) => b.meanDifficulty - a.meanDifficulty) : [];
  const hardest = sorted[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="문항 이해도 점검 결과"
        description={`${run.survey.name} v${run.surveyVersion} · ${run.modelProvider}/${run.modelName}`}
        action={<LinkButton href={`/pretest${q}&survey=${run.surveyId}`}>사전점검 화면으로</LinkButton>}
      />

      <Card title="진행 상황">
        <RunProgress runId={runId} projectId={projectId} />
      </Card>

      {!analysis || analysis.respondentCount === 0 ? (
        <Notice tone="info">아직 완료된 응답이 없습니다. 실행이 끝나면 결과가 표시됩니다.</Notice>
      ) : (
        <>
          <Disclaimer />

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="점검 인원" value={`${analysis.respondentCount}명`} />
            <StatCard
              label="가장 어려웠던 문항"
              value={hardest ? hardest.question.id : '-'}
              sub={hardest ? `평균 난이도 ${hardest.meanDifficulty} / 5` : undefined}
            />
            <StatCard
              label="어렵다는 응답이 많은 문항"
              value={`${analysis.questions.filter((x) => x.hardPercent >= 40).length}개`}
              sub="40% 이상이 4~5점"
            />
          </div>

          <Card title="문항별 이해 난이도" description="1(아주 쉬움) ~ 5(아주 어려움) 평균입니다.">
            <DistributionChart
              data={sorted.map((item) => ({
                label: `${item.question.id}`,
                percent: item.meanDifficulty,
                count: item.n,
              }))}
              unitLabel="점"
            />
            <Table caption="문항별 이해 난이도">
              <thead>
                <tr>
                  <Th>문항</Th>
                  <Th>내용</Th>
                  <Th className="text-right">평균 난이도</Th>
                  <Th className="text-right">어렵다(4~5점)</Th>
                  <Th>어려운 낱말</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => (
                  <tr key={item.question.id}>
                    <Td className="font-mono text-xs">{item.question.id}</Td>
                    <Td className="max-w-md text-sm">{item.question.question}</Td>
                    <Td
                      className={
                        item.meanDifficulty >= 3.5 ? 'text-right font-semibold text-red-700' : 'text-right'
                      }
                    >
                      {item.meanDifficulty}
                    </Td>
                    <Td className="text-right">{item.hardPercent}%</Td>
                    <Td className="text-xs text-slate-600">
                      {item.hardWords.length
                        ? item.hardWords.map((w) => `${w.word}(${w.count})`).join(', ')
                        : '-'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {analysis.questions.map((item) => (
            <Card
              key={item.question.id}
              title={`${item.question.id}. ${item.question.question}`}
              description={`평균 난이도 ${item.meanDifficulty} / 5 · 어렵다 ${item.hardPercent}%`}
            >
              {item.meanDifficulty >= 3.5 && (
                <Notice tone="warning">
                  이 문항은 이해하기 어렵다는 응답이 많았습니다. 아래 &ldquo;이렇게 이해했습니다&rdquo;를 읽고 의도와
                  다르게 읽히는 부분이 있는지 확인하세요.
                </Notice>
              )}

              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">난이도 분포</h3>
                  <Table caption="난이도 분포">
                    <thead>
                      <tr>
                        <Th>난이도</Th>
                        <Th className="text-right">응답 수</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.distribution.map((d) => (
                        <tr key={d.value}>
                          <Td>
                            {d.value} · {DIFFICULTY_LABEL[d.value]}
                          </Td>
                          <Td className="text-right">{d.count}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-800">디지털 활용 수준별 난이도</h3>
                  <Table caption="세그먼트별 난이도">
                    <thead>
                      <tr>
                        <Th>디지털 활용</Th>
                        <Th className="text-right">인원</Th>
                        <Th className="text-right">평균 난이도</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.byDigitalLiteracy.map((seg) => (
                        <tr key={seg.segment}>
                          <Td>{seg.segment}</Td>
                          <Td className="text-right">{seg.n}</Td>
                          <Td className="text-right">{seg.meanDifficulty}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-blue-800">
                  응답자들이 이렇게 이해했습니다 ({item.restatements.length}건)
                </summary>
                <p className="mt-2 text-xs text-slate-500">
                  아래는 Synthetic Client 가 문항을 읽고 다시 설명한 내용입니다. 실제 주민의 발언이 아닙니다.
                </p>
                <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto">
                  {item.restatements.map((r) => (
                    <li key={r.localId} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                      <span className="mr-2 font-mono text-xs text-slate-500">{r.localId}</span>
                      <Badge tone={r.difficulty >= 4 ? 'warning' : 'neutral'}>난이도 {r.difficulty}</Badge>
                      <p className="mt-1 text-slate-700">{r.text}</p>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          ))}

          <Notice tone="info" title="이 결과를 쓰는 법">
            평균 난이도가 높은 문항, 서로 다르게 이해한 문항, 반복해서 나온 어려운 낱말을 실제 설문지 수정에
            반영하세요. 다만 이것은 합성 응답자의 반응이므로, 최종 확인은 소수의 실제 주민 대상 사전조사로 하셔야
            합니다.
          </Notice>
        </>
      )}
    </div>
  );
}
