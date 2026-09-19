import { NextResponse } from 'next/server';
import { createProject, listProjects } from '@/lib/services/projectService';

export async function GET() {
  return NextResponse.json(await listProjects());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: '프로젝트 이름을 입력하세요.' }, { status: 400 });
    }
    const project = await createProject({
      name: body.name,
      description: body.description,
      targetPopulation: body.targetPopulation,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프로젝트를 만들 수 없습니다.' },
      { status: 500 }
    );
  }
}
