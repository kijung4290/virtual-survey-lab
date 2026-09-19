import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, LinkButton, Notice, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { datasetProfile, getDataset, listClients } from '@/lib/services/clientDatasetService';
import { CLIENT_FIELD_LABEL } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function DatasetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{ project?: string; page?: string; q?: string }>;
}) {
  const { datasetId } = await params;
  const { project, page, q } = await searchParams;

  const dataset = await getDataset(datasetId);
  if (!dataset) notFound();

  const currentPage = Math.max(1, Number(page ?? '1') || 1);
  const [{ clients, total }, profile] = await Promise.all([
    listClients(datasetId, { skip: (currentPage - 1) * PAGE_SIZE, take: PAGE_SIZE, search: q }),
    datasetProfile(datasetId),
  ]);

  const projectQuery = project ?? dataset.projectId;
  const linkBase = `/clients/${datasetId}?project=${projectQuery}`;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${dataset.name} (v${dataset.version})`}
        description={dataset.description ?? '가상 이용자 패널 상세'}
        action={
          <>
            <LinkButton href={`/api/export?type=clients&id=${datasetId}`}>CSV 내보내기</LinkButton>
            <LinkButton href={`/runs/new?project=${projectQuery}&dataset=${datasetId}`} variant="primary">
              이 패널로 설문 실행
            </LinkButton>
          </>
        }
      />

      <Notice tone="info" title="데이터 출처">
        <dl className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {Object.entries(dataset.sourceMeta).length === 0 ? (
            <div>기록된 출처 정보가 없습니다.</div>
          ) : (
            Object.entries(dataset.sourceMeta).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="font-medium">{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))
          )}
        </dl>
        <p className="mt-2 text-xs">생성일 {formatDateTime(dataset.createdAt)}</p>
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="총 인원" value={`${profile.total.toLocaleString()}명`} />
        <StatCard label="평균 연령" value={profile.ageMean ?? '-'} sub={profile.ageMin !== null ? `${profile.ageMin}~${profile.ageMax}세` : undefined} />
        <StatCard
          label="가구형태 최다"
          value={profile.profile[0]?.buckets[0]?.value ?? '-'}
          sub={profile.profile[0]?.buckets[0] ? `${profile.profile[0].buckets[0].count}명` : undefined}
        />
        <StatCard label="데이터셋 버전" value={`v${dataset.version}`} sub={dataset.locked ? '실행에 사용됨' : '미사용'} />
      </div>

      <Card title="패널 구성" description="속성별 인원 분포입니다.">
        <div className="grid gap-6 md:grid-cols-2">
          {profile.profile.map((p) => (
            <div key={p.field}>
              <h3 className="text-sm font-semibold text-slate-800">{CLIENT_FIELD_LABEL[p.field] ?? p.field}</h3>
              <Table caption={`${p.field} 분포`}>
                <thead>
                  <tr>
                    <Th>값</Th>
                    <Th className="text-right">인원</Th>
                    <Th className="text-right">비율</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.buckets.map((b) => (
                    <tr key={b.value}>
                      <Td>{b.value}</Td>
                      <Td className="text-right">{b.count}</Td>
                      <Td className="text-right">
                        {profile.total ? ((b.count / profile.total) * 100).toFixed(1) : '0.0'}%
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Synthetic Client 목록"
        description={`${total.toLocaleString()}명 중 ${currentPage}페이지 / 전체 ${totalPages}페이지`}
      >
        <form className="mb-4 flex flex-wrap gap-2" action={`/clients/${datasetId}`} method="get">
          <input type="hidden" name="project" value={projectQuery} />
          <label className="sr-only" htmlFor="client-search">
            검색
          </label>
          <input
            id="client-search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="식별번호, 가구형태, 요약 내용 검색"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            검색
          </button>
        </form>

        <Table caption="Synthetic Client 목록">
          <thead>
            <tr>
              <Th>식별번호</Th>
              <Th className="text-right">연령</Th>
              <Th>성별</Th>
              <Th>가구형태</Th>
              <Th>경제수준</Th>
              <Th>이동 불편</Th>
              <Th>디지털</Th>
              <Th>Persona Summary</Th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <Td className="font-mono text-xs">{c.localId}</Td>
                <Td className="text-right">{c.age ?? '-'}</Td>
                <Td>{c.sex ?? '-'}</Td>
                <Td>{c.householdType ?? '-'}</Td>
                <Td>{c.economicStatus ?? '-'}</Td>
                <Td>{c.mobilityDifficulty ?? '-'}</Td>
                <Td>{c.digitalLiteracy ?? '-'}</Td>
                <Td>
                  <details>
                    <summary className="cursor-pointer text-sm text-blue-800">요약 보기</summary>
                    <p className="mt-2 max-w-xl whitespace-pre-line text-sm text-slate-700">{c.personaSummary}</p>
                    {Object.keys(c.attributes).length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        사용자 정의 필드:{' '}
                        {Object.entries(c.attributes)
                          .map(([k, v]) => `${k}=${String(v)}`)
                          .join(', ')}
                      </p>
                    )}
                  </details>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <nav aria-label="페이지 이동" className="mt-4 flex items-center justify-between text-sm">
          <div>
            {currentPage > 1 && (
              <Link className="text-blue-800 underline" href={`${linkBase}&page=${currentPage - 1}${q ? `&q=${q}` : ''}`}>
                ← 이전
              </Link>
            )}
          </div>
          <div>
            {currentPage < totalPages && (
              <Link className="text-blue-800 underline" href={`${linkBase}&page=${currentPage + 1}${q ? `&q=${q}` : ''}`}>
                다음 →
              </Link>
            )}
          </div>
        </nav>
      </Card>
    </div>
  );
}
