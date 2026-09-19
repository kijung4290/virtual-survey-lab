import { NextResponse } from 'next/server';
import {
  exportActualCsv,
  exportClientsCsv,
  exportComparisonCsv,
  exportProjectJson,
  exportResponsesCsv,
  exportSummaryCsv,
  exportSurveyJson,
} from '@/lib/services/exportService';

/**
 * 내보내기 엔드포인트.
 * /api/export?type=clients&id=<datasetId>
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? '';
  const id = url.searchParams.get('id') ?? '';

  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  try {
    let body: string;
    let filename: string;
    let contentType = 'text/csv; charset=utf-8';

    switch (type) {
      case 'clients':
        body = await exportClientsCsv(id);
        filename = `synthetic-clients-${id}.csv`;
        break;
      case 'survey':
        body = await exportSurveyJson(id);
        filename = `survey-${id}.json`;
        contentType = 'application/json; charset=utf-8';
        break;
      case 'responses':
        body = await exportResponsesCsv(id);
        filename = `synthetic-responses-${id}.csv`;
        break;
      case 'summary':
        body = await exportSummaryCsv(id);
        filename = `synthetic-summary-${id}.csv`;
        break;
      case 'comparison':
        body = await exportComparisonCsv(id);
        filename = `comparison-${id}.csv`;
        break;
      case 'actual':
        body = await exportActualCsv(id);
        filename = `actual-responses-${id}.csv`;
        break;
      case 'project':
        body = await exportProjectJson(id);
        filename = `project-backup-${id}.json`;
        contentType = 'application/json; charset=utf-8';
        break;
      default:
        return NextResponse.json({ error: '알 수 없는 내보내기 유형입니다.' }, { status: 400 });
    }

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '내보내기에 실패했습니다.' },
      { status: 500 }
    );
  }
}
