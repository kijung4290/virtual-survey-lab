import { NextResponse } from 'next/server';
import { parseCsv } from '@/lib/import/csv';
import { scanColumns, scanValues } from '@/lib/privacy/detect';
import { applyMapping, suggestMapping } from '@/lib/clients/mapping';

/** CSV 미리보기: 헤더, 추천 매핑, 개인정보 탐지 결과를 반환 */
export async function POST(request: Request) {
  try {
    const { csv, mapping } = (await request.json()) as {
      csv: string;
      mapping?: Record<string, string>;
    };

    if (!csv?.trim()) {
      return NextResponse.json({ error: 'CSV 내용이 비어 있습니다.' }, { status: 400 });
    }

    const parsed = parseCsv(csv);
    if (parsed.headers.length === 0) {
      return NextResponse.json({ error: 'CSV 헤더를 읽을 수 없습니다.' }, { status: 400 });
    }

    const privacy = scanColumns(parsed.headers);
    const valueSuspects = scanValues(parsed.rows);
    const suggested = mapping ?? suggestMapping(parsed.headers);

    // 매핑 결과 미리보기 (앞 5명)
    const preview = applyMapping(parsed.rows.slice(0, 5), suggested);

    return NextResponse.json({
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      sample: parsed.rows.slice(0, 5),
      suggestedMapping: suggested,
      privacy,
      valueSuspects,
      previewClients: preview.clients,
      extraColumns: preview.extraColumns,
      mappingErrors: preview.errors,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'CSV 를 읽을 수 없습니다.' },
      { status: 500 }
    );
  }
}
