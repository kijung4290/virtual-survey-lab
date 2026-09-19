import { NextResponse } from 'next/server';
import { deleteRun, isRunActive } from '@/lib/services/surveyRunService';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isRunActive(id)) {
    return NextResponse.json({ error: '실행 중인 작업은 삭제할 수 없습니다.' }, { status: 409 });
  }
  try {
    await deleteRun(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제할 수 없습니다.' },
      { status: 500 }
    );
  }
}
