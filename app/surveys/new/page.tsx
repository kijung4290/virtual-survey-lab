import { PageHeader } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { SurveyBuilder } from '@/components/forms/SurveyBuilder';

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        title="설문지 만들기"
        description="실제 조사에 사용할 문항을 그대로 작성하세요. 같은 문항을 Synthetic Client 에게 먼저 실행해 볼 수 있습니다."
      />
      {project ? <SurveyBuilder projectId={project} /> : <RequireProject />}
    </div>
  );
}
