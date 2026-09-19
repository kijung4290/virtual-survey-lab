import { PageHeader } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { RequireProject } from '@/components/RequireProject';
import { RunLauncher } from '@/components/forms/RunLauncher';
import { defaultProviderId, listProviders } from '@/lib/ai';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai/prompts/surveyPrompt';
import { listDatasets } from '@/lib/services/clientDatasetService';
import { listSurveys } from '@/lib/services/surveyService';

export const dynamic = 'force-dynamic';

export default async function NewRunPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; survey?: string; dataset?: string }>;
}) {
  const { project, survey, dataset } = await searchParams;

  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title="설문 실행" />
        <RequireProject />
      </div>
    );
  }

  const [surveys, datasets] = await Promise.all([listSurveys(project), listDatasets(project)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="설문 실행"
        description="Synthetic Client 1명이 독립 응답자 1명입니다. 각 응답자는 자신의 페르소나 정보만 전달받고 다른 응답자의 응답은 볼 수 없습니다."
      />

      <RunLauncher
        projectId={project}
        surveys={surveys
          .filter((s) => !s.locked)
          .map((s) => ({ id: s.id, label: `${s.name} (v${s.version}, ${s.questions.length}문항)` }))}
        datasets={datasets.map((d) => ({
          id: d.id,
          label: `${d.name} (v${d.version}, ${d.clientCount.toLocaleString()}명)`,
        }))}
        providers={listProviders()}
        defaultProvider={defaultProviderId()}
        defaultSystemPrompt={DEFAULT_SYSTEM_PROMPT}
        defaultSurveyId={survey}
        defaultDatasetId={dataset}
      />

      <Disclaimer />
    </div>
  );
}
