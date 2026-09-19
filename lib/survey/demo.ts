import type { SurveyQuestion } from '@/lib/types';

/** PRD 34장 권장 초기 실험 프로그램 후보 */
export const DEMO_PROGRAMS = [
  '스마트폰 활용교육',
  '건강걷기',
  '소규모 식사모임',
  '병원동행',
  '키오스크 교육',
  '취미·공예',
];

/** PRD 35장 데모 설문 6문항 */
export const DEMO_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'Q1',
    type: 'single_choice',
    question: '가장 참여하고 싶은 프로그램은 무엇입니까?',
    options: DEMO_PROGRAMS,
    required: true,
  },
  {
    id: 'Q2',
    type: 'scale_5',
    question: 'Q1에서 선택한 프로그램에 실제로 참여할 의향은 어느 정도입니까?',
    scaleLabels: [
      '전혀 참여하고 싶지 않다',
      '별로 참여하고 싶지 않다',
      '보통이다',
      '참여하고 싶다',
      '매우 참여하고 싶다',
    ],
    required: true,
  },
  {
    id: 'Q3',
    type: 'open_text',
    question: '참여하고 싶은 가장 큰 이유는 무엇입니까?',
    required: true,
  },
  {
    id: 'Q4',
    type: 'single_choice',
    question: '참여를 가장 어렵게 만드는 것은 무엇입니까?',
    options: [
      '이동 어려움',
      '시간대',
      '건강 문제',
      '비용',
      '프로그램이 어렵게 느껴짐',
      '다른 사람과 참여하는 것이 부담됨',
      '필요성을 느끼지 못함',
      '기타',
    ],
    required: true,
  },
  {
    id: 'Q5',
    type: 'open_text',
    question: '어떤 조건이 달라지면 참여하기 더 쉬울 것 같습니까?',
    required: true,
  },
  {
    id: 'Q6',
    type: 'multi_choice',
    question: '복지관에서 가장 필요하다고 생각하는 지원을 최대 3개 선택해주세요.',
    options: [
      '식사 지원',
      '이동·차량 지원',
      '건강관리 지원',
      '디지털 기기 사용 지원',
      '말벗·정서 지원',
      '돌봄 서비스 연계',
      '경제적 지원 안내',
      '여가·문화 활동',
    ],
    maxSelections: 3,
    required: true,
  },
];

export const DEMO_SURVEY_NAME = '노인복지 프로그램 사전 욕구조사';
