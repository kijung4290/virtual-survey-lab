import { NextResponse } from 'next/server';
import { createSurvey } from '@/lib/services/surveyService';
import { validateSurveyQuestions } from '@/lib/survey/schema';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.projectId) return NextResponse.json({ error: '프로젝트를 선택하세요.' }, { status: 400 });
    if (!body.name?.trim()) return NextResponse.json({ error: '설문지 이름을 입력하세요.' }, { status: 400 });

    const validation = validateSurveyQuestions(body.questions);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.errors.join('\n') }, { status: 400 });
    }

    const survey = await createSurvey({
      projectId: body.projectId,
      name: body.name,
      description: body.description,
      questions: body.questions,
    });
    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '설문지를 만들 수 없습니다.' },
      { status: 500 }
    );
  }
}
