import { scaleLabelsOf } from '@/lib/survey/schema';
import type { SurveyQuestion } from '@/lib/types';

/**
 * 설문 문항 표현 검토 (규칙 기반).
 *
 * AI 호출 없이 문항 문장과 보기 구성만 보고 흔한 결함을 찾는다.
 * - API 키가 없어도 동작하고, 결과가 항상 같아 비교·재현이 쉽다.
 * - 조사방법론 교과서에서 반복적으로 지적되는 항목만 담았다.
 *
 * 주의: 여기서 통과했다고 "타당한 설문지"가 되는 것은 아니다.
 * 구성타당도·준거타당도는 실제 응답자 자료로만 확인할 수 있다.
 */

export type ReviewSeverity = 'high' | 'medium' | 'low';

export const REVIEW_TYPES = {
  double_barreled: '이중 질문',
  leading: '유도 질문',
  jargon: '어려운 용어',
  ambiguous: '모호한 표현',
  negation: '부정 표현',
  too_long: '문항이 김',
  option_overlap: '보기 중복·포함',
  option_missing: '보기 누락',
  option_count: '보기 수',
  scale_label: '척도 라벨',
  construct_single: '척도 묶음 구성',
  reverse_missing: '역문항 없음',
  no_open_text: '주관식 없음',
} as const;

export type ReviewType = keyof typeof REVIEW_TYPES;

export interface ReviewFinding {
  questionId: string | null;
  type: ReviewType;
  severity: ReviewSeverity;
  message: string;
  /** 어떻게 고치면 되는지 */
  suggestion: string;
  /** 문제로 본 부분 */
  evidence?: string;
}

export interface ReviewResult {
  findings: ReviewFinding[];
  /** 심각도별 개수 */
  counts: Record<ReviewSeverity, number>;
  checkedQuestions: number;
}

/** 두 가지를 한 번에 묻는지 판단할 때 쓰는 연결어 */
const CONJUNCTIONS = ['그리고', '및', '이나', '거나', '또는'];

/** "시간과 비용이", "이동과 건강을" 처럼 조사로 두 대상을 잇는 경우 */
const CONJUNCTION_PARTICLE = /([가-힣]{2,})(와|과)\s+([가-힣]{2,})/;

/** 응답을 특정 방향으로 미는 표현 */
const LEADING_WORDS = [
  '당연히',
  '반드시',
  '꼭',
  '중요한',
  '바람직한',
  '좋은',
  '훌륭한',
  '대부분의 사람들은',
  '전문가들은',
  '~해야 한다고 생각하지 않으십니까',
  '동의하시죠',
];

/** 고령 응답자에게 어려울 수 있는 용어 (기관에서 자주 쓰는 행정 용어 위주) */
const JARGON = [
  '사례관리',
  '욕구사정',
  '자원연계',
  '통합사례',
  '바우처',
  '컨설팅',
  '모니터링',
  '피드백',
  '니즈',
  '인프라',
  '거버넌스',
  '접근성',
  '만족도 제고',
  '역량강화',
  '플랫폼',
  '키오스크',
  '리터러시',
];

/** 기준이 사람마다 달라지는 표현 */
const AMBIGUOUS = ['자주', '가끔', '종종', '적절히', '충분히', '보통', '일반적으로', '대체로', '많이', '조금'];

const NEGATION = ['않는', '없는', '못하는', '아닌', '불가능한'];

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 한 문항 검토 */
function reviewQuestion(q: SurveyQuestion): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const text = normalize(q.question);

  // 1) 이중 질문 — 연결어나 조사로 두 대상을 한 번에 묻는 경우
  const conjunction = CONJUNCTIONS.find((c) => text.includes(c));
  const particle = text.match(CONJUNCTION_PARTICLE);
  if ((conjunction || particle) && text.length > 12) {
    const evidence = conjunction ?? `${particle![1]}${particle![2]} ${particle![3]}`;
    findings.push({
      questionId: q.id,
      type: 'double_barreled',
      severity: 'high',
      message: `"${evidence}" 처럼 두 가지를 한 번에 묻고 있는지 확인하세요. 응답자가 둘 중 무엇에 답했는지 알 수 없게 됩니다.`,
      suggestion: '두 개의 문항으로 나누세요. 예) "시간이 부담되나요?" / "비용이 부담되나요?"',
      evidence,
    });
  }

  // 2) 유도 질문
  const leading = LEADING_WORDS.find((w) => text.includes(w));
  if (leading) {
    findings.push({
      questionId: q.id,
      type: 'leading',
      severity: 'high',
      message: `"${leading}" 표현이 특정 답을 유도할 수 있습니다.`,
      suggestion: '가치 판단이 담긴 수식어를 빼고 중립적으로 서술하세요.',
      evidence: leading,
    });
  }

  // 3) 어려운 용어
  const jargon = JARGON.filter((w) => text.includes(w));
  if (jargon.length > 0) {
    findings.push({
      questionId: q.id,
      type: 'jargon',
      severity: 'medium',
      message: `응답자에게 생소할 수 있는 용어가 있습니다: ${jargon.join(', ')}`,
      suggestion: '일상어로 바꾸거나 괄호로 짧게 풀어 쓰세요. 예) 키오스크(무인 주문기)',
      evidence: jargon.join(', '),
    });
  }

  // 4) 모호한 빈도·정도 표현
  const ambiguous = AMBIGUOUS.filter((w) => text.includes(w));
  if (ambiguous.length > 0) {
    findings.push({
      questionId: q.id,
      type: 'ambiguous',
      severity: 'medium',
      message: `기준이 사람마다 다른 표현이 있습니다: ${ambiguous.join(', ')}`,
      suggestion: '구체적인 기준으로 바꾸세요. 예) "자주" → "주 2회 이상"',
      evidence: ambiguous.join(', '),
    });
  }

  // 5) 부정 표현 (특히 척도 문항에서 혼란을 준다)
  const negation = NEGATION.find((w) => text.includes(w));
  if (negation && (q.type === 'scale_5' || q.type === 'single_choice')) {
    findings.push({
      questionId: q.id,
      type: 'negation',
      severity: q.reverse ? 'low' : 'medium',
      message: q.reverse
        ? '역채점 문항으로 표시되어 있습니다. 채점 시 반드시 뒤집어 계산되는지 확인하세요.'
        : '부정형 문장은 "그렇지 않다"에 답할 때 이중 부정이 되어 혼란을 줍니다.',
      suggestion: q.reverse
        ? '역문항임을 설문지 안내문에도 표시하고, 분석 시 역채점 처리를 확인하세요.'
        : '긍정형으로 바꾸거나, 의도한 역문항이라면 "역채점"으로 표시하세요.',
      evidence: negation,
    });
  }

  // 6) 문항 길이
  if (text.length > 60) {
    findings.push({
      questionId: q.id,
      type: 'too_long',
      severity: 'low',
      message: `문항이 ${text.length}자로 깁니다. 읽는 도중 앞부분을 잊기 쉽습니다.`,
      suggestion: '핵심만 남기고 배경 설명은 안내문으로 옮기세요. 40자 이내를 권장합니다.',
    });
  }

  // 7) 보기 관련 검사
  if (q.type === 'single_choice' || q.type === 'multi_choice') {
    const options = (q.options ?? []).map(normalize);

    // 7-1) 중복·포함 관계
    for (let i = 0; i < options.length; i++) {
      for (let j = i + 1; j < options.length; j++) {
        const a = options[i];
        const b = options[j];
        if (!a || !b) continue;
        if (a === b || a.includes(b) || b.includes(a)) {
          findings.push({
            questionId: q.id,
            type: 'option_overlap',
            severity: 'high',
            message: `보기 "${a}" 와 "${b}" 가 서로 겹칩니다. 응답자가 어느 쪽을 골라야 할지 모호합니다.`,
            suggestion: '보기끼리 겹치지 않게(상호배타적으로) 나누세요.',
            evidence: `${a} / ${b}`,
          });
        }
      }
    }

    // 7-2) 빠져나갈 보기
    const hasEscape = options.some((o) => /기타|없음|해당\s*없음|모름|잘 모르겠/.test(o));
    if (!hasEscape && q.type === 'single_choice') {
      findings.push({
        questionId: q.id,
        type: 'option_missing',
        severity: 'medium',
        message: '해당 사항이 없는 응답자가 고를 보기가 없습니다.',
        suggestion: '"기타", "해당 없음", "잘 모르겠다" 중 필요한 것을 추가하세요.',
      });
    }

    // 7-3) 보기 수
    if (options.length > 8) {
      findings.push({
        questionId: q.id,
        type: 'option_count',
        severity: 'low',
        message: `보기가 ${options.length}개입니다. 구두로 읽어주는 조사에서는 기억하기 어렵습니다.`,
        suggestion: '비슷한 보기를 묶어 7개 이하로 줄이거나, 카드·보기표를 함께 제공하세요.',
      });
    }
  }

  // 8) 척도 라벨 균형 — 부정 라벨을 먼저 걸러낸 뒤 긍정을 센다.
  //    ("별로 참여하고 싶지 않다" 를 긍정으로 세면 안 된다)
  if (q.type === 'scale_5') {
    const labels = scaleLabelsOf(q);
    const isNegative = (l: string) => /않|없|못|불만|아니|싫/.test(l);
    const isPositive = (l: string) => !isNegative(l) && /좋|만족|그렇다|싶다|동의|한다/.test(l);
    const negative = labels.filter(isNegative).length;
    const positive = labels.filter(isPositive).length;
    if (positive !== negative) {
      findings.push({
        questionId: q.id,
        type: 'scale_label',
        severity: 'medium',
        message: `척도 라벨이 한쪽으로 기울어 있습니다(긍정 ${positive}개 / 부정 ${negative}개).`,
        suggestion: '중간값을 기준으로 긍정·부정 라벨 수와 강도를 대칭으로 맞추세요.',
        evidence: labels.join(' / '),
      });
    }
  }

  return findings;
}

/** 설문지 전체 검토 */
export function reviewSurvey(questions: SurveyQuestion[]): ReviewResult {
  const findings: ReviewFinding[] = questions.flatMap(reviewQuestion);

  // 설문지 수준 검사
  const scaleItems = questions.filter((q) => q.type === 'scale_5' || q.type === 'number');
  const constructs = new Map<string, SurveyQuestion[]>();
  for (const q of scaleItems) {
    if (!q.construct) continue;
    const list = constructs.get(q.construct) ?? [];
    list.push(q);
    constructs.set(q.construct, list);
  }

  for (const [name, items] of constructs) {
    if (items.length < 3) {
      findings.push({
        questionId: null,
        type: 'construct_single',
        severity: 'medium',
        message: `"${name}" 척도 묶음의 문항이 ${items.length}개뿐입니다. 신뢰도(α)를 계산해도 값이 불안정합니다.`,
        suggestion: '같은 개념을 재는 문항을 3개 이상으로 늘리세요.',
      });
    }
    if (!items.some((q) => q.reverse)) {
      findings.push({
        questionId: null,
        type: 'reverse_missing',
        severity: 'low',
        message: `"${name}" 묶음에 역채점 문항이 없습니다. 모두 같은 방향이면 무성의한 일괄 응답을 걸러내기 어렵습니다.`,
        suggestion: '방향을 뒤집은 문항을 1개 넣고 "역채점"으로 표시하세요.',
      });
    }
  }

  if (scaleItems.length >= 3 && constructs.size === 0) {
    findings.push({
      questionId: null,
      type: 'construct_single',
      severity: 'low',
      message: '척도 문항에 "척도 묶음" 이름이 지정되지 않아 신뢰도·문항 변별도를 계산할 수 없습니다.',
      suggestion: '같은 개념을 재는 문항에 같은 묶음 이름을 지정하세요(예: 참여의향).',
    });
  }

  if (!questions.some((q) => q.type === 'open_text')) {
    findings.push({
      questionId: null,
      type: 'no_open_text',
      severity: 'low',
      message: '주관식 문항이 없어 미리 준비한 보기 밖의 의견을 확인할 수 없습니다.',
      suggestion: '"이 외에 필요한 지원이 있다면 적어주세요" 같은 문항을 1개 넣어보세요.',
    });
  }

  const counts: Record<ReviewSeverity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return { findings, counts, checkedQuestions: questions.length };
}
