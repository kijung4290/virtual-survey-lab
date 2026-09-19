# Synthetic Client Survey Lab

**실제 이용자에게 묻기 전에, 가상의 이용자 패널로 설문을 먼저 점검하는 도구**

사회복지기관이 새 프로그램을 기획할 때 "무엇부터 물어봐야 할지" 막막한 순간을 위해 만들었습니다.
공개·합성 데이터로 만든 가상 이용자(Synthetic Clients) 수백 명에게 같은 설문을 먼저 돌려보고,
**실제 조사에서 빠뜨렸을 질문을 미리 찾아냅니다.**

> Synthetic Clients는 실제 이용자를 대신하기 위한 것이 아니라,
> **실제 이용자에게 더 좋은 질문을 하기 위한** 사전 실험 도구입니다.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tests](https://img.shields.io/badge/tests-60%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

---

## API 키 없이 1분 만에 체험하기

키를 넣지 않으면 자동으로 **데모 모드**로 동작합니다. 비용이 들지 않는 Mock(더미) 엔진이 응답을 만들고,
화면·분석·비교 리포트는 실제 모델을 쓸 때와 **똑같이** 동작합니다.

```bash
git clone https://github.com/kijung4290/virtual-survey-lab.git
cd virtual-survey-lab
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run db:push
npm run dev
```

브라우저에서 <http://localhost:3000> 을 열고 **「1분 만에 체험하기」** 버튼을 누르면
가상 이용자 30명 · 설문 6문항 · 실행 결과 · 실제 조사 비교 리포트까지 한 번에 만들어집니다.
(터미널에서 `npm run seed` 를 실행해도 같은 데이터가 생성됩니다.)

실제 AI 모델은 `.env` 에 키를 넣을 때만 사용됩니다 → [API 키 설정](#api-키-설정)

---

## 무엇을 하는 도구인가

```
프로그램 아이디어
      │
      ├─ ① 가상 이용자 패널 만들기      통계 비율 입력 또는 합성 데이터 CSV 가져오기
      ├─ ② 설문지 작성                 실제 조사에 쓸 문항 그대로
      ├─ ③ 가상 패널에게 설문 실행      1명 = 독립 응답자 1명, JSON 스키마로 검증
      ├─ ④ 결과 분석                   세그먼트 차이 · 참여장벽 · 몰린 문항 · 반복 안정성
      │        ↓
      │   실제 설문지 보완 → 실제 이용자 조사 실시
      │        ↓
      └─ ⑤ 실제 결과와 비교            %p 차이 · 순위 차 · MAE · Spearman 상관
```

### 이런 것을 알 수 있습니다

| 질문 | 어디서 보나요 |
| --- | --- |
| 어떤 프로그램 후보가 상대적으로 반응이 높은가 | 결과 분석 → 문항별 비율·순위 |
| 독거 / 부부 / 자녀동거의 선호가 어떻게 갈리는가 | 결과 분석 → 세그먼트 분석 |
| 참여를 막는 요인이 무엇으로 반복되는가 | 결과 분석 → 참여장벽, 주관식 키워드 |
| 이 문항, 보기 구성이 잘못된 건 아닐까 | 결과 분석 → 문항 검토 제안(응답 쏠림·미선택 보기 경고) |
| 이 결과를 믿어도 되나 | 실행 기록 → 반복 실행 안정성(변동폭) |
| 시뮬레이션이 실제와 얼마나 달랐나 | 실제 조사 비교 → 비교 리포트 |

---

## 주요 기능

- **가상 이용자 패널 생성** — 분포 입력(연령 45/40/15% 등) 또는 CSV 가져오기.
  `IF 80세 이상 AND 독거 THEN 이동불편 20/35/45%` 같은 **교차표(조건부 규칙)** 지원.
  같은 seed·같은 입력이면 항상 같은 패널이 만들어집니다(재현성).
- **Parquet 데이터셋 변환** — NVIDIA Nemotron-Personas-Korea 같은 Parquet 파일을 CSV로 바꾸는 스크립트 내장.
- **설문 빌더** — 단일선택 / 복수선택 / 5점척도 / 숫자 / 주관식 + **조건부 문항**(Q2가 2점 이하일 때만 Q7 표시).
- **배치 실행** — 동시 실행 수 조절, 진행률 실시간 표시, **실패분만 재실행**, 반복 실행(안정성 비교).
- **구조화 응답 검증** — 모델 출력에서 JSON만 추출 → 문항 스키마 검증 → 보기 근접 매칭 → 실패 시 오류를 알려주며 2회 재시도.
- **분석** — 비율·순위, 척도 통계, 세그먼트 교차분석, 주관식 키워드, 반복 실행 변동폭.
- **실제 조사 비교** — %p 차이, 순위 차, MAE, Spearman 상관, 규칙 기반 해석문 자동 생성.
- **내보내기** — 패널 CSV / 설문 JSON / 응답 CSV / 요약 CSV / 비교 CSV / 프로젝트 전체 JSON 백업.

### 지원하는 AI Provider

| Provider | 모델 예 | 비고 |
| --- | --- | --- |
| **Mock** | `mock-deterministic-v1` | **키 불필요**, 비용 0, 결정적 — 데모 모드의 기본값 |
| **Google Gemini** | `gemini-3.5-flash`, `gemini-2.5-flash` | REST 호출, 대량 실행 시 thinking 자동 off |
| **Anthropic Claude** | `claude-opus-5`, `claude-sonnet-5` | 공식 SDK |
| **OpenAI 호환** | `gpt-4o-mini` 등 | 로컬 LLM·프록시 포함 |

핵심 로직은 `LLMProvider` 인터페이스에만 의존합니다. 새 Provider는 파일 하나를 추가하고 레지스트리에 등록하면 끝입니다.
실행 화면에서 **모델 목록 불러오기**(내 키로 실제 쓸 수 있는 모델 조회)와 **연결 테스트(1회 호출)** 로
키·모델명·응답 형식을 미리 확인할 수 있습니다.

---

## 설치와 실행

필요 환경: **Node.js 20 이상**(권장 22 LTS), npm

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm run build` / `npm start` | 프로덕션 빌드·실행 |
| `npm run seed` | 데모 프로젝트 생성(패널 30명·설문 6문항·Mock 실행·비교 리포트) |
| `npm run db:push` | Prisma 스키마를 SQLite에 반영 |
| `npm run db:reset` | DB 초기화 후 재생성 (**데이터 전부 삭제**) |
| `npm test` | 단위·통합 테스트 (전용 테스트 DB 사용) |
| `npm run personas:csv -- <파일.parquet>` | Parquet → Synthetic Client CSV 변환 |

> **배포 참고**: v1은 로컬 SQLite + 서버 프로세스 내 배치 실행 구조라 **로컬 또는 상시 실행 서버**에 적합합니다.
> 서버리스(예: Vercel)에서는 파일 DB와 장시간 배치가 유지되지 않으므로, 그대로 올리기보다
> PostgreSQL 전환과 작업 큐 도입이 필요합니다.
> Windows에서는 개발 서버가 켜져 있으면 `npm run build` 가 Prisma 엔진 파일 잠금으로 실패합니다. 서버를 끄고 빌드하세요.

---

## API 키 설정

키는 **서버 환경변수로만** 읽습니다. 브라우저로 전달되지 않고 DB에도 저장하지 않습니다.

```bash
# .env  (git에 커밋되지 않습니다)
DATABASE_URL="file:./dev.db"

GEMINI_API_KEY=AIza...          # https://aistudio.google.com/apikey
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

DEFAULT_LLM_PROVIDER="gemini"   # mock | gemini | anthropic | openai
DEFAULT_LLM_MODEL="gemini-3.5-flash"
```

키를 넣고 서버를 다시 시작하면 데모 모드 배지가 사라지고, **설정** 화면에서 연결 상태를 확인할 수 있습니다.
키가 하나도 없으면 자동으로 데모 모드가 유지됩니다.

---

## 데이터 가져오기

### Synthetic Client CSV

```csv
id,age,sex,household_type,housing_type,economic_status,mobility_difficulty,digital_literacy,social_contact
SC001,78,F,독거,임대,낮음,중간,낮음,낮음
SC002,69,M,부부,자가,보통,낮음,보통,높음
```

표준 속성: `age` `sex` `province` `district` `householdType` `maritalStatus` `housingType`
`educationLevel` `employmentStatus` `economicStatus` `healthStatus` `mobilityDifficulty`
`digitalLiteracy` `socialContactLevel` `careNeed` `currentServiceUse`

컬럼명이 달라도 가져오기 화면에서 직접 매핑할 수 있고, 매핑하지 않은 컬럼은 사용자 정의 필드로 보존됩니다.
예시 파일: [`data/sample/synthetic-clients.csv`](./data/sample/synthetic-clients.csv)

### Parquet 데이터셋 (예: NVIDIA Nemotron-Personas-Korea)

```bash
# 1) 컬럼 확인
npm run personas:csv -- data/private/nemotron-korea.parquet --columns

# 2) 65세 이상 300명을 seed 고정해 추출
npm run personas:csv -- data/private/nemotron-korea.parquet --min-age 65 --limit 300 --seed 42
#    → data/private/personas.csv 를 가져오기 화면에서 업로드
```

흔한 컬럼명은 표준 속성으로 자동 변환하고, 이름·연락처 등 **개인정보 의심 컬럼은 변환 단계에서 제외**합니다.
인터넷에서 내려받지 않고, 이미 받아 둔 로컬 파일만 변환합니다.

> 일반 인구 페르소나에는 이동 불편·돌봄 필요 같은 복지 특성이 없습니다.
> 이런 속성은 **분포로 생성**의 조건부 규칙으로 보강하세요. AI가 임의로 만들어내지 않습니다.

### 실제 설문 결과 CSV

```csv
respondent_id,Q1,Q2,Q3
R001,병원동행,5,혼자 가기 어려움
R002,스마트폰 활용교육,4,필요하지만 배울 곳이 없음
```

복수선택은 `식사 지원|이동·차량 지원` 처럼 구분자로 나열합니다.
**이 데이터는 로컬 DB에만 저장되며 외부 AI 모델로 전송하지 않습니다.**

---

## 개인정보·윤리

- 이름·전화번호·주소·주민등록번호·이메일 등 **개인 식별정보를 업로드하지 마세요.**
  업로드 시 컬럼명과 값 패턴을 검사해 차단하지만, 컬럼명을 바꾸면 우회할 수 있어 **완전한 보호 장치가 아닙니다.**
- 모든 데이터는 로컬 SQLite(`prisma/dev.db`)에 저장됩니다. API 키는 DB에 저장하지 않습니다.
- 모든 결과 화면에 다음 문구가 항상 표시됩니다:
  *"이 결과는 AI와 합성 페르소나를 이용한 사전 시뮬레이션입니다. 실제 이용자·지역주민의 욕구조사를 대체하지 않습니다."*
- 다음 용도로 **사용하지 않습니다**: 대상자 선정 / 위험도 판정 / 사례관리 개입 우선순위 결정 /
  실제 주민 의견의 대체 / 의료·정신건강·학대·위기 판단 / 공식 통계 추정치 제공.
- 페르소나 요약은 LLM이 아니라 **규칙 기반**으로 생성합니다. 제공되지 않은 질병·성격·감정을 지어내지 않고,
  "불쌍하다" 같은 가치 판단 표현을 쓰지 않습니다.

---

## 구조

```
app/                화면(App Router) + API Route Handlers
components/         UI 프리미티브 · 차트 · 폼 위저드
lib/
  ai/               Provider Adapter(mock·gemini·anthropic·openai), 프롬프트, 응답 검증
  clients/          페르소나 요약, 컬럼 매핑, 분포 기반 생성
  survey/           문항 스키마·조건부 로직, 데모 설문
  analytics/        집계·세그먼트·안정성·비교 계산
  import/ privacy/  CSV 파서, 개인정보 탐지
  services/         Project / Dataset / Survey / Run / Analysis / Actual / Comparison / Export / Demo / Audit
prisma/             schema.prisma(10개 모델), seed.ts
scripts/            parquet-to-csv.mjs
tests/              단위 + 통합 테스트
docs/data-model.md  데이터 구조 상세
```

UI는 서비스 레이어를 통해서만 DB·LLM에 접근합니다.
자세한 사용법은 **[사용법.md](./사용법.md)**, 데이터 구조는 **[docs/data-model.md](./docs/data-model.md)** 를 보세요.

## 테스트

```bash
npm test
```

GitHub Actions 워크플로(`.github/workflows/ci.yml`)가 포함되어 있습니다. 푸시하려면 한 번만
`gh auth refresh -h github.com -s workflow` 로 권한을 추가한 뒤 커밋하세요.

CSV 파싱, 컬럼 매핑, 개인정보 탐지, 설문 검증, LLM 응답 스키마 검증, 비율·척도 계산,
세그먼트 필터, Synthetic/Actual 차이 계산, 생성 재현성, Gemini 어댑터(요청 형식·오류 처리),
그리고 프로젝트 생성 → CSV import → 설문 → Mock 실행 → 분석 → 비교 → 내보내기 전체 흐름을 검증합니다.

## 라이선스

[MIT](./LICENSE)
