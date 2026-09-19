import { Badge } from '@/components/ui';

const RUN_MAP: Record<string, { tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  PENDING: { tone: 'neutral', label: '대기' },
  RUNNING: { tone: 'info', label: '실행 중' },
  SUCCESS: { tone: 'success', label: '완료' },
  FAILED: { tone: 'danger', label: '실패' },
  CANCELLED: { tone: 'warning', label: '중단' },
};

const RESPONSE_MAP: Record<string, { tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  PENDING: { tone: 'neutral', label: '대기' },
  RUNNING: { tone: 'info', label: '진행' },
  SUCCESS: { tone: 'success', label: '성공' },
  FAILED: { tone: 'danger', label: '호출 실패' },
  INVALID_RESPONSE: { tone: 'warning', label: '형식 오류' },
  RATE_LIMITED: { tone: 'warning', label: '호출 한도' },
};

export function RunStatusBadge({ status }: { status: string }) {
  const item = RUN_MAP[status] ?? { tone: 'neutral' as const, label: status };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function ResponseStatusBadge({ status }: { status: string }) {
  const item = RESPONSE_MAP[status] ?? { tone: 'neutral' as const, label: status };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
