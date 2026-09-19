import { NextResponse } from 'next/server';
import { generateClients, type ConditionalRule, type FieldDistribution } from '@/lib/clients/generate';
import { createDataset } from '@/lib/services/clientDatasetService';
import type { SourceMeta } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId: string;
      name: string;
      description?: string;
      total: number;
      distributions: FieldDistribution[];
      conditionalRules?: ConditionalRule[];
      seed?: number;
      sourceMeta?: SourceMeta;
      preview?: boolean;
    };

    if (!body.total || body.total < 1) {
      return NextResponse.json({ error: '생성 인원을 1명 이상 입력하세요.' }, { status: 400 });
    }
    if (body.total > 5000) {
      return NextResponse.json({ error: '한 번에 생성할 수 있는 최대 인원은 5,000명입니다.' }, { status: 400 });
    }
    if (!body.distributions?.length) {
      return NextResponse.json({ error: '분포를 최소 1개 입력하세요.' }, { status: 400 });
    }

    const { clients, warnings } = generateClients({
      total: body.total,
      distributions: body.distributions,
      conditionalRules: body.conditionalRules,
      seed: body.seed,
      sourceMetadata: body.sourceMeta,
    });

    if (body.preview) {
      return NextResponse.json({ warnings, sample: clients.slice(0, 5), total: clients.length });
    }

    if (!body.projectId) return NextResponse.json({ error: '프로젝트를 선택하세요.' }, { status: 400 });
    if (!body.name?.trim()) return NextResponse.json({ error: '데이터셋 이름을 입력하세요.' }, { status: 400 });

    const dataset = await createDataset({
      projectId: body.projectId,
      name: body.name,
      description: body.description,
      sourceMeta: {
        generation_method: 'conditional_sampling',
        notes: '사용자 입력 분포 기반 생성. 개인 식별정보 없음.',
        ...(body.sourceMeta ?? {}),
      },
      clients,
    });

    return NextResponse.json({ dataset, created: clients.length, warnings }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
