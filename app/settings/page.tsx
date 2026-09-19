import { Badge, Card, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { defaultProviderId, listProviders } from '@/lib/ai';
import { listAudit } from '@/lib/services/auditService';
import { BLOCKED_COLUMN_PATTERNS } from '@/lib/privacy/detect';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  const providers = listProviders();
  const audit = await listAudit(project, 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="설정"
        description="AI Provider 연결 상태와 변경 기록을 확인합니다. API Key 는 이 화면에 표시되지 않으며 서버 환경변수에서만 읽습니다."
      />

      <Card title="AI Provider" description="기본 Provider 는 .env 의 DEFAULT_LLM_PROVIDER 로 지정합니다.">
        <Table caption="Provider 상태">
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th>사용 가능</Th>
              <Th>모델</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <Td>
                  {p.label}
                  {p.id === defaultProviderId() && (
                    <span className="ml-2">
                      <Badge tone="info">기본값</Badge>
                    </span>
                  )}
                </Td>
                <Td>{p.ready ? <Badge tone="success">사용 가능</Badge> : <Badge tone="warning">설정 필요</Badge>}</Td>
                <Td className="text-xs font-mono">{p.models.join(', ')}</Td>
                <Td className="text-xs text-slate-600">{p.hint ?? '-'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <Notice tone="info" title="API Key 설정 방법">
          프로젝트 폴더의 <code>.env.example</code> 파일을 <code>.env</code> 로 복사한 뒤 키를 입력하고 개발 서버를
          다시 시작하세요. <code>.env</code> 와 <code>*.db</code> 파일은 git 에 커밋되지 않습니다.
        </Notice>
      </Card>

      <Card title="개인정보 보호" description="CSV 업로드 시 아래 컬럼명이 발견되면 가져오기를 차단합니다.">
        <p className="text-sm text-slate-700">
          차단 대상 컬럼명 패턴: <span className="font-mono text-xs">{BLOCKED_COLUMN_PATTERNS.join(', ')}</span>
        </p>
        <Notice tone="warning" title="완전한 보호 장치가 아닙니다">
          컬럼명을 바꾸면 탐지를 우회할 수 있습니다. 업로드 전 파일에 개인 식별정보가 없는지 직접 확인하세요. 이
          도구는 실제 사례관리 대상자 정보를 다루기 위한 시스템이 아닙니다.
        </Notice>
      </Card>

      <Card title="사용 범위 안내">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Synthetic 결과를 복지서비스 대상자 선정에 사용하지 않습니다.</li>
          <li>위험도 판정, 사례관리 개입 우선순위 결정에 사용하지 않습니다.</li>
          <li>실제 주민의 의견을 Synthetic Survey 결과로 대체하지 않습니다.</li>
          <li>의료·정신건강·학대·위기상황 판단에 사용하지 않습니다.</li>
          <li>공식 통계 추정치나 대표성을 보장하지 않습니다.</li>
        </ul>
      </Card>

      <Card title="변경 기록 (감사 로그)" description="연구 재현성을 위해 주요 변경 이력을 남깁니다.">
        {audit.length === 0 ? (
          <p className="text-sm text-slate-600">기록이 없습니다.</p>
        ) : (
          <Table caption="감사 로그">
            <thead>
              <tr>
                <Th>시각</Th>
                <Th>작업</Th>
                <Th>프로젝트</Th>
                <Th>상세</Th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(a.createdAt)}</Td>
                  <Td>{a.actionLabel}</Td>
                  <Td>{a.projectName ?? '-'}</Td>
                  <Td className="max-w-lg break-all text-xs text-slate-600">{JSON.stringify(a.detail)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
