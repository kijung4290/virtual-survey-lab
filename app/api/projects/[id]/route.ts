import { NextResponse } from 'next/server';
import { deleteProject, updateProject } from '@/lib/services/projectService';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const project = await updateProject(id, {
      name: body.name,
      description: body.description,
      targetPopulation: body.targetPopulation,
    });
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '수정할 수 없습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제할 수 없습니다.' },
      { status: 500 }
    );
  }
}
