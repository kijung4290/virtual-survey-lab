import Link from 'next/link';
import { Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { ProjectForm } from '@/components/forms/ProjectForm';
import { listProjects } from '@/lib/services/projectService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="space-y-6">
      <PageHeader
        title="프로젝트"
        description="하나의 프로젝트 안에 Synthetic Client 데이터셋, 설문지, 실행 기록, 실제 조사 결과, 비교 리포트가 함께 묶입니다."
      />

      <Card title="프로젝트 목록">
        {projects.length === 0 ? (
          <EmptyState
            title="아직 프로젝트가 없습니다."
            description="아래 양식으로 첫 프로젝트를 만들어보세요. 데모 데이터를 원하면 터미널에서 npm run seed 를 실행하세요."
          />
        ) : (
          <Table caption="프로젝트 목록">
            <thead>
              <tr>
                <Th>이름</Th>
                <Th>조사 대상</Th>
                <Th className="text-right">가상 이용자</Th>
                <Th className="text-right">설문지</Th>
                <Th className="text-right">실행</Th>
                <Th>최근 수정</Th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/projects/${p.id}?project=${p.id}`} className="font-medium text-blue-800 underline">
                      {p.name}
                    </Link>
                    {p.description && <p className="mt-0.5 text-xs text-slate-500">{p.description}</p>}
                  </Td>
                  <Td>{p.targetPopulation ?? '-'}</Td>
                  <Td className="text-right">{p.clientTotal.toLocaleString()}명</Td>
                  <Td className="text-right">{p._count.surveys}</Td>
                  <Td className="text-right">{p._count.runs}</Td>
                  <Td>{formatDateTime(p.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="새 프로젝트 만들기">
        <ProjectForm />
      </Card>
    </div>
  );
}
