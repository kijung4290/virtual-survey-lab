import { NextResponse } from 'next/server';
import { resumeRun } from '@/lib/services/surveyRunService';

/** 실패/미완료 응답만 다시 실행 (PRD 31장 Resume) */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await resumeRun(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '재실행할 수 없습니다.' },
      { status: 400 }
    );
  }
}
