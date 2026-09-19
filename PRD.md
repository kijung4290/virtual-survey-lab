# PRD.md
# Synthetic Client Survey Lab
## 공공·합성 데이터를 활용한 사회복지 프로그램 사전 욕구조사 시뮬레이션 웹앱

- 문서 버전: v1.0
- 작성 목적: Claude Code 구현용 제품 요구사항 정의
- 제품 유형: 연구·실험용 로컬 우선(Local-first) 웹앱
- 주요 사용자: 사회복지기관 실무자, 프로그램 기획자, 연구자
- 핵심 개념: Synthetic Clients / 가상 이용자 패널 / 사전 욕구조사 시뮬레이션

---

# 1. 제품 개요

## 1.1 문제 정의

사회복지기관은 프로그램 기획 전 이용자·주민을 대상으로 욕구조사를 수행한다.

하지만 실제 현장에서는 다음과 같은 문제가 있다.

- 어떤 프로그램 후보를 설문에 넣을지 담당자의 경험에 의존함
- 설문 문항 자체가 충분히 검토되지 않은 상태에서 실제 조사가 진행됨
- 주관식 문항을 미리 테스트하기 어려움
- 소규모 기관은 FGI, 사전조사, 파일럿 테스트에 시간과 예산을 많이 쓰기 어려움
- 실제 조사 후에야 “이 질문을 추가했어야 했다”는 사실을 알게 되는 경우가 많음

이 프로젝트는 실제 이용자를 AI로 대체하는 것이 목적이 아니다.

공개 통계와 합성 페르소나 데이터를 기반으로 가상의 이용자 집단(Synthetic Clients)을 만들고, 실제 욕구조사 전에 동일한 설문을 먼저 실행하여 다음을 확인하는 것이 목적이다.

- 어떤 프로그램 후보가 상대적으로 높은 반응을 보이는가
- 참여를 방해하는 요인은 무엇인가
- 담당자가 예상하지 못한 응답 이유가 존재하는가
- 어떤 설문 문항을 실제 조사에 추가해야 하는가
- 어떤 세그먼트에서 프로그램 선호가 다르게 나타나는가
- AI 사전조사 결과와 실제 이용자 조사 결과는 어느 정도 차이가 나는가

따라서 이 서비스의 핵심 위치는 다음과 같다.

**프로그램 아이디어 → Synthetic Client 사전조사 → 가설 발견 → 실제 이용자 조사 → 결과 비교**

---

# 2. 제품 목표

## 2.1 핵심 목표

1. 공개·합성 데이터를 이용해 100~1,000명의 가상 복지 이용자 패널을 생성할 수 있어야 한다.
2. 사용자가 직접 설문지를 작성하거나 CSV/JSON으로 가져올 수 있어야 한다.
3. 동일한 설문을 Synthetic Clients에게 자동으로 배치 실행할 수 있어야 한다.
4. 객관식·척도형·주관식 응답을 구조화해 저장해야 한다.
5. 결과를 전체 및 세그먼트별로 분석할 수 있어야 한다.
6. 동일한 설문을 여러 번 실행해 응답 안정성을 비교할 수 있어야 한다.
7. 실제 설문 결과 CSV를 업로드하여 Synthetic Survey와 비교할 수 있어야 한다.
8. 모든 결과에 “실제 이용자 조사 결과가 아님”이라는 명확한 표시를 해야 한다.
9. 개인정보 없이 연구용으로 사용할 수 있는 구조여야 한다.

---

# 3. 비목표

다음 기능은 v1 범위에 포함하지 않는다.

- 실제 사례관리 대상자의 개인정보 직접 입력
- 주민등록번호, 연락처, 주소 등 식별정보 저장
- AI 결과를 복지서비스 대상자 선정에 사용
- AI 결과를 위험도 판정이나 사례관리 개입 우선순위 결정에 사용
- 실제 주민의 의견을 Synthetic Survey 결과로 대체
- 의료·정신건강·학대·위기상황 판단
- 자동으로 인터넷에서 공공데이터를 수집하거나 크롤링
- 공식 통계 추정치나 대표성을 보장하는 기능

---

# 4. 기본 원칙

## 4.1 Synthetic Client는 실제 사람을 의미하지 않는다

모든 Synthetic Client는 가상의 데이터이며 실제 특정 개인과 연결되어서는 안 된다.

UI에 다음 문구를 항상 표시한다.

> 이 결과는 AI와 합성 페르소나를 이용한 사전 시뮬레이션입니다.  
> 실제 이용자·지역주민의 욕구조사를 대체하지 않습니다.

## 4.2 AI의 자유로운 상상보다 데이터 기반 특성을 우선한다

잘못된 예:

- “80대 독거노인이라고 생각하고 답해줘”

권장 방식:

- age: 82
- household_type: 독거
- housing: 임대
- mobility_difficulty: 높음
- digital_literacy: 낮음
- social_contact_frequency: 낮음
- current_service_use: 식사배달
- economic_status: 저소득

LLM은 제공된 필드 안에서만 응답을 추론하도록 한다.

## 4.3 결과는 가설 생성용으로만 사용한다

모든 분석 결과 화면에는 다음 세 가지를 구분해서 보여준다.

- Synthetic Result
- Actual Survey Result
- Difference / Gap

---

# 5. 주요 사용자 시나리오

## 시나리오 A: 새로운 노인 프로그램 사전조사

1. 담당자가 새 프로젝트 생성
2. “65세 이상 노인”을 조사 대상으로 설정
3. CSV 또는 기본 샘플 데이터에서 Synthetic Client 300명 생성
4. 6개 프로그램 후보 입력
5. 욕구조사 설문 10문항 작성
6. AI 모델 선택
7. 설문 배치 실행
8. 전체 선호도 확인
9. 독거/부부가구, 연령대, 이동불편 수준별 결과 비교
10. 주관식 응답에서 참여장벽 키워드 확인
11. 실제 설문에 추가할 문항을 정리
12. 실제 조사 후 CSV 업로드
13. Synthetic 결과와 실제 결과 비교

## 시나리오 B: 설문 문항 사전 검토

1. 기존 설문지 업로드
2. Synthetic Client 100명 대상으로 실행
3. 응답 편중이 심한 문항 확인
4. “기타” 응답에서 새로운 선택지 후보 발견
5. 이해하기 어려운 문항 확인
6. 실제 설문지 수정

## 시나리오 C: 프로그램 기획안 테스트

1. 프로그램 설명 입력
2. Synthetic Client 200명 생성
3. 참여의향 질문
4. 불참 이유 질문
5. 적절한 시간대/빈도 질문
6. 예상 개선사항 수집
7. 세그먼트별 반응 차이 확인

---

# 6. 권장 기술 스택

Claude Code는 아래 스택을 기본값으로 구현한다.

## Frontend

- Next.js 15+
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Recharts

## Backend

- Next.js Route Handlers 또는 Server Actions
- Node.js 기반 배치 처리

## Database

v1 기본값:

- SQLite
- Prisma ORM

향후 확장:

- PostgreSQL / Supabase

## 파일 처리

지원 포맷:

- CSV
- JSON
- JSONL

대용량 Parquet은 v1.1 이후 고려

## AI Provider

Provider Adapter 패턴을 사용한다.

초기 지원:

- OpenAI compatible API
- Anthropic Claude API

인터페이스 예시:

```ts
interface LLMProvider {
  generateResponse(input: SurveyPromptInput): Promise<SurveyAnswer>;
}
```

특정 회사 SDK에 핵심 비즈니스 로직이 종속되지 않게 구현한다.

---

# 7. 애플리케이션 정보구조

주요 메뉴:

1. 대시보드
2. 프로젝트
3. Synthetic Clients
4. 설문지
5. 설문 실행
6. 결과 분석
7. 실제 조사 비교
8. 실행 기록
9. 설정

---

# 8. 데이터 모델

## 8.1 Project

```ts
Project {
  id: string
  name: string
  description?: string
  targetPopulation?: string
  createdAt: datetime
  updatedAt: datetime
}
```

예:

```json
{
  "name": "2027년 노인복지 프로그램 욕구조사 사전실험",
  "targetPopulation": "65세 이상 지역주민"
}
```

---

## 8.2 SyntheticClient

필드는 고정 필드 + 사용자 정의 필드 구조를 함께 사용한다.

```ts
SyntheticClient {
  id: string
  projectId: string

  age?: number
  sex?: string
  province?: string
  district?: string
  householdType?: string
  maritalStatus?: string
  housingType?: string
  educationLevel?: string
  employmentStatus?: string

  economicStatus?: string
  healthStatus?: string
  mobilityDifficulty?: string
  digitalLiteracy?: string
  socialContactLevel?: string
  careNeed?: string
  currentServiceUse?: string[]

  attributes: JSON
  personaSummary: string

  sourceType: "imported" | "generated" | "manual"
  sourceMetadata: JSON

  createdAt: datetime
}
```

---

# 9. 데이터 출처 메타데이터

각 Synthetic Client 또는 데이터셋은 출처를 기록할 수 있어야 한다.

예:

```json
{
  "base_source": "Nemotron-Personas-Korea",
  "welfare_distribution_source": "2023 노인실태조사",
  "generation_method": "conditional_sampling",
  "notes": "개인 식별정보 없음"
}
```

이 정보는 결과 보고서에도 함께 표시한다.

---

# 10. Synthetic Client 생성 방식

## 10.1 모드 1: 기존 합성 데이터 가져오기

CSV 컬럼 매핑 UI 제공.

예:

```text
age -> age
sex -> sex
province -> province
district -> district
family_type -> householdType
housing_type -> housingType
```

사용자가 컬럼을 직접 매핑할 수 있어야 한다.

---

## 10.2 모드 2: 조건 기반 샘플 생성

사용자가 분포를 입력한다.

예:

```text
총 인원: 300

65~74세: 45%
75~84세: 40%
85세 이상: 15%

독거: 38%
부부: 42%
자녀동거: 20%

디지털 활용:
낮음 45%
보통 35%
높음 20%
```

앱은 해당 비율에 맞춰 Synthetic Clients를 생성한다.

---

## 10.3 모드 3: 기존 페르소나 보강

기존 Nemotron-Personas-Korea 레코드 등에 복지 관련 특성을 추가한다.

주의:

복지 관련 속성은 임의 확률로 독립 생성하지 않는다.

가능한 경우 다음 방식 사용:

1. 조건부 분포 입력
2. 교차표 기반 sampling
3. 사용자 제공 확률표
4. 원자료 기반 통계 모델

예:

```text
IF age >= 80 AND householdType == "독거"
THEN mobilityDifficulty distribution:
  low: 20%
  medium: 35%
  high: 45%
```

---

# 11. Persona Summary 생성

각 Synthetic Client에는 구조화 필드 외에 사람이 읽기 쉬운 요약을 생성한다.

예:

```text
78세 여성으로 혼자 거주하고 있다.
임대주택에 거주하며 경제적 여유가 적은 편이다.
외출과 장거리 이동에 약간의 어려움이 있다.
스마트폰 활용 수준은 낮다.
가까운 지인과 만나는 빈도는 적으며 현재 경로식당을 가끔 이용한다.
건강에 대한 관심은 높지만 정기적인 운동 프로그램에는 참여하지 않는다.
```

중요:

- 요약은 입력 필드에 없는 정보를 새로 창작하지 않는다.
- 진단명, 성격, 감정 상태 등을 임의로 추가하지 않는다.
- “불쌍하다”, “취약하다” 등의 가치 판단 표현 금지.

---

# 12. 설문지 기능

## 지원 문항 유형

### 12.1 단일선택

```json
{
  "type": "single_choice",
  "question": "가장 참여하고 싶은 프로그램은 무엇입니까?",
  "options": [
    "스마트폰 교육",
    "건강걷기",
    "소규모 식사모임",
    "병원동행",
    "키오스크 교육",
    "취미 프로그램"
  ]
}
```

### 12.2 복수선택

최대 선택 개수 설정 가능

### 12.3 5점 척도

예:

- 전혀 참여하고 싶지 않다
- 별로 참여하고 싶지 않다
- 보통이다
- 참여하고 싶다
- 매우 참여하고 싶다

내부적으로 1~5 저장

### 12.4 숫자 응답

예:

```text
주당 참여 가능한 횟수
월 최대 부담 가능한 비용
```

### 12.5 주관식

예:

```text
이 프로그램에 참여하지 않을 가능성이 있다면 가장 큰 이유는 무엇입니까?
```

### 12.6 조건부 문항

예:

```text
Q1 참여의향 <= 2
→ Q2 불참 이유 표시
```

---

# 13. 설문 실행 방식

## 13.1 기본 원칙

Synthetic Client 1명 = 독립 응답자 1명

각 응답자는 자신의 persona 정보만 전달받는다.

다른 Synthetic Client의 정보나 응답은 볼 수 없다.

---

## 13.2 Prompt 구조

System Prompt:

```text
당신은 사회복지 프로그램 욕구조사를 위한 Synthetic Client 응답 엔진입니다.

제공되는 PERSONA는 실제 사람이 아닌 연구용 합성 페르소나입니다.

반드시 다음 원칙을 따르세요.

1. PERSONA에 제공된 정보만을 바탕으로 응답하세요.
2. 제공되지 않은 질병, 소득, 경험, 가족관계 등을 임의로 만들지 마세요.
3. 모든 문항에 일관되게 응답하세요.
4. 사회적으로 바람직한 답변을 하려고 하지 마세요.
5. 설문조사 문항 자체를 평가하지 말고 해당 PERSONA의 입장에서 답변하세요.
6. 확신이 없는 경우 중립적 응답을 선택할 수 있습니다.
7. 응답은 지정된 JSON Schema를 반드시 준수하세요.
```

User Prompt:

```text
[PERSONA]

Age: 78
Household type: 독거
Housing: 임대
Economic status: 낮음
Mobility difficulty: 중간
Digital literacy: 낮음
Social contact: 낮음

Persona summary:
...

[SURVEY]

Q1 ...
Q2 ...
```

---

# 14. 구조화 응답

LLM 응답은 자유 텍스트 전체를 그대로 신뢰하지 않는다.

반드시 JSON Schema로 검증한다.

예:

```json
{
  "respondent_id": "SC-0037",
  "answers": [
    {
      "question_id": "Q1",
      "value": "병원동행"
    },
    {
      "question_id": "Q2",
      "value": 5
    },
    {
      "question_id": "Q3",
      "value": "혼자 병원에 가는 것이 부담스럽기 때문이다."
    }
  ]
}
```

유효하지 않은 응답은 최대 2회 재시도한다.

재시도 실패 시:

```text
status = INVALID_RESPONSE
```

로 저장한다.

---

# 15. 배치 실행

설문 실행 설정:

- 대상 프로젝트
- 대상 Client 수
- 대상 세그먼트
- AI Provider
- Model
- Temperature
- 반복 실행 횟수
- 최대 동시 실행 수

기본값:

```text
temperature = 0.3
repeat = 1
concurrency = 5
```

---

# 16. 재현성

Synthetic Survey의 핵심 요구사항이다.

각 실행(Run)에 다음 정보를 저장한다.

```ts
SurveyRun {
  id
  surveyId
  modelProvider
  modelName
  modelVersion?: string
  temperature
  systemPrompt
  promptTemplateVersion
  clientDatasetVersion
  repeatIndex
  startedAt
  completedAt
}
```

결과가 달라졌을 때 원인을 추적할 수 있어야 한다.

---

# 17. 반복 실행 / 안정성 테스트

동일한 Synthetic Clients와 동일한 설문을 여러 번 실행할 수 있어야 한다.

예:

```text
Run A
Run B
Run C
```

분석 지표:

- 동일 응답률
- 문항별 응답 변동률
- 순위 일치도
- 척도 평균 차이
- 자유응답 주요 테마 변화

UI:

```text
Q1 프로그램 선호
Run A / Run B / Run C

병원동행:
31% / 28% / 33%

스마트폰:
22% / 24% / 20%
```

---

# 18. 결과 분석

## 18.1 전체 분석

객관식:

- 응답 수
- 응답 비율
- 순위

척도:

- 평균
- 중앙값
- 분포
- 표준편차

주관식:

v1에서는 단순 분석:

- 빈도 높은 키워드
- AI 기반 주제 분류
- 대표 응답 예시

주의:

주제 분석 결과 역시 AI 생성 분석임을 표시한다.

---

# 19. 세그먼트 분석

사용자가 필드를 선택하여 결과를 비교할 수 있다.

예:

```text
가구형태별
독거 vs 부부 vs 자녀동거

연령별
65~74 / 75~84 / 85+

이동불편
낮음 / 중간 / 높음

디지털 활용
낮음 / 중간 / 높음
```

교차 분석 예:

```text
병원동행 선호율

독거        41%
부부        24%
자녀동거    18%
```

---

# 20. 주관식 응답 분석

주관식 응답 원문은 삭제하지 않고 저장한다.

분석 시 다음 결과를 생성한다.

```json
{
  "theme": "이동의 어려움",
  "count": 73,
  "examples": [
    "...",
    "..."
  ]
}
```

대표 응답은 실제 합성 응답임을 표시한다.

실제 주민 발언처럼 인용하지 않는다.

UI 표기:

> Synthetic Client 응답 예시

---

# 21. 실제 설문 결과 비교

사용자가 실제 설문 결과 CSV를 업로드할 수 있어야 한다.

단, 업로드 전 경고:

> 이름, 전화번호, 주소, 주민등록번호 등 개인 식별정보를 포함하지 마세요.

필수:

- 실제 설문 CSV는 익명화된 데이터만 허용한다고 안내
- 파일은 로컬 DB에만 저장
- 외부 LLM 전송 금지

---

# 22. 비교 화면

예:

```text
Q1. 가장 참여하고 싶은 프로그램

                 Synthetic      Actual       Gap
병원동행             31%           26%         +5%p
스마트폰교육         22%           30%         -8%p
건강걷기             19%           18%         +1%p
식사모임             15%           16%         -1%p
기타                 13%           10%         +3%p
```

지표:

- percentage point gap
- 순위 차이
- 평균 절대 오차(MAE)
- Spearman rank correlation
- 척도형 평균 차이

고급 통계는 v1.1로 분리 가능

---

# 23. 대시보드

대시보드 카드:

```text
Synthetic Clients
300명

설문 문항
12개

완료 응답
300 / 300

평균 실행시간
--

실제 조사 비교
미등록
```

핵심 차트:

- 프로그램 선호도
- 세그먼트별 선호
- 참여장벽 Top 10
- 반복실행 안정성

---

# 24. 프로젝트 화면

한 프로젝트 안에 다음을 묶는다.

```text
프로젝트
 ├─ Synthetic Dataset
 ├─ Survey
 ├─ Survey Runs
 ├─ Synthetic Responses
 ├─ Actual Survey Dataset
 └─ Comparison Reports
```

---

# 25. 파일 가져오기

## Synthetic Client CSV 예시

```csv
id,age,sex,household_type,housing_type,economic_status,mobility_difficulty,digital_literacy,social_contact
SC001,78,F,독거,임대,낮음,중간,낮음,낮음
SC002,69,M,부부,자가,중간,낮음,중간,높음
```

## 실제 설문 CSV 예시

```csv
respondent_id,Q1,Q2,Q3
R001,병원동행,5,혼자 가기 어려움
R002,스마트폰교육,4,필요하지만 배울 곳이 없음
```

---

# 26. Export

지원:

- Synthetic Client CSV
- Survey JSON
- Survey Response CSV
- Summary CSV
- Comparison CSV
- 전체 프로젝트 JSON 백업

---

# 27. 개인정보 및 윤리

## 금지 필드 기본 탐지

CSV 업로드 시 다음 컬럼명이 있으면 경고 또는 차단한다.

- name
- 이름
- 성명
- phone
- 전화번호
- mobile
- address
- 주소
- resident_number
- 주민등록번호
- email

사용자가 임의로 우회할 수 있으므로 완전한 보호 기능은 아니다.

화면에 반복 안내한다.

---

# 28. 데이터 저장 정책

v1:

- 모든 데이터는 로컬 SQLite 저장
- API Key는 DB에 평문 저장하지 않는다
- `.env.local` 사용
- Git commit 대상에서 제외

`.gitignore`:

```text
.env
.env.local
*.db
*.sqlite
data/private/
```

---

# 29. 환경변수

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

DATABASE_URL="file:./dev.db"

DEFAULT_LLM_PROVIDER=
DEFAULT_LLM_MODEL=
```

---

# 30. 비용 보호

사용자가 실행 버튼을 누르기 전에 예상 호출 수를 표시한다.

예:

```text
대상 응답자: 300명
설문 실행: 1회
예상 API 호출: 300회
```

반복 3회:

```text
300 × 3 = 900 calls
```

사용자가 명시적으로 실행을 확인해야 한다.

v1에서 실제 비용 계산은 정확하지 않아도 된다.

---

# 31. 실패 처리

상태:

```text
PENDING
RUNNING
SUCCESS
FAILED
INVALID_RESPONSE
RATE_LIMITED
```

배치가 중단되어도 완료된 응답은 유지한다.

Resume 기능:

```text
실패/미완료 응답만 다시 실행
```

---

# 32. UI/UX 원칙

대상 사용자는 개발자가 아니라 사회복지기관 실무자다.

따라서 다음을 준수한다.

- 기술 용어 최소화
- 화면당 주요 행동 1개
- 표와 그래프 중심
- 흰색 기반의 단순한 UI
- 모바일 대응은 하되 데스크톱 사용을 우선
- “AI가 실제 이용자를 대표한다”는 오해를 유발하는 표현 금지

권장 표현:

- 가상 이용자
- Synthetic Client
- 사전 시뮬레이션
- AI 기반 가설 탐색

금지 또는 최소화:

- 실제 주민 예측
- 정확한 욕구 예측
- 주민 대표
- AI 이용자 조사 결과

---

# 33. 첫 화면 카피

```text
Synthetic Client Survey Lab

실제 이용자에게 묻기 전에,
가상의 이용자 패널로 설문을 먼저 점검해보세요.

공개·합성 데이터를 기반으로 프로그램 아이디어와 설문문항을
사전 시뮬레이션할 수 있습니다.

※ 이 결과는 실제 이용자 욕구조사를 대체하지 않습니다.
```

---

# 34. 권장 초기 실험 템플릿

앱 최초 실행 시 데모 프로젝트를 포함한다.

프로젝트:

```text
노인복지 프로그램 사전 욕구조사
```

Synthetic Clients:

```text
200명
```

속성:

- age
- household_type
- economic_status
- health_status
- mobility_difficulty
- digital_literacy
- social_contact_level

프로그램:

1. 스마트폰 활용교육
2. 건강걷기
3. 소규모 식사모임
4. 병원동행
5. 키오스크 교육
6. 취미·공예

---

# 35. 데모 설문

## Q1 단일선택

가장 참여하고 싶은 프로그램은 무엇입니까?

## Q2 5점척도

Q1에서 선택한 프로그램에 실제로 참여할 의향은 어느 정도입니까?

## Q3 주관식

참여하고 싶은 가장 큰 이유는 무엇입니까?

## Q4 단일선택

참여를 가장 어렵게 만드는 것은 무엇입니까?

선택지:

- 이동 어려움
- 시간대
- 건강 문제
- 비용
- 프로그램이 어렵게 느껴짐
- 다른 사람과 참여하는 것이 부담됨
- 필요성을 느끼지 못함
- 기타

## Q5 주관식

어떤 조건이 달라지면 참여하기 더 쉬울 것 같습니까?

## Q6 복수선택

복지관에서 가장 필요하다고 생각하는 지원을 최대 3개 선택해주세요.

---

# 36. Validation Experiment

앱의 중요한 기능이다.

Synthetic Survey와 실제 조사를 비교하는 별도 메뉴 제공.

실험 정보:

```text
Synthetic sample: 300
Actual sample: 50

Survey version: v1
Synthetic run date:
Actual survey date:
```

비교 리포트 제목:

```text
Synthetic Client 사전조사 vs 실제 이용자 조사
```

---

# 37. 리포트 해석 가이드

앱은 결과 해석 시 다음 문구를 자동 생성한다.

예:

```text
Synthetic Survey에서는 병원동행 프로그램이 가장 높은 선호를 보였습니다.

실제 조사에서는 스마트폰 교육이 가장 높은 선호를 보였습니다.

따라서 Synthetic Survey가 실제 참여 선호 순위를 그대로 재현했다고 보기 어렵습니다.

반면 건강걷기와 식사모임의 응답 비율은 두 조사에서 비교적 유사했습니다.

이 결과는 향후 Synthetic Client 생성 변수와 프롬프트를 보완하기 위한 참고자료로 활용할 수 있습니다.
```

LLM이 과도한 인과관계를 주장하지 않도록 한다.

---

# 38. 감사 로그

최소 기록:

- 프로젝트 생성
- Dataset import
- Survey 변경
- Run 실행
- Actual dataset import
- 데이터 삭제

실제 개인정보 감사 로그 수준은 필요하지 않으나 연구 재현성을 위해 변경 기록 유지.

---

# 39. 데이터셋 버전관리

예:

```text
WelfarePersona-v1
WelfarePersona-v2
```

Survey Run은 사용한 Dataset version을 반드시 기록한다.

Dataset 수정 후 기존 Run이 자동으로 바뀌면 안 된다.

---

# 40. 설문 버전관리

설문 수정 시:

```text
Survey v1
Survey v2
```

기존 응답은 기존 설문 버전을 유지한다.

---

# 41. 프로젝트 폴더 구조

```text
/
├─ app/
│  ├─ dashboard/
│  ├─ projects/
│  ├─ clients/
│  ├─ surveys/
│  ├─ runs/
│  ├─ analysis/
│  ├─ validation/
│  └─ settings/
│
├─ components/
│
├─ lib/
│  ├─ ai/
│  │  ├─ providers/
│  │  │  ├─ openai.ts
│  │  │  └─ anthropic.ts
│  │  ├─ prompts/
│  │  └─ schemas/
│  │
│  ├─ survey/
│  ├─ analytics/
│  ├─ import/
│  └─ privacy/
│
├─ prisma/
│  └─ schema.prisma
│
├─ data/
│  ├─ sample/
│  └─ private/
│
├─ docs/
│
├─ .env.example
├─ PRD.md
└─ README.md
```

---

# 42. API/서비스 레이어

권장 Service:

```text
ProjectService
ClientDatasetService
SurveyService
SurveyRunService
LLMService
AnalysisService
ActualSurveyService
ComparisonService
ExportService
```

UI 컴포넌트에서 DB나 LLM Provider를 직접 호출하지 않는다.

---

# 43. 테스트

## Unit Test

필수:

- CSV parsing
- column mapping
- Survey JSON validation
- LLM response schema validation
- percentage calculation
- segment filtering
- actual/synthetic gap calculation
- 개인정보 의심 컬럼 탐지

## Integration Test

- project 생성
- CSV import
- survey 생성
- mock LLM 실행
- 응답 저장
- 분석 화면 생성

---

# 44. Mock Provider

개발 중 API 비용을 사용하지 않도록 `MockLLMProvider`를 반드시 구현한다.

예:

```ts
class MockLLMProvider implements LLMProvider {
  async generateResponse(...) {
    return deterministicMockResponse(...)
  }
}
```

Mock Mode로 전체 기능 테스트 가능해야 한다.

---

# 45. Seed 데이터

개발 편의를 위해 다음 seed 제공:

- Synthetic Clients 30명
- 데모 설문 6문항
- Mock survey responses
- Mock actual responses

`npm run seed`

로 초기화 가능하도록 한다.

---

# 46. 접근성

- 모든 form label 명시
- 키보드 탐색 가능
- 차트 외 표 데이터 제공
- 색상만으로 결과 구분하지 않기
- 기본 font size 16px 이상

---

# 47. MVP 완료 기준

아래가 모두 가능하면 MVP 완료로 본다.

## 데이터

- [ ] 프로젝트 생성 가능
- [ ] Synthetic Client CSV import 가능
- [ ] 컬럼 매핑 가능
- [ ] Synthetic Client 목록 조회 가능
- [ ] Persona summary 확인 가능

## 설문

- [ ] 단일선택 문항 생성 가능
- [ ] 복수선택 문항 생성 가능
- [ ] 5점척도 문항 생성 가능
- [ ] 주관식 문항 생성 가능
- [ ] 설문 순서 변경 가능

## AI 실행

- [ ] Mock Provider 실행 가능
- [ ] 실제 LLM Provider 1개 이상 실행 가능
- [ ] 100명 이상 배치 실행 가능
- [ ] JSON schema 검증 가능
- [ ] 실패한 응답 재실행 가능

## 분석

- [ ] 전체 응답 비율 확인 가능
- [ ] 척도 평균 확인 가능
- [ ] 세그먼트 필터 가능
- [ ] 주관식 응답 목록 확인 가능
- [ ] CSV export 가능

## 검증

- [ ] 실제 설문 CSV import 가능
- [ ] Synthetic vs Actual 비율 비교 가능
- [ ] percentage point gap 표시 가능
- [ ] 순위 비교 가능

## 안전

- [ ] 개인정보 업로드 경고 표시
- [ ] API Key가 클라이언트에 노출되지 않음
- [ ] `.env`가 git에서 제외됨
- [ ] 모든 결과 화면에 Synthetic Survey 경고 표시

---

# 48. v1.1 후보 기능

- Nemotron-Personas-Korea Parquet 직접 import
- KOSIS 공개 통계 기반 분포 생성
- 노인실태조사 교차표 import
- 한국복지패널 변수 import
- RAG 기반 설문 맥락 제공
- 자동 설문 개선 제안
- 반복 실행 안정성 지표
- Spearman correlation
- MAE
- Bootstrap confidence interval
- PDF 연구 리포트
- 프로그램 기획안 PDF 업로드
- Local LLM 지원
- Ollama 지원

---

# 49. 연구 관점의 핵심 가설

이 앱은 다음 가설을 검증하는 연구도 지원해야 한다.

### H1
공공통계 기반 Synthetic Clients의 프로그램 선호 순위는 실제 이용자 조사와 일정 수준의 상관을 보이는가?

### H2
Synthetic Clients의 참여장벽 주제는 실제 이용자 주관식 응답에서 나타나는 주요 주제와 얼마나 일치하는가?

### H3
단순 인구통계만 사용한 Persona보다 복지·생활 특성을 추가한 Persona가 실제 설문 결과를 더 잘 재현하는가?

### H4
같은 Synthetic Survey를 반복 실행했을 때 결과는 얼마나 안정적인가?

---

# 50. 가장 중요한 제품 원칙

이 프로젝트에서 절대 놓치면 안 되는 한 문장:

> Synthetic Clients는 실제 이용자를 대신하기 위한 것이 아니라 실제 이용자에게 더 좋은 질문을 하기 위한 사전 실험 도구다.

모든 기능, UI, 분석, 카피는 이 원칙을 기준으로 설계한다.

---

# 51. Claude Code 구현 지시

Claude Code는 다음 순서로 개발한다.

## Phase 1

1. Next.js 프로젝트 초기화
2. Prisma + SQLite 구성
3. 데이터 모델 구현
4. Seed 데이터 생성
5. 기본 대시보드 구현

## Phase 2

1. Synthetic Client CSV import
2. 컬럼 매핑 UI
3. Client 목록
4. Persona detail

## Phase 3

1. Survey Builder
2. Survey versioning
3. JSON schema 생성

## Phase 4

1. MockLLMProvider
2. Provider Adapter
3. Batch Run
4. progress 표시
5. resume 처리

## Phase 5

1. 분석 대시보드
2. 세그먼트 필터
3. CSV export
4. 주관식 응답 분석

## Phase 6

1. Actual Survey import
2. Synthetic vs Actual comparison
3. Validation report

## Phase 7

1. 개인정보 경고
2. 오류 처리
3. 테스트
4. README 작성

각 Phase가 끝날 때마다 반드시 테스트를 실행하고 오류를 수정한 뒤 다음 단계로 진행한다.

---

# 52. 최종 산출물

Claude Code는 최종적으로 다음을 제공해야 한다.

- 실행 가능한 웹앱
- README.md
- `.env.example`
- Prisma schema
- seed script
- sample Synthetic Client CSV
- sample Actual Survey CSV
- sample Survey JSON
- 기본 테스트
- Mock LLM mode
- 최소 1개의 실제 LLM Provider 연동
- 데이터 구조 설명 문서

README에는 반드시 아래 내용 포함:

```text
1. 설치
2. 실행
3. Mock Mode 사용
4. API Key 설정
5. Synthetic Client CSV 구조
6. 실제 설문 CSV 구조
7. 개인정보 주의사항
8. 연구 결과 해석 시 주의사항
```
