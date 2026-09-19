import { PageHeader } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { ClientImportWizard } from '@/components/forms/ClientImportWizard';

export default async function ClientImportPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Synthetic Client CSV 가져오기"
        description="이미 가지고 있는 합성 데이터(CSV)를 불러와 가상 이용자 패널로 만듭니다. 실제 사례관리 대상자의 정보를 입력하는 기능이 아닙니다."
      />
      {project ? <ClientImportWizard projectId={project} /> : <RequireProject />}
    </div>
  );
}
