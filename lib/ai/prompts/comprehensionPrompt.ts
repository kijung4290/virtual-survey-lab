import type { SurveyQuestion } from '@/lib/types';
import type { SurveyPromptInput } from '@/lib/ai/types';

/**
 * 문항 이해도 점검(인지면접 pretest) 프롬프트.
 *
 * 실제 조사 전에 쓰는 인지면접(cognitive interview)을 본뜬 것으로,
 * 응답자가 문항을 "어떻게 읽었는지"를 물어 의도와 다르게 해석되는 문항을 찾는다.
 *
 * 응답을 고르게 하지 않는다는 점이 일반 설문 실행과 다르다.
 */

export const COMPREHENSION_PROMPT_VERSION = 'v1';

export const COMPREHENSION_SYSTEM_PROMPT = `당신은 설문지 사전점검(인지면접)에 참여하는 Synthetic Client 입니다.

제공되는 PERSONA는 실제 사람이 아닌 연구용 합성 페르소나입니다.

반드시 다음 원칙을 따르세요.

1. 각 문항을 PERSONA의 지식 수준과 생활 경험에서 읽으세요.
2. 문항에 답하지 말고, 그 문항이 무엇을 묻는다고 이해했는지를 당신의 말로 설명하세요.
3. 설문 설계자의 의도를 추측해서 보정하지 마세요. 읽은 그대로 이해한 바를 적으세요.
4. 어렵거나 낯선 낱말이 있으면 그대로 지적하세요. 없으면 빈 배열로 두세요.
5. 이해 난이도는 1(아주 쉬움)에서 5(아주 어려움) 사이 정수로만 답하세요.
6. 모든 문항에 대해 한 번씩 답하세요.
7. 응답은 지정된 JSON 형식을 반드시 지키세요.`;

function renderForComprehension(q: SurveyQuestion, index: number): string {
  const lines = [`${q.id}. ${q.question}`];
  if (q.helpText) lines.push(`   설명: ${q.helpText}`);
  if (q.options?.length) lines.push(`   보기: ${q.options.join(' / ')}`);
  void index;
  return lines.join('\n');
}

export function buildComprehensionPrompt(input: SurveyPromptInput): string {
  const questionsBlock = input.questions.map(renderForComprehension).join('\n\n');
  const shape = input.questions
    .map(
      (q) =>
        `  { "question_id": "${q.id}", "restated": "<이 문항이 무엇을 묻는다고 이해했는지 당신의 말로>", "difficulty": <1~5 정수>, "hard_words": ["<어려운 낱말>"] }`
    )
    .join(',\n');

  return `[PERSONA]

${input.personaFields}

Persona summary:
${input.personaSummary}

[설문 문항]

${questionsBlock}

[요청]

각 문항에 대해 다음 세 가지를 알려주세요.
1) restated: 이 문항이 무엇을 묻는다고 이해했는지 당신의 말로 한 문장
2) difficulty: 이해하기 어려운 정도 (1 아주 쉬움 ~ 5 아주 어려움)
3) hard_words: 어렵거나 낯선 낱말 목록 (없으면 [])

[OUTPUT FORMAT]

아래 JSON 객체 하나만 출력하세요. 설명, 코드펜스, 추가 문장을 붙이지 마세요.

{
  "respondent_id": "${input.respondentId}",
  "items": [
${shape}
  ]
}${input.repairHint ? `\n\n[이전 응답 오류]\n${input.repairHint}\n위 오류를 수정해서 다시 출력하세요.` : ''}`;
}
