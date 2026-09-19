/**
 * 개인 식별정보 의심 컬럼 탐지.
 * 완전한 보호 장치가 아니며, 사용자가 우회할 수 있다는 점을 UI 에 함께 안내한다.
 */

/** 발견 시 업로드를 차단하는 강한 식별자 */
export const BLOCKED_COLUMN_PATTERNS = [
  'resident_number',
  'residentnumber',
  'rrn',
  'ssn',
  '주민등록번호',
  '주민번호',
  'phone',
  'phonenumber',
  'mobile',
  'telephone',
  '전화번호',
  '휴대폰',
  '연락처',
  'email',
  'e-mail',
  '이메일',
  'address',
  'addr',
  '주소',
  'name',
  'fullname',
  '이름',
  '성명',
];

/** 발견 시 경고만 표시하는 준식별자 */
export const WARNING_COLUMN_PATTERNS = [
  'birth',
  'birthday',
  'birthdate',
  '생년월일',
  '생일',
  'account',
  '계좌',
  'card',
  '카드번호',
  'device_id',
  '상세주소',
  '동호수',
];

export type PrivacySeverity = 'blocked' | 'warning';

export interface PrivacyFinding {
  column: string;
  matched: string;
  severity: PrivacySeverity;
}

export interface PrivacyScanResult {
  findings: PrivacyFinding[];
  blocked: PrivacyFinding[];
  warnings: PrivacyFinding[];
  hasBlocked: boolean;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[\s._-]/g, '');
}

/** 컬럼명 목록에서 개인정보 의심 컬럼을 찾는다. */
export function scanColumns(columns: string[]): PrivacyScanResult {
  const findings: PrivacyFinding[] = [];

  for (const col of columns) {
    const n = normalize(col);
    if (!n) continue;

    const blockedHit = BLOCKED_COLUMN_PATTERNS.find((p) => n.includes(normalize(p)));
    if (blockedHit) {
      findings.push({ column: col, matched: blockedHit, severity: 'blocked' });
      continue;
    }
    const warnHit = WARNING_COLUMN_PATTERNS.find((p) => n.includes(normalize(p)));
    if (warnHit) {
      findings.push({ column: col, matched: warnHit, severity: 'warning' });
    }
  }

  const blocked = findings.filter((f) => f.severity === 'blocked');
  const warnings = findings.filter((f) => f.severity === 'warning');
  return { findings, blocked, warnings, hasBlocked: blocked.length > 0 };
}

/** 값 자체에서 명백한 식별정보 패턴(주민번호/휴대폰/이메일)이 있는 컬럼을 찾는다. */
export function scanValues(rows: Record<string, string>[], sampleSize = 200): string[] {
  const suspicious = new Set<string>();
  const rrn = /\b\d{6}\s*-\s*[1-4]\d{6}\b/;
  const phone = /\b01[016-9]\s*-?\s*\d{3,4}\s*-?\s*\d{4}\b/;
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/;

  for (const row of rows.slice(0, sampleSize)) {
    for (const [k, v] of Object.entries(row)) {
      if (!v) continue;
      if (rrn.test(v) || phone.test(v) || email.test(v)) suspicious.add(k);
    }
  }
  return [...suspicious];
}
