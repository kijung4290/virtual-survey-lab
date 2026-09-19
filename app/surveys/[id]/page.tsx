import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { SurveyBuilder } from '@/components/forms/SurveyBuilder';
import { prisma } from '@/lib/db';
import { getSurvey, getSurveyVersions } from '@/lib/services/surveyService';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SurveyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { id } = await params;
  const { project } = await searchParams;

  const survey = await getSurvey(id);
  if (!survey) notFound();

  const [versions, runCount] = await Promise.all([
    getSurveyVersions(survey.lineageId),
    prisma.surveyRun.count({ where: { surveyId: survey.id } }),
  ]);

  const projectId = project ?? survey.projectId;
  const q = `?project=${projectId}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${survey.name} (v${survey.version})`}
        description={survey.description ?? undefined}
        action={
          <>
            <LinkButton href={`/api/export?type=survey&id=${survey.id}`}>JSON 내보내기</LinkButton>
            <LinkButton href={`/runs/new${q}&survey=${survey.id}`} variant="primary">
              이 설문 실행
            </LinkButton>
          </>
        }
      />

      {versions.length > 1 && (
        <Card title="버전 기록" description="각 실행은 실행 당시 버전을 그대로 유지합니다.">
          <Table caption="설문 버전 목록">
            <thead>
              <tr>
                <Th>버전</Th>
                <Th className="text-right">문항 수</Th>
                <Th>생성일</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <Td>
                    <Link href={`/surveys/${v.id}${q}`} className="text-blue-800 underline">
                      v{v.version}
                    </Link>
                  </Td>
                  <Td className="text-right">{v.questions.length}</Td>
                  <Td>{formatDateTime(v.createdAt)}</Td>
                  <Td>{v.id === survey.id ? <Badge tone="info">보는 중</Badge> : v.locked ? <Badge>이전</Badge> : <Badge tone="success">현재</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <SurveyBuilder
        projectId={projectId}
        survey={{
          id: survey.id,
          name: survey.name,
          description: survey.description,
          version: survey.version,
          questions: survey.questions,
          locked: survey.locked,
          runCount,
        }}
      />
    </div>
  );
}
