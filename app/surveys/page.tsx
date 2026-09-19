import Link from 'next/link';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { RequireProject } from '@/components/RequireProject';
import { listSurveys } from '@/lib/services/surveyService';
import { QUESTION_TYPE_LABEL } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title="설문지" />
        <RequireProject />
      </div>
    );
  }

  const surveys = await listSurveys(project);
  const q = `?project=${project}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="설문지"
        description="설문을 수정하면 새 버전으로 저장되어 기존 응답이 바뀌지 않습니다."
        action={
          <LinkButton href={`/surveys/new${q}`} variant="primary">
            설문지 만들기
          </LinkButton>
        }
      />

      <Card title="설문지 목록">
        {surveys.length === 0 ? (
          <EmptyState
            title="설문지가 없습니다."
            description="데모 설문 6문항을 불러와 빠르게 시작할 수 있습니다."
            action={
              <LinkButton href={`/surveys/new${q}`} variant="primary">
                설문지 만들기
              </LinkButton>
            }
          />
        ) : (
          <Table caption="설문지 목록">
            <thead>
              <tr>
                <Th>이름</Th>
                <Th>버전</Th>
                <Th className="text-right">문항 수</Th>
                <Th>문항 구성</Th>
                <Th className="text-right">실행</Th>
                <Th>수정일</Th>
                <Th>내보내기</Th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((s) => {
                const byType = s.questions.reduce<Record<string, number>>((acc, question) => {
                  acc[question.type] = (acc[question.type] ?? 0) + 1;
                  return acc;
                }, {});
                return (
                  <tr key={s.id}>
                    <Td>
                      <Link href={`/surveys/${s.id}${q}`} className="font-medium text-blue-800 underline">
                        {s.name}
                      </Link>
                      {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
                    </Td>
                    <Td>
                      v{s.version} {s.locked && <Badge>이전 버전</Badge>}
                    </Td>
                    <Td className="text-right">{s.questions.length}</Td>
                    <Td className="text-xs text-slate-600">
                      {Object.entries(byType)
                        .map(([t, n]) => `${QUESTION_TYPE_LABEL[t as keyof typeof QUESTION_TYPE_LABEL] ?? t} ${n}`)
                        .join(' · ')}
                    </Td>
                    <Td className="text-right">{s.runCount}</Td>
                    <Td>{formatDateTime(s.updatedAt)}</Td>
                    <Td>
                      <a className="text-blue-800 underline" href={`/api/export?type=survey&id=${s.id}`}>
                        JSON
                      </a>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
