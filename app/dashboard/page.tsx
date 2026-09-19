import Link from 'next/link';
import { Badge, Card, LinkButton, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { DemoLauncher } from '@/components/DemoLauncher';
import { isDemoMode } from '@/lib/ai';
import { findDemoProject } from '@/lib/services/demoService';
import { DistributionChart } from '@/components/charts/DistributionChart';
import { SeriesBarChart } from '@/components/charts/SeriesBarChart';
import { prisma } from '@/lib/db';
import { dashboardSummary } from '@/lib/services/projectService';
import { analyzeRun, analyzeSegment, listBatches } from '@/lib/services/analysisService';
import { formatDuration } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  const summary = await dashboardSummary(project);
  const q = project ? `?project=${project}` : '';

  const latestRun = await prisma.surveyRun.findFirst({
    where: { ...(project ? { projectId: project } : {}), completedCount: { gt: 0 } },
    orderBy: { startedAt: 'desc' },
  });

  const analysis = latestRun ? await analyzeRun(latestRun.id) : null;
  const choiceItems = analysis?.questions.filter((item) => item.distribution) ?? [];
  const preference = choiceItems[0];
  const barrier = choiceItems[1];
  const openTextItem = analysis?.questions.find((item) => item.keywords && item.keywords.length > 0);

  const segment =
    latestRun && preference
      ? await analyzeSegment(latestRun.id, preference.question.id, 'householdType')
      : null;

  const batches = project ? await listBatches(project) : [];
  const demoMode = isDemoMode();
  const demo = await findDemoProject();

  // 다음에 무엇을 해야 하는지 한눈에 보여주는 체크리스트
  const steps = [
    {
      done: summary.clientTotal > 0,
      title: '가상 이용자 패널 만들기',
      desc: '분포를 입력하거나 합성 데이터 CSV 를 가져옵니다.',
      href: `/clients${q}`,
      action: '패널 준비하기',
    },
    {
      done: summary.surveyCount > 0,
      title: '설문지 작성하기',
      desc: '실제 조사에 쓸 문항을 그대로 만듭니다. 데모 설문을 불러올 수도 있습니다.',
      href: `/surveys${q}`,
      action: '설문지 만들기',
    },
    {
      done: summary.runCount > 0,
      title: '가상 패널에게 설문 실행하기',
      desc: '예상 호출 수를 확인한 뒤 실행합니다. 반복 실행하면 안정성도 볼 수 있습니다.',
      href: `/runs/new${q}`,
      action: '실행하기',
    },
    {
      done: Boolean(latestRun),
      title: '결과 분석하고 설문지 보완하기',
      desc: '세그먼트별 차이, 참여장벽, 몰린 문항을 확인합니다.',
      href: `/analysis${q}`,
      action: '결과 보기',
    },
    {
      done: summary.actualCount > 0,
      title: '실제 조사 결과와 비교하기',
      desc: '실제 조사 후 CSV 를 올려 시뮬레이션과의 차이를 확인합니다.',
      href: `/validation${q}`,
      action: '비교하기',
    },
  ];
  const nextStep = steps.find((s) => !s.done);

  return (
    <div className="space-y-6">
      <PageHeader
        title="대시보드"
        description="가장 최근 실행 결과를 요약해서 보여줍니다."
        action={
          project ? (
            <LinkButton href={`/runs/new${q}`} variant="primary">
              설문 실행하기
            </LinkButton>
          ) : (
            <LinkButton href="/projects" variant="primary">
              프로젝트 선택
            </LinkButton>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Synthetic Clients" value={`${summary.clientTotal.toLocaleString()}명`} />
        <StatCard label="설문 문항" value={`${summary.questionCount}개`} sub={`설문지 ${summary.surveyCount}개`} />
        <StatCard
          label="완료 응답"
          value={summary.total ? `${summary.completed} / ${summary.total}` : '-'}
          sub="최근 실행 기준"
        />
        <StatCard label="평균 실행시간" value={formatDuration(summary.avgDurationMs)} />
        <StatCard label="실제 조사 비교" value={summary.actualCount > 0 ? `${summary.actualCount}건 등록` : '미등록'} />
      </div>

      {demoMode && (
        <Notice tone="warning" title="데모 모드로 실행 중입니다">
          AI API 키가 등록되어 있지 않아 <strong>Mock(더미) 응답</strong>으로 결과를 보여줍니다. 화면과 분석은 실제
          모델을 쓸 때와 동일하게 동작합니다. 실제 모델을 쓰려면 <code>.env</code> 에 API 키를 넣고 서버를 다시
          시작하세요.
        </Notice>
      )}

      <Card
        title="다음 할 일"
        description={nextStep ? `지금 단계: ${nextStep.title}` : '모든 단계를 마쳤습니다. 반복 실행이나 다른 프로그램 후보로 다시 시도해보세요.'}
      >
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className={
                'flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ' +
                (step === nextStep ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-white')
              }
            >
              <span
                className={
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                  (step.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700')
                }
                aria-hidden="true"
              >
                {step.done ? '✓' : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {step.title}{' '}
                  {step.done ? (
                    <Badge tone="success">완료</Badge>
                  ) : step === nextStep ? (
                    <Badge tone="info">지금 할 차례</Badge>
                  ) : null}
                </p>
                <p className="text-sm text-slate-600">{step.desc}</p>
              </div>
              <LinkButton href={step.href} variant={step === nextStep ? 'primary' : 'secondary'}>
                {step.action}
              </LinkButton>
            </li>
          ))}
        </ol>

        {summary.clientTotal === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4">
            <p className="text-sm font-medium text-slate-800">처음이신가요?</p>
            <p className="mt-1 text-sm text-slate-600">
              데모 데이터를 만들면 패널 30명 · 설문 6문항 · 실행 결과 · 비교 리포트까지 한 번에 생성되어 전체 흐름을
              바로 볼 수 있습니다.
            </p>
            <div className="mt-3">
              <DemoLauncher exists={Boolean(demo)} projectId={demo?.id} />
            </div>
          </div>
        )}
      </Card>

      {!analysis ? (
        <Notice tone="info">
          아직 실행 결과가 없습니다. 위 &ldquo;다음 할 일&rdquo; 순서대로 진행하면 이 화면에 선호도·세그먼트·참여장벽
          차트가 표시됩니다.
        </Notice>
      ) : (
        <>
          <Notice tone="info">
            최근 실행: {analysis.surveyName} v{analysis.surveyVersion} · {analysis.provider}/{analysis.model} · 유효
            응답 {analysis.successCount.toLocaleString()}명{' '}
            <Link href={`/analysis/${analysis.runId}${q}`} className="ml-1 underline">
              자세히 보기
            </Link>
          </Notice>

          {preference?.distribution && (
            <Card title={`프로그램 선호도 — ${preference.question.question}`}>
              <DistributionChart
                data={preference.distribution.items.map((i) => ({
                  label: i.option,
                  percent: i.percent,
                  count: i.count,
                }))}
              />
              <Table caption="프로그램 선호도">
                <thead>
                  <tr>
                    <Th>순위</Th>
                    <Th>프로그램</Th>
                    <Th className="text-right">응답 수</Th>
                    <Th className="text-right">비율</Th>
                  </tr>
                </thead>
                <tbody>
                  {preference.distribution.items.map((i) => (
                    <tr key={i.option}>
                      <Td>{i.rank}</Td>
                      <Td>{i.option}</Td>
                      <Td className="text-right">{i.count}</Td>
                      <Td className="text-right">{i.percent}%</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {segment && segment.rows.length > 0 && preference?.distribution && (
            <Card title="세그먼트별 선호 (가구형태)">
              <SeriesBarChart
                categories={preference.question.options ?? []}
                series={segment.rows.slice(0, 4).map((r) => ({
                  name: `${r.segment} (${r.total}명)`,
                  values: (preference.question.options ?? []).map((opt) => r.shares[opt] ?? 0),
                }))}
              />
              <Table caption="가구형태별 응답 비율">
                <thead>
                  <tr>
                    <Th>가구형태</Th>
                    <Th className="text-right">응답 수</Th>
                    {(preference.question.options ?? []).map((opt) => (
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
                      {(preference.question.options ?? []).map((opt) => (
                        <Td key={opt} className="text-right">
                          {r.shares[opt] ?? 0}%
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {barrier?.distribution && (
            <Card title={`참여장벽 Top ${Math.min(10, barrier.distribution.items.length)} — ${barrier.question.question}`}>
              <DistributionChart
                data={barrier.distribution.items.slice(0, 10).map((i) => ({
                  label: i.option,
                  percent: i.percent,
                  count: i.count,
                }))}
              />
              <Table caption="참여장벽">
                <thead>
                  <tr>
                    <Th>순위</Th>
                    <Th>장벽</Th>
                    <Th className="text-right">응답 수</Th>
                    <Th className="text-right">비율</Th>
                  </tr>
                </thead>
                <tbody>
                  {barrier.distribution.items.slice(0, 10).map((i) => (
                    <tr key={i.option}>
                      <Td>{i.rank}</Td>
                      <Td>{i.option}</Td>
                      <Td className="text-right">{i.count}</Td>
                      <Td className="text-right">{i.percent}%</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {openTextItem?.keywords && (
            <Card
              title="주관식에서 자주 등장한 표현 Top 10"
              description="빈도 기반 분석이며, AI가 생성한 합성 응답에서 추출한 결과입니다."
            >
              <DistributionChart
                data={openTextItem.keywords.slice(0, 10).map((k) => ({
                  label: k.keyword,
                  percent: k.count,
                  count: k.count,
                }))}
                unitLabel="건"
              />
              <Table caption="주관식 키워드">
                <thead>
                  <tr>
                    <Th>키워드</Th>
                    <Th className="text-right">등장 응답 수</Th>
                  </tr>
                </thead>
                <tbody>
                  {openTextItem.keywords.slice(0, 10).map((k) => (
                    <tr key={k.keyword}>
                      <Td>{k.keyword}</Td>
                      <Td className="text-right">{k.count}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {batches.length > 0 && (
            <Card title="반복 실행 안정성" description="같은 설정으로 여러 번 실행한 결과를 비교할 수 있습니다.">
              <ul className="space-y-2 text-sm">
                {batches.map((b) => (
                  <li key={b.batchKey}>
                    {b.surveyName} v{b.surveyVersion} · {b.runs.length}회 ·{' '}
                    <Link
                      href={`/analysis/stability${q}${q ? '&' : '?'}runs=${b.runs.map((r) => r.id).join(',')}`}
                      className="text-blue-800 underline"
                    >
                      비교 보기
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Disclaimer />
    </div>
  );
}
