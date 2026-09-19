import { Badge, Card, LinkButton } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { DemoLauncher } from '@/components/DemoLauncher';
import { isDemoMode, readyProviderLabels } from '@/lib/ai';
import { findDemoProject } from '@/lib/services/demoService';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function loadState() {
  try {
    const [projectCount, demo] = await Promise.all([prisma.project.count(), findDemoProject()]);
    return { projectCount, demo };
  } catch {
    return { projectCount: 0, demo: null };
  }
}

const STEPS = [
  {
    no: '1',
    title: '가상 이용자 패널을 만듭니다',
    body: '공개 통계 비율(연령·가구형태·이동불편 등)을 입력하거나 합성 데이터 CSV를 올리면 수백 명의 가상 이용자가 만들어집니다. 실제 주민 정보는 쓰지 않습니다.',
  },
  {
    no: '2',
    title: '실제로 쓸 설문지를 그대로 작성합니다',
    body: '단일선택·복수선택·5점척도·숫자·주관식과 조건부 문항까지, 실제 조사에 사용할 문항을 그대로 만듭니다.',
  },
  {
    no: '3',
    title: '가상 패널에게 먼저 설문을 돌립니다',
    body: '한 명이 한 명의 응답자입니다. 각자 자기 페르소나만 보고 답하며, 결과는 JSON으로 검증해 저장합니다.',
  },
  {
    no: '4',
    title: '무엇을 더 물어야 할지 찾습니다',
    body: '세그먼트별 반응 차이, 참여장벽, 응답이 몰린 문항, 반복 실행 시 흔들리는 문항을 확인해 실제 설문지를 보완합니다.',
  },
  {
    no: '5',
    title: '실제 조사 후 결과를 비교합니다',
    body: '실제 조사 CSV를 올리면 비율 차이(%p)·순위 차이·MAE·순위상관을 계산해 시뮬레이션이 얼마나 맞았는지 확인합니다.',
  },
];

export default async function HomePage() {
  const { projectCount, demo } = await loadState();
  const demoMode = isDemoMode();
  const ready = readyProviderLabels();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-12">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">사회복지 프로그램 기획 도구</Badge>
          {demoMode ? (
            <Badge tone="warning">데모 모드 · API 키 없이 체험 중</Badge>
          ) : (
            <Badge tone="success">{ready.join(', ')} 연결됨</Badge>
          )}
        </div>

        <h1 className="mt-4 text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          실제 이용자에게 묻기 전에,
          <br />
          가상의 이용자 패널로 설문을 먼저 점검하세요.
        </h1>

        <p className="mt-4 max-w-2xl text-base text-slate-700">
          프로그램 후보 6개를 정했는데 무엇부터 물어봐야 할지 막막할 때, 설문지를 인쇄하기 전에
          &ldquo;이 문항이 제대로 작동할까?&rdquo;를 확인하고 싶을 때 쓰는 도구입니다. 공개·합성 데이터로 만든
          가상 이용자 수백 명에게 같은 설문을 먼저 돌려보고, 빠진 질문을 찾아냅니다.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <DemoLauncher
            exists={Boolean(demo)}
            projectId={demo?.id}
            label="1분 만에 체험하기 (API 키 불필요)"
          />
          {projectCount > 0 && <LinkButton href="/dashboard">대시보드로 이동</LinkButton>}
          <LinkButton href="/projects">직접 프로젝트 만들기</LinkButton>
        </div>

        <p className="mt-4 text-sm font-medium text-amber-900">
          ※ 이 결과는 실제 이용자 욕구조사를 대체하지 않습니다. 더 좋은 질문을 찾기 위한 사전 실험 도구입니다.
        </p>
      </section>

      {demoMode && (
        <Card title="지금은 데모 모드입니다" description="AI API 키가 없어도 모든 기능을 그대로 써볼 수 있습니다.">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>
              응답은 <strong>Mock(더미) 엔진</strong>이 만듭니다. 비용이 들지 않고, 같은 조건이면 항상 같은 결과가
              나옵니다.
            </li>
            <li>화면·분석·비교 리포트는 실제 모델을 쓸 때와 똑같이 동작합니다.</li>
            <li>
              실제 모델을 쓰려면 <code>.env</code> 파일에 API 키(Gemini / Claude / OpenAI)를 넣고 서버를 다시
              시작하세요. 설정 화면에서 연결 상태를 확인할 수 있습니다.
            </li>
          </ul>
        </Card>
      )}

      <Card title="이렇게 작동합니다" description="준비 → 실행 → 분석 → 비교, 다섯 단계입니다.">
        <ol className="space-y-3">
          {STEPS.map((step) => (
            <li key={step.no} className="flex gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white">
                {step.no}
              </span>
              <div>
                <p className="font-semibold text-slate-900">{step.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="이런 걸 알 수 있어요">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>어떤 프로그램 후보가 상대적으로 반응이 높은가</li>
            <li>독거·부부·자녀동거 가구의 선호가 어떻게 갈리는가</li>
            <li>참여를 막는 요인으로 무엇이 반복해서 나오는가</li>
            <li>응답이 한쪽으로 몰리는 문항은 없는가</li>
          </ul>
        </Card>
        <Card title="이렇게 지킵니다">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>개인 식별정보 컬럼은 업로드 단계에서 차단</li>
            <li>모든 데이터는 내 컴퓨터 로컬 DB에만 저장</li>
            <li>실제 조사 결과는 외부 AI로 전송하지 않음</li>
            <li>API 키는 서버 환경변수로만 사용</li>
          </ul>
        </Card>
        <Card title="이건 하지 않습니다">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>대상자 선정·위험도 판정에 사용</li>
            <li>실제 주민 의견의 대체</li>
            <li>공식 통계 추정치 제공</li>
            <li>페르소나에 없는 정보를 지어내기</li>
          </ul>
        </Card>
      </div>

      <Disclaimer />
    </div>
  );
}
