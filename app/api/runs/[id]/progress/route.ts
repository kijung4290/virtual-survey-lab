import { NextResponse } from 'next/server';
import { runProgress } from '@/lib/services/surveyRunService';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const progress = await runProgress(id);
  if (!progress) return NextResponse.json({ error: '실행 기록을 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json(progress);
}
