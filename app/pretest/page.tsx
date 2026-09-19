import Link from 'next/link';
import { Badge, Card, EmptyState, LinkButton, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { ReviewRunner } from '@/components/forms/ReviewRunner';
import { ComprehensionLauncher } from '@/components/forms/ComprehensionLauncher';
import { defaultProviderId, listProviders } from '@/lib/ai';
import { prisma } from '@/lib/db';
import { listDatasets } from '@/lib/services/clientDatasetService';
import { listSurveys } from '@/lib/services/surveyService';
import { latestReviews } from '@/lib/services/reviewService';
import { analyzePsychometrics } from '@/lib/services/analysisService';
import { listRuns } from '@/lib/services/surveyRunService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PretestPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; survey?: string; run?: string }>;
}) {
  const { project, survey: surveyParam, run: runParam } = await searchParams;

  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title="설문지 사전점검" />
        <RequireProject />
      </div>
    );
  }

  const [surveys, datasets, runs, projectRow] = await Promise.all([
    listSurveys(project),
    listDatasets(project),
    listRuns(project),
    prisma.project.findUnique({ where: { id: project }, select: { targetPopulation: true } }),
  ]);

  const q = `?project=${project}`;

  if (surveys.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="설문지 사전점검" />
        <EmptyState
          title="점검할 설문지가 없습니다."
          description="실제 조사에 쓸 문항을 그대로 작성한 뒤 이 화면으로 돌아오세요."
          action={
            <LinkButton href={`/surveys/new${q}`} variant="primary">
              설문지 만들기
            </LinkButton>
          }
        />
      </div>
    );
  }

  const survey = surveys.find((s) => s.id === surveyParam) ?? surveys[0];
  const reviews = await latestReviews(survey.id);

  const comprehensionRuns = runs.filter((r) => r.mode === 'comprehension' && r.surveyId === survey.id);
  const answerRuns = runs.filter((r) => r.mode !== 'comprehension' && r.completedCount > 0);
  const selectedRun = answerRuns.find((r) => r.id === runParam) ?? answerRuns[0];
  const psycho = selectedRun ? await analyzePsychometrics(selectedRun.id) : null;

  const scaleItems = survey.questions.filter((x) => x.type === 'scale_5' || x.type === 'number');
  const constructNames = [...new Set(scaleItems.map((x) => x.construct).filter(Boolean))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="설문지 사전점검"
        description="실제 조사에 나가기 전에 문항이 제대로 작동할지 확인합니다."
        action={<LinkButton href={`/surveys/${survey.id}${q}`}>설문지 수정</LinkButton>}
      />

      <Notice tone="warning" title="먼저 알아두실 것">
        가상 응답자로는 <strong>구성타당도·준거타당도를 검증할 수 없습니다</strong>. 그건 실제 응답자 자료로만
        가능합니다. 이 화면이 찾아주는 것은 실제 조사 전에 고칠 수 있는 <strong>문항의 구조적 결함</strong>입니다 —
        모호한 표현, 다르게 읽히는 문항, 겹치는 보기, 겉도는 척도 문항, 역채점 처리 오류.
      </Notice>

      <Card title="점검할 설문지">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="project" value={project} />
          <div>
            <label htmlFor="pretest-survey" className="block text-sm font-medium text-slate-800">
              설문지
            </label>
            <select
              id="pretest-survey"
              name="survey"
              defaultValue={survey.id}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (v{s.version}, {s.questions.length}문항)
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            선택
          </button>
        </form>

        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <StatCard label="전체 문항" value={`${survey.questions.length}개`} />
          <StatCard label="척도·숫자 문항" value={`${scaleItems.length}개`} />
          <StatCard
            label="척도 묶음"
            value={constructNames.length > 0 ? constructNames.join(', ') : '미지정'}
            sub={constructNames.length === 0 ? '신뢰도 계산 불가' : undefined}
          />
          <StatCard label="역채점 문항" value={`${scaleItems.filter((x) => x.reverse).length}개`} />
        </div>
      </Card>

      <Card
        title="① 문항 표현 검토"
        description="응답자를 쓰지 않고 문항 문장과 보기 구성만 봅니다. 규칙 기반 검토는 API 키 없이 동작합니다."
      >
        <ReviewRunner
          projectId={project}
          surveyId={survey.id}
          targetPopulation={projectRow?.targetPopulation}
          providers={listProviders()}
          defaultProvider={defaultProviderId()}
          initialReviews={reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        />
      </Card>

      <Card
        title="② 응답자 이해도 테스트"
        description="가상 이용자가 각 문항을 자기 말로 다시 설명하게 해서, 의도와 다르게 읽히는 문항을 찾습니다."
      >
        <ComprehensionLauncher
          projectId={project}
          surveyId={survey.id}
          datasets={datasets.map((d) => ({
            id: d.id,
            label: `${d.name} (v${d.version}, ${d.clientCount.toLocaleString()}명)`,
          }))}
          providers={listProviders()}
          defaultProvider={defaultProviderId()}
        />

        {comprehensionRuns.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-800">지난 점검</h3>
            <Table caption="이해도 점검 기록">
              <thead>
                <tr>
                  <Th>실행 일시</Th>
                  <Th>모델</Th>
                  <Th>인원</Th>
                  <Th>보기</Th>
                </tr>
              </thead>
              <tbody>
                {comprehensionRuns.map((r) => (
                  <tr key={r.id}>
                    <Td>{formatDateTime(r.startedAt)}</Td>
                    <Td className="text-xs">
                      {r.modelProvider}/{r.modelName}
                    </Td>
                    <Td>
                      {r.completedCount}/{r.totalCount}
                    </Td>
                    <Td>
                      <Link href={`/pretest/comprehension/${r.id}${q}`} className="text-blue-800 underline">
                        결과 보기
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Card
        title="③ 척도 신뢰도 · 문항 변별도"
        description="설문 실행 결과를 이용해 같은 개념을 재는 문항들이 실제로 함께 움직이는지 봅니다."
      >
        {constructNames.length === 0 ? (
          <Notice tone="info" title="척도 묶음을 먼저 지정하세요">
            <p>
              신뢰도(α)와 문항 변별도는 <strong>같은 개념을 재는 문항</strong>끼리 묶어야 계산할 수 있습니다.
            </p>
            <p className="mt-1">
              설문지 수정 화면에서 척도·숫자 문항의 <strong>&ldquo;척도 묶음&rdquo;</strong> 칸에 같은 이름(예: 참여의향)을
              적고, 방향을 뒤집은 문항은 <strong>&ldquo;역채점&rdquo;</strong>에 체크하세요. 한 묶음에 3문항 이상을 권장합니다.
            </p>
            <p className="mt-2">
              <Link href={`/surveys/${survey.id}${q}`} className="underline">
                설문지 수정하러 가기 →
              </Link>
            </p>
          </Notice>
        ) : !selectedRun ? (
          <EmptyState
            title="분석할 실행 결과가 없습니다."
            description="이 프로젝트에서 설문을 한 번 실행하면 신뢰도와 문항 변별도를 계산할 수 있습니다."
            action={
              <LinkButton href={`/runs/new${q}&survey=${survey.id}`} variant="primary">
                설문 실행하기
              </LinkButton>
            }
          />
        ) : (
          <div className="space-y-5">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="project" value={project} />
              <input type="hidden" name="survey" value={survey.id} />
              <div>
                <label htmlFor="pretest-run" className="block text-sm font-medium text-slate-800">
                  분석에 쓸 실행 결과
                </label>
                <select
                  id="pretest-run"
                  name="run"
                  defaultValue={selectedRun.id}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {answerRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {formatDateTime(r.startedAt)} · {r.modelProvider}/{r.modelName} · {r.completedCount}명
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                적용
              </button>
            </form>

            {psycho?.constructs.length === 0 ? (
              <Notice tone="warning">
                선택한 실행에는 척도 묶음에 해당하는 응답이 없습니다. 설문 버전이 다를 수 있습니다.
              </Notice>
            ) : (
              psycho?.constructs.map((c) => (
                <section key={c.construct} className="rounded-lg border border-slate-200 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold text-slate-900">{c.construct}</h3>
                    <Badge tone={c.alpha === null ? 'neutral' : c.alpha >= 0.7 ? 'success' : 'warning'}>
                      Cronbach&rsquo;s α = {c.alpha ?? '계산 불가'}
                    </Badge>
                    <span className="text-sm text-slate-600">
                      문항 {c.itemCount}개 · 응답 {c.n}명
                    </span>
                  </div>

                  {c.warnings.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                      {c.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3">
                    <Table caption={`${c.construct} 문항별 지표`}>
                      <thead>
                        <tr>
                          <Th>문항</Th>
                          <Th className="text-right">평균</Th>
                          <Th className="text-right">표준편차</Th>
                          <Th className="text-right">천장%</Th>
                          <Th className="text-right">바닥%</Th>
                          <Th className="text-right">문항-총점 상관</Th>
                          <Th className="text-right">이 문항 제외 시 α</Th>
                          <Th>확인할 점</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.items.map((item) => (
                          <tr key={item.questionId}>
                            <Td>
                              <span className="font-mono text-xs">{item.questionId}</span>{' '}
                              {item.reverse && <Badge>역채점</Badge>}
                              <p className="text-xs text-slate-600">{item.question}</p>
                            </Td>
                            <Td className="text-right">{item.mean}</Td>
                            <Td className="text-right">{item.sd}</Td>
                            <Td className="text-right">{item.ceilingPercent}%</Td>
                            <Td className="text-right">{item.floorPercent}%</Td>
                            <Td
                              className={
                                item.itemTotal !== null && item.itemTotal < 0.3
                                  ? 'text-right font-semibold text-red-700'
                                  : 'text-right'
                              }
                            >
                              {item.itemTotal ?? '-'}
                            </Td>
                            <Td className="text-right">{item.alphaIfDeleted ?? '-'}</Td>
                            <Td className="text-xs text-amber-800">{item.warnings.join(' ') || '-'}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    문항-총점 상관이 0.3 미만이면 그 문항은 같은 개념을 재지 않을 가능성이 있습니다. &ldquo;이 문항 제외
                    시 α&rdquo;가 현재 α보다 크게 높다면 문항을 빼거나 다시 쓰는 것을 검토하세요.
                  </p>
                </section>
              ))
            )}
          </div>
        )}
      </Card>

      <Card title="④ 역문항 · 응답 일관성" description="역채점 처리 오류와 성의 없는 일괄 응답 구조를 점검합니다.">
        {!psycho ? (
          <p className="text-sm text-slate-600">먼저 설문을 실행해주세요.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="일괄 응답(straight-lining)"
                value={`${psycho.consistency.straightLining.percent}%`}
                sub={`${psycho.consistency.straightLining.count}명이 모든 척도에 같은 값`}
              />
              <StatCard label="모순 문항 쌍" value={`${psycho.consistency.contradictions.length}건`} />
              <StatCard label="상위 보기 쏠림 문항" value={`${psycho.consistency.topBoxSkew.length}개`} />
            </div>

            {psycho.consistency.contradictions.length > 0 && (
              <Table caption="모순되는 문항 쌍">
                <thead>
                  <tr>
                    <Th>묶음</Th>
                    <Th>문항 쌍</Th>
                    <Th className="text-right">상관</Th>
                    <Th>확인할 점</Th>
                  </tr>
                </thead>
                <tbody>
                  {psycho.consistency.contradictions.map((c, i) => (
                    <tr key={i}>
                      <Td>{c.construct}</Td>
                      <Td className="font-mono text-xs">
                        {c.a} ↔ {c.b}
                      </Td>
                      <Td className="text-right font-semibold text-red-700">{c.r}</Td>
                      <Td className="text-sm">{c.message}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            {psycho.consistency.topBoxSkew.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-800">상위 보기(4~5점)에 쏠린 문항</h3>
                <Table caption="응답 쏠림 문항">
                  <thead>
                    <tr>
                      <Th>문항</Th>
                      <Th>내용</Th>
                      <Th className="text-right">4~5점 비율</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {psycho.consistency.topBoxSkew.map((t) => (
                      <tr key={t.questionId}>
                        <Td className="font-mono text-xs">{t.questionId}</Td>
                        <Td className="text-sm">{t.question}</Td>
                        <Td className="text-right font-semibold">{t.topBoxPercent}%</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <p className="mt-2 text-xs text-slate-500">
                  대부분이 긍정 쪽에 몰리면 변별이 되지 않습니다. 문항 표현이 동의를 끌어내고 있지 않은지(사회적
                  바람직성), 척도 구간을 더 잘게 나눌 필요는 없는지 확인하세요.
                </p>
              </div>
            )}

            {psycho.consistency.contradictions.length === 0 &&
              psycho.consistency.topBoxSkew.length === 0 &&
              psycho.consistency.straightLining.percent < 20 && (
                <Notice tone="info">두드러진 일관성 문제는 발견되지 않았습니다.</Notice>
              )}
          </div>
        )}
      </Card>

      <Notice tone="info" title="점검 후에 할 일">
        지적된 문항을 고쳐 설문지를 저장하면 자동으로 새 버전이 만들어집니다. 고친 뒤 같은 점검을 다시 돌려 결과가
        나아졌는지 비교해보세요. 최종 확인은 반드시 소수의 실제 주민 대상 사전조사로 하셔야 합니다.
      </Notice>
    </div>
  );
}
