import Link from 'next/link';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { listDatasets } from '@/lib/services/clientDatasetService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title="Synthetic Clients" />
        <RequireProject />
      </div>
    );
  }

  const datasets = await listDatasets(project);
  const q = `?project=${project}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Synthetic Clients"
        description="가상 이용자 패널입니다. 실제 인물이 아니며 개인 식별정보를 담지 않습니다."
        action={
          <>
            <LinkButton href={`/clients/import${q}`} variant="primary">
              CSV 가져오기
            </LinkButton>
            <LinkButton href={`/clients/generate${q}`}>분포로 생성</LinkButton>
          </>
        }
      />

      <Card title="데이터셋 목록" description="설문 실행에 사용한 데이터셋은 이후 수정 시 새 버전으로 저장됩니다.">
        {datasets.length === 0 ? (
          <EmptyState
            title="아직 데이터셋이 없습니다."
            description="기존 합성 데이터 CSV 를 가져오거나, 연령·가구형태 등 분포를 입력해 생성할 수 있습니다."
            action={
              <>
                <LinkButton href={`/clients/import${q}`} variant="primary">
                  CSV 가져오기
                </LinkButton>
                <LinkButton href={`/clients/generate${q}`}>분포로 생성</LinkButton>
              </>
            }
          />
        ) : (
          <Table caption="Synthetic Client 데이터셋 목록">
            <thead>
              <tr>
                <Th>이름</Th>
                <Th>버전</Th>
                <Th className="text-right">인원</Th>
                <Th>생성 방식</Th>
                <Th>상태</Th>
                <Th>생성일</Th>
                <Th>내보내기</Th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <Link href={`/clients/${d.id}${q}`} className="font-medium text-blue-800 underline">
                      {d.name}
                    </Link>
                    {d.description && <p className="text-xs text-slate-500">{d.description}</p>}
                  </Td>
                  <Td>v{d.version}</Td>
                  <Td className="text-right">{d.clientCount.toLocaleString()}명</Td>
                  <Td className="text-xs text-slate-600">{d.sourceMeta.generation_method ?? '-'}</Td>
                  <Td>{d.locked ? <Badge tone="info">실행에 사용됨</Badge> : <Badge>미사용</Badge>}</Td>
                  <Td>{formatDateTime(d.createdAt)}</Td>
                  <Td>
                    <a className="text-blue-800 underline" href={`/api/export?type=clients&id=${d.id}`}>
                      CSV
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
