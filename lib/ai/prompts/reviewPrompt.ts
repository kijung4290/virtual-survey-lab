import { REVIEW_TYPES } from '@/lib/survey/review';
import { scaleLabelsOf } from '@/lib/survey/schema';
import { QUESTION_TYPE_LABEL, type SurveyQuestion } from '@/lib/types';

/**
 * 문항 표현 AI 검토 프롬프트.
 *
 * 응답자(페르소나)를 쓰지 않고 문항 문장만 검토한다. 설문 1개당 호출 1회.
 * 규칙 기반 검토(lib/survey/review.ts)가 못 잡는 맥락·의미 문제를 보완하는 용도다.
 */

export const REVIEW_PROMPT_VERSION = 'v1';

export const REVIEW_SYSTEM_PROMPT = `당신은 사회복지 분야 설문지를 검토하는 조사방법론 전문가입니다.

노인·저소득 가구 등 지역주민을 대상으로 하는 설문지를 실제 조사 전에 점검합니다.

다음 원칙을 지키세요.

1. 문항 문장과 보기 구성만 보고 판단하세요. 응답을 예측하거나 만들어내지 마세요.
2. 실제로 응답에 영향을 줄 만한 문제만 지적하세요. 사소한 문체 취향은 지적하지 마세요.
3. 지적할 때는 반드시 "어떻게 고치면 되는지"를 구체적인 대안 문장으로 제시하세요.
4. 고령 응답자가 소리 내어 읽어줄 때 이해할 수 있는지를 기준으로 삼으세요.
5. 설문지가 타당하다고 보증하지 마세요. 개선이 필요한 지점만 보고하세요.
6. 문제를 찾지 못했다면 findings 를 빈 배열로 두세요. 억지로 만들지 마세요.
7. 응답은 지정된 JSON 형식만 출력하세요.`;

function renderQuestionForReview(q: SurveyQuestion): string {
  const lines = [`${q.id} [${QUESTION_TYPE_LABEL[q.type]}] ${q.question}`];
  if (q.helpText) lines.push(`    설명: ${q.helpText}`);
  if (q.options?.length) lines.push(`    보기: ${q.options.join(' / ')}`);
  if (q.type === 'scale_5') lines.push(`    척도 라벨: ${scaleLabelsOf(q).join(' / ')}`);
  if (q.construct) lines.push(`    척도 묶음: ${q.construct}${q.reverse ? ' (역채점 문항)' : ''}`);
  if (q.condition) {
    lines.push(`    조건: ${q.condition.questionId} 응답이 ${q.condition.operator} ${q.condition.value} 일 때만 표시`);
  }
  return lines.join('\n');
}

export function buildReviewPrompt(
  surveyName: string,
  questions: SurveyQuestion[],
  targetPopulation?: string | null
): string {
  const types = Object.entries(REVIEW_TYPES)
    .map(([key, label]) => `  ${key} = ${label}`)
    .join('\n');

  return `[설문지] ${surveyName}
[조사 대상] ${targetPopulation || '지역주민'}

[문항]

${questions.map(renderQuestionForReview).join('\n\n')}

[검토 관점]

- 한 문항이 두 가지를 동시에 묻지는 않는가
- 특정 답을 유도하는 표현은 없는가
- 조사 대상에게 낯선 용어나 한자어는 없는가
- "자주", "적절히" 처럼 기준이 사람마다 다른 표현은 없는가
- 보기가 서로 겹치거나, 해당 사항 없는 사람이 고를 보기가 빠지지 않았는가
- 척도 라벨이 한쪽으로 기울지 않았는가
- 문항 순서 때문에 앞 문항이 뒤 문항 답에 영향을 주지는 않는가
- 응답자가 기억하기 어려운 기간·빈도를 묻지는 않는가

[유형 코드]

${types}

[OUTPUT FORMAT]

아래 JSON 객체 하나만 출력하세요. 설명이나 코드펜스를 붙이지 마세요.

{
  "findings": [
    {
      "question_id": "<문항 ID 또는 설문 전체 문제면 null>",
      "type": "<위 유형 코드 중 하나>",
      "severity": "<high | medium | low>",
      "message": "<무엇이 문제인지 한두 문장>",
      "suggestion": "<이렇게 고치세요: 구체적인 대안 문장>"
    }
  ],
  "summary": "<이 설문지에서 가장 먼저 손봐야 할 것 한두 문장>"
}`;
}
