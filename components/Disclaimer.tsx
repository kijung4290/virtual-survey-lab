import { DISCLAIMER } from '@/lib/types';

/**
 * 모든 결과 화면에 표시하는 고정 안내 (PRD 4.1 / 47장 안전 요구사항).
 * 이 문구는 제거하거나 축약하지 않는다.
 */
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        ※ {DISCLAIMER}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3" role="note">
      <p className="text-sm font-semibold text-amber-900">Synthetic Survey 결과 안내</p>
      <p className="mt-1 text-sm text-amber-900">{DISCLAIMER}</p>
      <p className="mt-1 text-xs text-amber-800">
        결과는 가설 탐색용입니다. 대상자 선정, 위험도 판정, 사례관리 개입 결정에 사용하지 마세요.
      </p>
    </div>
  );
}

export function SyntheticQuoteNotice() {
  return (
    <p className="text-xs text-slate-500">
      아래 인용은 <strong>Synthetic Client 응답 예시</strong>입니다. 실제 주민 발언이 아닙니다.
    </p>
  );
}

export function PrivacyWarning() {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
      <p className="font-semibold">개인정보 업로드 금지</p>
      <p className="mt-1">
        이름, 전화번호, 주소, 주민등록번호, 이메일 등 개인 식별정보를 포함하지 마세요. 익명화된 데이터만 업로드할 수
        있습니다.
      </p>
      <p className="mt-1 text-xs">
        앱이 의심 컬럼을 자동 탐지하지만 우회가 가능하므로 완전한 보호 장치가 아닙니다. 업로드 전 파일을 직접
        확인하세요.
      </p>
    </div>
  );
}
