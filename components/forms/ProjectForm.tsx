'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Notice, Textarea } from '@/components/ui';

export function ProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [targetPopulation, setTargetPopulation] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, targetPopulation, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
      router.push(`/projects/${data.id}?project=${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}

      <Field label="프로젝트 이름" htmlFor="project-name" required>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 2027년 노인복지 프로그램 욕구조사 사전실험"
          required
        />
      </Field>

      <Field label="조사 대상" htmlFor="project-target" hint="예: 65세 이상 지역주민">
        <Input
          id="project-target"
          value={targetPopulation}
          onChange={(e) => setTargetPopulation(e.target.value)}
          placeholder="예: 65세 이상 지역주민"
        />
      </Field>

      <Field label="설명" htmlFor="project-desc" hint="조사 목적, 기획 배경 등을 자유롭게 적어두세요.">
        <Textarea id="project-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
        {saving ? '만드는 중…' : '프로젝트 만들기'}
      </Button>
    </form>
  );
}
