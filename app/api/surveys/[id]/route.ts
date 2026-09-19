import { NextResponse } from 'next/server';
import { createSurveyVersion, deleteSurvey } from '@/lib/services/surveyService';

/** 설문 수정: 실행 기록이 있으면 새 버전을 만든다 (기존 응답 보존) */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const survey = await createSurveyVersion(id, {
      name: body.name,
      description: body.description,
      questions: body.questions,
    });
    return NextResponse.json(survey);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '저장할 수 없습니다.' },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteSurvey(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제할 수 없습니다.' },
      { status: 500 }
    );
  }
}
