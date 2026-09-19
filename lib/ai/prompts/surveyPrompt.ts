import { scaleLabelsOf } from '@/lib/survey/schema';
import type { SurveyQuestion } from '@/lib/types';
import type { SurveyPromptInput } from '@/lib/ai/types';

/** 프롬프트 템플릿 버전. Run 에 기록되어 재현성 추적에 쓰인다. */
export const PROMPT_TEMPLATE_VERSION = 'v1';

export const DEFAULT_SYSTEM_PROMPT = `당신은 사회복지 프로그램 욕구조사를 위한 Synthetic Client 응답 엔진입니다.

제공되는 PERSONA는 실제 사람이 아닌 연구용 합성 페르소나입니다.

반드시 다음 원칙을 따르세요.

1. PERSONA에 제공된 정보만을 바탕으로 응답하세요.
2. 제공되지 않은 질병, 소득, 경험, 가족관계 등을 임의로 만들지 마세요.
3. 모든 문항에 일관되게 응답하세요.
4. 사회적으로 바람직한 답변을 하려고 하지 마세요.
5. 설문조사 문항 자체를 평가하지 말고 해당 PERSONA의 입장에서 답변하세요.
6. 확신이 없는 경우 중립적 응답을 선택할 수 있습니다.
7. 응답은 지정된 JSON Schema를 반드시 준수하세요.`;

/** 문항을 사람이 읽는 형태 + 허용 값 설명으로 변환 */
export function renderQuestion(q: SurveyQuestion, index: number): string {
  const lines: string[] = [`${q.id}. ${q.question}`];
  if (q.helpText) lines.push(`   설명: ${q.helpText}`);

  switch (q.type) {
    case 'single_choice':
      lines.push('   유형: 단일선택 (아래 보기 중 정확히 1개를 문자열로)');
      (q.options ?? []).forEach((o) => lines.push(`   - ${o}`));
      break;
    case 'multi_choice':
      lines.push(
        `   유형: 복수선택 (아래 보기 중 최대 ${q.maxSelections ?? q.options?.length ?? 3}개를 문자열 배열로)`
      );
      (q.options ?? []).forEach((o) => lines.push(`   - ${o}`));
      break;
    case 'scale_5': {
      const labels = scaleLabelsOf(q);
      lines.push('   유형: 5점 척도 (1~5 정수)');
      labels.forEach((l, i) => lines.push(`   ${i + 1} = ${l}`));
      break;
    }
    case 'number': {
      const range = [
        q.min !== undefined ? `최소 ${q.min}` : null,
        q.max !== undefined ? `최대 ${q.max}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      lines.push(`   유형: 숫자 응답${range ? ` (${range})` : ''}${q.unit ? ` 단위: ${q.unit}` : ''}`);
      break;
    }
    case 'open_text':
      lines.push('   유형: 주관식 (1~3문장, 한국어 자연문)');
      break;
  }

  if (q.condition) {
    lines.push(
      `   조건: ${q.condition.questionId} 응답이 조건(${q.condition.operator} ${q.condition.value})을 만족할 때만 답하세요. 해당하지 않으면 이 문항은 제외하세요.`
    );
  }
  return lines.join('\n');
}

export function buildUserPrompt(input: SurveyPromptInput): string {
  const questionsBlock = input.questions.map(renderQuestion).join('\n\n');
  const shape = input.questions
    .map((q) => {
      switch (q.type) {
        case 'single_choice':
          return `  { "question_id": "${q.id}", "value": "<보기 중 1개>" }`;
        case 'multi_choice':
          return `  { "question_id": "${q.id}", "value": ["<보기>", "<보기>"] }`;
        case 'scale_5':
          return `  { "question_id": "${q.id}", "value": <1~5 정수> }`;
        case 'number':
          return `  { "question_id": "${q.id}", "value": <숫자> }`;
        default:
          return `  { "question_id": "${q.id}", "value": "<한국어 문장>" }`;
      }
    })
    .join(',\n');

  return `[PERSONA]

${input.personaFields}

Persona summary:
${input.personaSummary}

[SURVEY]

${questionsBlock}

[OUTPUT FORMAT]

아래 JSON 객체 하나만 출력하세요. 설명, 코드펜스, 추가 문장을 붙이지 마세요.

{
  "respondent_id": "${input.respondentId}",
  "answers": [
${shape}
  ]
}${input.repairHint ? `\n\n[이전 응답 오류]\n${input.repairHint}\n위 오류를 수정해서 다시 출력하세요.` : ''}`;
}
