import { PageHeader } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { ClientGenerator } from '@/components/forms/ClientGenerator';

export default async function ClientGeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        title="분포로 Synthetic Client 생성"
        description="연령·가구형태 등 비율을 입력하면 그 비율에 맞는 가상 이용자 패널을 만듭니다. 공개 통계 수치를 직접 입력해 사용하세요."
      />
      {project ? <ClientGenerator projectId={project} /> : <RequireProject />}
    </div>
  );
}
