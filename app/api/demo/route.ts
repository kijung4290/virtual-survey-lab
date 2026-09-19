import { NextResponse } from 'next/server';
import { createDemoProject, findDemoProject } from '@/lib/services/demoService';

/** 현재 데모 프로젝트가 있는지 */
export async function GET() {
  const demo = await findDemoProject();
  return NextResponse.json({ exists: Boolean(demo), project: demo });
}

/**
 * 데모 데이터 한 번에 만들기.
 * API 키가 없어도 Mock Provider(비용 0)로 전체 흐름과 결과 화면을 볼 수 있다.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await createDemoProject({
      replace: Boolean(body?.replace),
      clientCount: 30,
      actualCount: 50,
      repeat: 2,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '데모 데이터를 만들지 못했습니다.' },
      { status: 400 }
    );
  }
}
