import { NextResponse } from 'next/server';
import { previewActualCsv } from '@/lib/services/actualSurveyService';
import { getSurvey } from '@/lib/services/surveyService';

export async function POST(request: Request) {
  try {
    const { csv, surveyId } = (await request.json()) as { csv: string; surveyId: string };
    if (!csv?.trim()) return NextResponse.json({ error: 'CSV 내용이 비어 있습니다.' }, { status: 400 });

    const survey = await getSurvey(surveyId);
    if (!survey) return NextResponse.json({ error: '비교 대상 설문지를 선택하세요.' }, { status: 400 });

    return NextResponse.json({
      ...previewActualCsv(csv, survey.questions),
      questions: survey.questions.map((q) => ({ id: q.id, question: q.question, type: q.type })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'CSV 를 읽을 수 없습니다.' },
      { status: 500 }
    );
  }
}
