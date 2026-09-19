import { NextResponse } from 'next/server';
import { datasetFieldValues } from '@/lib/services/clientDatasetService';

/**
 * 데이터셋에 실제로 존재하는 속성 값 목록.
 * 세그먼트 필터에서 값을 직접 입력하지 않고 고르게 하기 위해 사용한다.
 * 예: /api/datasets/<id>/values?field=householdType
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const field = new URL(request.url).searchParams.get('field') ?? '';

  if (!field) {
    return NextResponse.json({ error: '속성(field)을 지정하세요.' }, { status: 400 });
  }

  try {
    const values = await datasetFieldValues(id, field);
    return NextResponse.json({ field, values });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '값 목록을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}
