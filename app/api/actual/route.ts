import { NextResponse } from 'next/server';
import { importActualDataset } from '@/lib/services/actualSurveyService';

/** 실제 조사 결과 CSV 가져오기 (로컬 DB 에만 저장, 외부 LLM 전송 없음) */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.projectId || !body.surveyId) {
      return NextResponse.json({ error: '프로젝트와 설문지를 선택하세요.' }, { status: 400 });
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: '데이터 이름을 입력하세요.' }, { status: 400 });
    }

    const dataset = await importActualDataset({
      projectId: body.projectId,
      surveyId: body.surveyId,
      name: body.name,
      surveyDate: body.surveyDate,
      notes: body.notes,
      csv: body.csv,
      columnMap: body.columnMap ?? {},
    });

    return NextResponse.json({ dataset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '가져오기에 실패했습니다.' },
      { status: 400 }
    );
  }
}
