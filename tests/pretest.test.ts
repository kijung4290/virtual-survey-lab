import { describe, expect, it } from 'vitest';
import { reviewSurvey } from '@/lib/survey/review';
import { parseAiReview } from '@/lib/services/reviewService';
import {
  analyzeConsistency,
  analyzeConstructs,
  cronbachAlpha,
  pearson,
  scoreOf,
  variance,
} from '@/lib/analytics/psychometrics';
import type { AnswerMap, SurveyQuestion } from '@/lib/types';

/** 설문지 사전점검(문항 표현 검토 + 척도 지표) 검증 */

function scale(id: string, question: string, extra: Partial<SurveyQuestion> = {}): SurveyQuestion {
  return { id, type: 'scale_5', question, ...extra };
}

describe('문항 표현 자동 검토', () => {
  it('이중 질문을 찾아낸다', () => {
    const { findings } = reviewSurvey([
      scale('Q1', '프로그램의 시간과 비용이 부담된다고 생각하십니까?'),
    ]);
    const hit = findings.find((f) => f.type === 'double_barreled');
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe('high');
    expect(hit?.suggestion).toContain('두 개의 문항');
  });

  it('유도 질문을 찾아낸다', () => {
    const { findings } = reviewSurvey([scale('Q1', '이 프로그램은 당연히 필요하다고 보십니까?')]);
    expect(findings.some((f) => f.type === 'leading')).toBe(true);
  });

  it('어려운 행정 용어를 지적한다', () => {
    const { findings } = reviewSurvey([
      scale('Q1', '사례관리 서비스의 접근성에 만족하십니까?'),
    ]);
    const hit = findings.find((f) => f.type === 'jargon');
    expect(hit?.evidence).toContain('사례관리');
  });

  it('기준이 모호한 빈도 표현을 지적한다', () => {
    const { findings } = reviewSurvey([scale('Q1', '복지관을 자주 이용하십니까?')]);
    const hit = findings.find((f) => f.type === 'ambiguous');
    expect(hit?.suggestion).toContain('주 2회 이상');
  });

  it('겹치는 보기를 찾아낸다', () => {
    const { findings } = reviewSurvey([
      {
        id: 'Q1',
        type: 'single_choice',
        question: '가장 필요한 지원은 무엇입니까?',
        options: ['건강 지원', '건강 지원 프로그램', '이동 지원', '기타'],
      },
    ]);
    expect(findings.some((f) => f.type === 'option_overlap')).toBe(true);
  });

  it('빠져나갈 보기가 없으면 알려준다', () => {
    const { findings } = reviewSurvey([
      { id: 'Q1', type: 'single_choice', question: '무엇을 선택하시겠습니까?', options: ['가', '나'] },
    ]);
    expect(findings.some((f) => f.type === 'option_missing')).toBe(true);
  });

  it('척도 라벨이 한쪽으로 기울면 지적한다', () => {
    const { findings } = reviewSurvey([
      scale('Q1', '참여 의향은 어느 정도입니까?', {
        scaleLabels: ['보통이다', '그렇다', '매우 그렇다', '정말 그렇다', '아주 매우 그렇다'],
      }),
    ]);
    expect(findings.some((f) => f.type === 'scale_label')).toBe(true);
  });

  it('부정 라벨을 긍정으로 잘못 세지 않는다(2부정/1중립/2긍정은 균형)', () => {
    const { findings } = reviewSurvey([
      scale('Q1', '참여할 의향은 어느 정도입니까?', {
        scaleLabels: [
          '전혀 참여하고 싶지 않다',
          '별로 참여하고 싶지 않다',
          '보통이다',
          '참여하고 싶다',
          '매우 참여하고 싶다',
        ],
      }),
    ]);
    expect(findings.some((f) => f.type === 'scale_label')).toBe(false);
  });

  it('척도 묶음이 2문항이면 신뢰도 계산이 불안정하다고 알린다', () => {
    const { findings } = reviewSurvey([
      scale('Q1', '참여하고 싶다', { construct: '참여의향' }),
      scale('Q2', '기회가 되면 신청하겠다', { construct: '참여의향' }),
    ]);
    expect(findings.some((f) => f.type === 'construct_single')).toBe(true);
    expect(findings.some((f) => f.type === 'reverse_missing')).toBe(true);
  });

  it('문제가 없는 문항은 조용하다', () => {
    const { findings, counts } = reviewSurvey([
      scale('Q1', '참여할 의향이 있습니까?', { construct: '참여의향' }),
      scale('Q2', '시간을 낼 수 있습니까?', { construct: '참여의향' }),
      scale('Q3', '신청 방법을 알고 있습니까?', { construct: '참여의향', reverse: false }),
      { id: 'Q4', type: 'open_text', question: '더 필요한 지원이 있다면 적어주세요.' },
    ]);
    const high = findings.filter((f) => f.severity === 'high');
    expect(high).toHaveLength(0);
    expect(counts.high).toBe(0);
  });
});

describe('척도 통계 기본 함수', () => {
  it('분산과 상관을 계산한다', () => {
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.571, 2);
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBe(1);
    expect(pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBe(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it('역채점 문항 점수를 뒤집는다', () => {
    const forward = scale('Q1', '');
    const reversed = scale('Q2', '', { reverse: true });
    expect(scoreOf(forward, 4)).toBe(4);
    expect(scoreOf(reversed, 4)).toBe(2);
    expect(scoreOf(reversed, 1)).toBe(5);
    expect(scoreOf(forward, '없음')).toBeNull();
  });

  it("Cronbach's α 를 계산한다", () => {
    // 서로 비슷하게 움직이는 3문항 → 알파가 높다
    const consistent = [
      [1, 2, 3, 4, 5, 4, 3, 2],
      [1, 2, 3, 4, 5, 4, 3, 2],
      [2, 2, 3, 4, 5, 4, 3, 3],
    ];
    const alpha = cronbachAlpha(consistent);
    expect(alpha).not.toBeNull();
    expect(alpha!).toBeGreaterThan(0.9);

    // 문항이 1개면 계산하지 않는다
    expect(cronbachAlpha([[1, 2, 3]])).toBeNull();
  });
});

describe('척도 묶음 분석', () => {
  const questions: SurveyQuestion[] = [
    scale('Q1', '참여하고 싶다', { construct: '참여의향' }),
    scale('Q2', '기회가 되면 신청하겠다', { construct: '참여의향' }),
    scale('Q3', '참여할 생각이 없다', { construct: '참여의향', reverse: true }),
    scale('Q4', '아무 상관 없는 문항', { construct: '참여의향' }),
  ];

  // Q1·Q2 는 같이 움직이고, Q3 는 역문항(뒤집으면 같이 움직인다), Q4 는 무관
  const responses: { answers: AnswerMap }[] = [
    { answers: { Q1: 5, Q2: 5, Q3: 1, Q4: 3 } },
    { answers: { Q1: 4, Q2: 4, Q3: 2, Q4: 1 } },
    { answers: { Q1: 3, Q2: 3, Q3: 3, Q4: 5 } },
    { answers: { Q1: 2, Q2: 2, Q3: 4, Q4: 2 } },
    { answers: { Q1: 1, Q2: 1, Q3: 5, Q4: 4 } },
    { answers: { Q1: 5, Q2: 4, Q3: 1, Q4: 1 } },
  ];

  it('역채점 문항을 뒤집어 계산하면 같은 방향이 된다', () => {
    const [construct] = analyzeConstructs(questions, responses);
    expect(construct.construct).toBe('참여의향');
    expect(construct.n).toBe(6);

    const q3 = construct.items.find((i) => i.questionId === 'Q3')!;
    expect(q3.reverse).toBe(true);
    expect(q3.itemTotal!).toBeGreaterThan(0.5);
  });

  it('겉도는 문항을 변별도 낮음으로 표시한다', () => {
    const [construct] = analyzeConstructs(questions, responses);
    const q4 = construct.items.find((i) => i.questionId === 'Q4')!;
    expect(q4.itemTotal!).toBeLessThan(0.3);
    expect(q4.warnings.join()).toContain('변별도');
  });

  it('문항을 빼면 알파가 올라가는 경우를 알려준다', () => {
    const [construct] = analyzeConstructs(questions, responses);
    const q4 = construct.items.find((i) => i.questionId === 'Q4')!;
    expect(q4.alphaIfDeleted).not.toBeNull();
    expect(q4.alphaIfDeleted!).toBeGreaterThan(construct.alpha!);
  });

  it('모든 응답이 같은 문항은 분산 0 으로 표시한다', () => {
    const flat: SurveyQuestion[] = [
      scale('A1', '항상 5점', { construct: '테스트' }),
      scale('A2', '변동 있음', { construct: '테스트' }),
      scale('A3', '변동 있음2', { construct: '테스트' }),
    ];
    const rows: { answers: AnswerMap }[] = [
      { answers: { A1: 5, A2: 1, A3: 2 } },
      { answers: { A1: 5, A2: 3, A3: 3 } },
      { answers: { A1: 5, A2: 5, A3: 4 } },
      { answers: { A1: 5, A2: 4, A3: 5 } },
    ];
    const [construct] = analyzeConstructs(flat, rows);
    const a1 = construct.items.find((i) => i.questionId === 'A1')!;
    expect(a1.zeroVariance).toBe(true);
    expect(a1.warnings.join()).toContain('변별');
    expect(a1.ceilingPercent).toBe(100);
  });

  it('척도 묶음이 지정되지 않으면 결과가 비어 있다', () => {
    expect(analyzeConstructs([scale('Q1', '묶음 없음')], responses)).toEqual([]);
  });
});

describe('응답 일관성 점검', () => {
  const questions: SurveyQuestion[] = [
    scale('Q1', '참여하고 싶다', { construct: '참여의향' }),
    scale('Q2', '신청하겠다', { construct: '참여의향' }),
    scale('Q3', '도움이 된다', { construct: '참여의향' }),
  ];

  it('모든 척도에 같은 값만 찍은 응답자를 센다', () => {
    const rows: { answers: AnswerMap }[] = [
      { answers: { Q1: 4, Q2: 4, Q3: 4 } },
      { answers: { Q1: 5, Q2: 5, Q3: 5 } },
      { answers: { Q1: 5, Q2: 3, Q3: 4 } },
      { answers: { Q1: 1, Q2: 2, Q3: 3 } },
    ];
    const report = analyzeConsistency(questions, rows);
    expect(report.straightLining.count).toBe(2);
    expect(report.straightLining.percent).toBe(50);
  });

  it('상위 보기에 쏠린 문항을 사회적 바람직성 의심으로 표시한다', () => {
    const rows: { answers: AnswerMap }[] = Array.from({ length: 10 }, (_, i) => ({
      answers: { Q1: 5, Q2: i < 5 ? 2 : 4, Q3: 4 } as AnswerMap,
    }));
    const report = analyzeConsistency(questions, rows);
    expect(report.topBoxSkew.map((t) => t.questionId)).toContain('Q1');
    expect(report.topBoxSkew.map((t) => t.questionId)).not.toContain('Q2');
  });

  it('역채점 표시가 빠져 반대로 움직이는 문항 쌍을 찾는다', () => {
    const missingReverse: SurveyQuestion[] = [
      scale('Q1', '참여하고 싶다', { construct: '참여의향' }),
      scale('Q2', '신청하겠다', { construct: '참여의향' }),
      scale('Q3', '참여할 생각이 없다', { construct: '참여의향' }), // reverse 표시 누락
    ];
    const rows: { answers: AnswerMap }[] = [
      { answers: { Q1: 5, Q2: 5, Q3: 1 } },
      { answers: { Q1: 4, Q2: 4, Q3: 2 } },
      { answers: { Q1: 3, Q2: 3, Q3: 3 } },
      { answers: { Q1: 2, Q2: 2, Q3: 4 } },
      { answers: { Q1: 1, Q2: 1, Q3: 5 } },
    ];
    const report = analyzeConsistency(missingReverse, rows);
    expect(report.contradictions.length).toBeGreaterThan(0);
    expect(report.contradictions[0].message).toContain('역채점');
  });
});

describe('AI 검토 응답 파싱', () => {
  const ids = ['Q1', 'Q2'];

  it('코드펜스가 섞여도 파싱하고 결과를 정규화한다', () => {
    const raw = `다음과 같습니다.
\`\`\`json
{
  "findings": [
    { "question_id": "Q1", "type": "double_barreled", "severity": "HIGH", "message": "두 가지를 묻습니다", "suggestion": "나누세요" },
    { "question_id": "없는문항", "type": "이상한유형", "severity": "아무거나", "message": "설문 전체 문제" }
  ],
  "summary": "Q1 부터 고치세요"
}
\`\`\``;
    const result = parseAiReview(raw, ids);

    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toMatchObject({
      questionId: 'Q1',
      type: 'double_barreled',
      severity: 'high',
      suggestion: '나누세요',
    });
    // 없는 문항 ID 는 설문 전체(null)로, 낯선 값은 안전한 기본값으로
    expect(result.findings[1].questionId).toBeNull();
    expect(result.findings[1].type).toBe('ambiguous');
    expect(result.findings[1].severity).toBe('medium');
    expect(result.findings[1].suggestion).toContain('직접 판단');
    expect(result.counts).toEqual({ high: 1, medium: 1, low: 0 });
    expect(result.summary).toBe('Q1 부터 고치세요');
  });

  it('지적이 없으면 빈 결과를 돌려준다', () => {
    const result = parseAiReview('{"findings": [], "summary": "문제 없음"}', ids);
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ high: 0, medium: 0, low: 0 });
  });

  it('내용이 빈 지적은 버린다', () => {
    const result = parseAiReview('{"findings":[{"question_id":"Q1","message":"   "}]}', ids);
    expect(result.findings).toHaveLength(0);
  });

  it('형식이 아예 다르면 오류를 낸다', () => {
    expect(() => parseAiReview('죄송하지만 검토할 수 없습니다.', ids)).toThrow(/올바른 형식/);
  });
});
