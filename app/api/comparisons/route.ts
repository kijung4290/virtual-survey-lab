import { NextResponse } from 'next/server';
import { createComparison } from '@/lib/services/comparisonService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.projectId || !body.runId || !body.actualDatasetId) {
      return NextResponse.json(
        { error: 'Synthetic 실행과 실제 조사 데이터를 모두 선택하세요.' },
        { status: 400 }
      );
    }
    const report = await createComparison({
      projectId: body.projectId,
      runId: body.runId,
      actualDatasetId: body.actualDatasetId,
      title: body.title,
    });
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '비교 리포트를 만들 수 없습니다.' },
      { status: 400 }
    );
  }
}
