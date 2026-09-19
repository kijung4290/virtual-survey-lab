import { NextResponse } from 'next/server';
import { createRuns, executeRun, RUN_DEFAULTS, type RunConfig } from '@/lib/services/surveyRunService';

/**
 * 설문 배치 실행 시작.
 * 실행은 서버 프로세스 안에서 비동기로 진행되고, 진행률은 /api/runs/[id]/progress 로 확인한다.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RunConfig> & { confirmed?: boolean };

    if (!body.projectId || !body.surveyId || !body.datasetId) {
      return NextResponse.json({ error: '프로젝트, 설문지, 데이터셋을 모두 선택하세요.' }, { status: 400 });
    }
    if (!body.confirmed) {
      return NextResponse.json({ error: '예상 호출 수를 확인한 뒤 실행을 확정해주세요.' }, { status: 400 });
    }

    const config: RunConfig = {
      projectId: body.projectId,
      surveyId: body.surveyId,
      datasetId: body.datasetId,
      label: body.label,
      provider: body.provider || 'mock',
      model: body.model || 'mock-deterministic-v1',
      mode: body.mode === 'comprehension' ? 'comprehension' : 'answer',
      temperature: body.temperature ?? RUN_DEFAULTS.temperature,
      repeat: Math.max(1, Math.min(10, body.repeat ?? RUN_DEFAULTS.repeat)),
      concurrency: Math.max(1, Math.min(20, body.concurrency ?? RUN_DEFAULTS.concurrency)),
      requestsPerMinute: Math.max(0, Math.min(600, body.requestsPerMinute ?? 0)),
      limit: body.limit,
      segmentFilter: body.segmentFilter,
      systemPrompt: body.systemPrompt,
    };

    const { runs, batchKey, targetCount } = await createRuns(config);

    // 반복 실행은 순차적으로 진행한다(동시 호출 폭주 방지).
    void (async () => {
      for (const run of runs) {
        await executeRun(run.id);
      }
    })();

    return NextResponse.json(
      { runIds: runs.map((r) => r.id), batchKey, targetCount, firstRunId: runs[0].id },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '실행을 시작할 수 없습니다.' },
      { status: 400 }
    );
  }
}
