import { NextResponse } from 'next/server';
import { estimateRun, RUN_DEFAULTS, type RunConfig } from '@/lib/services/surveyRunService';

/** 실행 전 예상 API 호출 수 계산 (PRD 30장 비용 보호) */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RunConfig>;
    if (!body.datasetId) {
      return NextResponse.json({ error: '데이터셋을 선택하세요.' }, { status: 400 });
    }

    const estimate = await estimateRun({
      projectId: body.projectId ?? '',
      surveyId: body.surveyId ?? '',
      datasetId: body.datasetId,
      provider: body.provider ?? 'mock',
      model: body.model ?? 'mock-deterministic-v1',
      temperature: body.temperature ?? RUN_DEFAULTS.temperature,
      repeat: Math.max(1, body.repeat ?? RUN_DEFAULTS.repeat),
      concurrency: body.concurrency ?? RUN_DEFAULTS.concurrency,
      limit: body.limit,
      segmentFilter: body.segmentFilter,
    });

    return NextResponse.json(estimate);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '계산할 수 없습니다.' },
      { status: 500 }
    );
  }
}
