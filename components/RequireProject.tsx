import { LinkButton, EmptyState } from '@/components/ui';

/** 프로젝트가 선택되지 않은 화면에서 공통으로 보여주는 안내 */
export function RequireProject({ message }: { message?: string }) {
  return (
    <EmptyState
      title="먼저 프로젝트를 선택하세요."
      description={
        message ??
        '왼쪽 메뉴 위쪽의 "작업 중인 프로젝트"에서 프로젝트를 선택하면 이 화면이 열립니다. 프로젝트가 없으면 새로 만들어주세요.'
      }
      action={<LinkButton href="/projects" variant="primary">프로젝트 목록으로</LinkButton>}
    />
  );
}
