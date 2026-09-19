import { NextResponse } from 'next/server';
import { latestReviews, runAiReview, runRuleReview } from '@/lib/services/reviewService';

/** 설문지의 최근 검토 결과 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ reviews: await latestReviews(id) });
}

/**
 * 문항 표현 검토 실행.
 * body.source: 'rule'(기본, 무료) | 'ai'(모델 호출 1회)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = body.projectId as string | undefined;
    if (!projectId) {
      return NextResponse.json({ error: '프로젝트를 선택하세요.' }, { status: 400 });
    }

    if (body.source === 'ai') {
      const result = await runAiReview(projectId, id, {
        provider: body.provider ?? 'gemini',
        model: body.model ?? '',
        temperature: body.temperature ?? 0.2,
        targetPopulation: body.targetPopulation ?? null,
      });
      return NextResponse.json({ source: 'ai', ...result }, { status: 201 });
    }

    const result = await runRuleReview(projectId, id);
    return NextResponse.json({ source: 'rule', ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '검토에 실패했습니다.' },
      { status: 400 }
    );
  }
}
