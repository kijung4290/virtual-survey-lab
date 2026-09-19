import { NextResponse } from 'next/server';
import { deleteComparison } from '@/lib/services/comparisonService';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteComparison(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제할 수 없습니다.' },
      { status: 500 }
    );
  }
}
