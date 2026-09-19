import { NextResponse } from 'next/server';
import { parseCsv } from '@/lib/import/csv';
import { scanColumns } from '@/lib/privacy/detect';
import { applyMapping, SKIP_COLUMN } from '@/lib/clients/mapping';
import { createDataset } from '@/lib/services/clientDatasetService';
import type { SourceMeta } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId: string;
      name: string;
      description?: string;
      csv: string;
      mapping: Record<string, string>;
      sourceMeta?: SourceMeta;
    };

    if (!body.projectId) return NextResponse.json({ error: '프로젝트를 선택하세요.' }, { status: 400 });
    if (!body.name?.trim()) return NextResponse.json({ error: '데이터셋 이름을 입력하세요.' }, { status: 400 });

    const parsed = parseCsv(body.csv ?? '');
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: '가져올 행이 없습니다.' }, { status: 400 });
    }

    // 실제로 저장되는 컬럼만 검사한다("저장하지 않음"으로 지정한 컬럼은 제외).
    const mapping = body.mapping ?? {};
    const usedColumns = parsed.headers.filter((c) => mapping[c] !== SKIP_COLUMN);
    const privacy = scanColumns(usedColumns);
    if (privacy.hasBlocked) {
      return NextResponse.json(
        {
          error: `개인 식별정보로 의심되는 컬럼이 있어 가져오기를 중단했습니다: ${privacy.blocked
            .map((b) => b.column)
            .join(', ')}. 해당 컬럼을 제거하거나 "저장하지 않음"으로 지정하세요.`,
        },
        { status: 400 }
      );
    }

    const { clients, errors } = applyMapping(parsed.rows, mapping, {
      sourceType: 'imported',
      sourceMetadata: body.sourceMeta ?? {},
    });

    const dataset = await createDataset({
      projectId: body.projectId,
      name: body.name,
      description: body.description,
      sourceMeta: {
        generation_method: 'csv_import',
        notes: '개인 식별정보 없음(업로드자 확인 기준)',
        ...(body.sourceMeta ?? {}),
      },
      clients,
    });

    return NextResponse.json({ dataset, imported: clients.length, warnings: errors }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '가져오기에 실패했습니다.' },
      { status: 500 }
    );
  }
}
