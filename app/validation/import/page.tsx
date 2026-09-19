import { PageHeader } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { ActualImportWizard } from '@/components/forms/ActualImportWizard';
import { listSurveys } from '@/lib/services/surveyService';

export const dynamic = 'force-dynamic';

export default async function ActualImportPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;

  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title="실제 조사 결과 업로드" />
        <RequireProject />
      </div>
    );
  }

  const surveys = await listSurveys(project);

  return (
    <div className="space-y-6">
      <PageHeader
        title="실제 조사 결과 업로드"
        description="실제 이용자 조사 결과(익명화된 CSV)를 올려 Synthetic 결과와 비교합니다."
      />
      <ActualImportWizard
        projectId={project}
        surveys={surveys.map((s) => ({
          id: s.id,
          label: `${s.name} (v${s.version}, ${s.questions.length}문항)`,
        }))}
      />
    </div>
  );
}
