# 선수 운영 시스템 기획서

대상 기능: 1·2군 로스터 체계, 1군 확장 로스터, 부상/대체, 트레이드, 국내 FA 영입,
외국인 선수 영입, 아시아 쿼터 영입, 신인 드래프트·2차 드래프트, 선수 성장·은퇴.

이 문서는 위 9개 기능을 구현하기 위한 전체 아키텍처, 데이터 모델, 알고리즘,
모듈 구조, 단계별 로드맵을 정리한다. 현재 엔진(`src/`)은 **"10팀 19인 로스터로
144경기 1회 시뮬레이션"**을 한 번의 동기 함수 호출(`simulateKboSeason`)로 처리하는
무상태(stateless) 구조다. 아래 기능들은 본질적으로 **여러 시즌에 걸친 "프랜차이즈
세이브"**를 필요로 하므로, 가장 큰 변화는 이 무상태 구조를 시즌→오프시즌 사이클을
가진 영속 상태(persistent state)로 확장하는 것이다.

---

## 1. 전체 아키텍처: 프랜차이즈 사이클

```
[프리시즌]
  └─ 1군 엔트리 확정 (26인), 외국인/아시아쿼터 확정
[정규시즌] (144경기, 기존 leagueSim 로직 재사용)
  ├─ 경기마다: 부상 판정 → 발생 시 2군 콜업으로 대체
  ├─ 게임 110/144 시점: 트레이드 마감
  └─ 게임 121/144 시점: 확장 로스터(28인) 발효, 2군 콜업
[포스트시즌] (기존 postseason 로직 재사용)
[오프시즌]
  ├─ 은퇴 판정 (나이/성적 기반)
  ├─ 성장·하락 (나이 곡선 기반 능력치 변화)
  ├─ 2차 드래프트 (N년 주기)
  ├─ 국내 FA 시장
  ├─ 외국인·아시아쿼터 재계약/영입
  └─ 신인 드래프트
  └─ → 다음 시즌으로
```

새 최상위 타입 `FranchiseState`가 이 전체를 감싼다:

```typescript
// src/franchise/types.ts
export interface FranchiseState {
  year: number;                 // 시즌 연도 (예: 2025)
  phase: FranchisePhase;        // 'preseason' | 'regularSeason' | 'postseason' | 'offseason'
  teams: TeamFranchiseState[];  // 10팀의 전체 선수단
  draftPoolNextYear: PlayerProfile[];   // 다음 드래프트 대상 유망주 풀
  domesticFreeAgents: PlayerProfile[];  // 국내 FA 시장
  foreignFreeAgents: PlayerProfile[];   // 외국인 시장
  asiaQuotaFreeAgents: PlayerProfile[]; // 아시아 쿼터 시장
  transactionLog: TransactionRecord[];  // 트레이드/영입/방출/은퇴 이력 (UI 표시용)
}

export interface TeamFranchiseState {
  teamId: string;
  roster: PlayerProfile[];      // 1군+2군+부상자 전체 (최대 65명)
}
```

`simulateKboSeason`은 그대로 두고, 그 위에 `franchise/seasonCycle.ts`가
"이번 시즌에 쓸 `LeagueTeam[]`을 `TeamFranchiseState.roster`에서 뽑아 구성 →
시즌 시뮬레이션(부상/콜업 훅 포함) → 결과를 다시 roster에 반영 → 오프시즌 처리"
순서로 한 시즌을 진행한다.

---

## 2. 데이터 모델 확장

### 2.1 신규 타입: `src/types/roster.ts`

```typescript
export type Position = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';

export type RosterStatus = '1군' | '2군' | '부상자명단' | '은퇴';

export type PlayerOrigin = 'domestic' | 'foreign' | 'asiaQuota' | 'draft' | 'secondaryDraft';

export interface ContractInfo {
  yearsRemaining: number;
  annualSalary: number;       // 단위: 만원 (표시용)
  faEligible: boolean;
}

export interface InjuryStatus {
  description: string;        // 예: '햄스트링 부상'
  daysRemaining: number;       // 게임 수 기준 잔여 결장 기간
}

/** 기존 BatterAttributes/PitcherAttributes를 감싸는 선수 운영 메타데이터. */
export interface PlayerProfile {
  playerId: string;            // 전역 고유 ID. 트레이드 시에도 변하지 않음 (현재의 'T1-b001'식 팀-접두 ID와 분리)
  kind: 'batter' | 'pitcher';
  attributes: BatterAttributes | PitcherAttributes;
  position?: Position;         // batter만 사용
  age: number;
  potential: number;            // 0-100, 성장 한계치 (숨김 스탯)
  rosterStatus: RosterStatus;
  origin: PlayerOrigin;
  contract: ContractInfo;
  serviceTimeYears: number;     // FA 자격 판정용 (1군 등록일수 기준을 연 단위로 단순화)
  injury?: InjuryStatus;
}
```

**중요한 결정 — Player ID 전역화**: 현재 `T1-b001` 식으로 ID에 팀 번호가 박혀
있다. 트레이드/드래프트로 선수가 팀을 옮기면 통계 이력과 ID가 어긋난다.
→ `playerId`는 생성 시 한 번 부여되는 전역 고유값(`P00001` 등)으로 바꾸고,
`attributes.id`도 이 값을 그대로 쓴다. 이름에 박힌 "팀명 접두사"(`두산 베어스 김민수`)는
표시용 라벨이므로, 선수 이름 자체는 팀명 없이 저장하고 UI에서 현재 소속 팀명을
조합해서 보여주는 방식으로 변경한다. (기존 `sampleLeague.ts`의 `${name} ${b.name}`
조합 방식은 더 이상 쓰지 않음.)

### 2.2 로스터 규모 상수: `src/roster/constants.ts`

| 상수 | 값 | 의미 |
|---|---|---|
| `ACTIVE_ROSTER_SIZE` | 26 | 1군 엔트리 |
| `EXPANDED_ROSTER_SIZE` | 28 | 9월 확장 로스터 |
| `EXPANSION_GAME_INDEX` | 120 | 144경기 중 121번째 경기부터 확장 적용 |
| `TRADE_DEADLINE_GAME_INDEX` | 110 | 트레이드 마감 (이후 거부) |
| `TOTAL_SQUAD_SIZE` | 65 | 팀 전체 보유 선수 한도 |
| `FOREIGN_SLOTS` | 3 | 외국인 선수 보유 한도 |
| `ASIA_QUOTA_SLOTS` | 1 | 아시아 쿼터 보유 한도 |
| `DRAFT_ROUNDS` | 10 | 신인 드래프트 라운드 |
| `SECONDARY_DRAFT_CYCLE_YEARS` | 3 | 2차 드래프트 주기 |
| `SECONDARY_DRAFT_PROTECTED_SIZE` | 35 | 2차 드래프트 보호 선수 수 |
| `FA_ELIGIBILITY_YEARS` | 8 | 국내 FA 자격 취득 연차 |
| `RETIREMENT_SOFT_AGE` | 36 | 은퇴 확률이 유의미해지는 나이 |
| `RETIREMENT_HARD_AGE` | 43 | 강제 은퇴 나이 |
| `PEAK_AGE_BATTER` / `PEAK_AGE_PITCHER` | 27 / 28 | 능력치 정점 나이 |

(모두 `src/roster/constants.ts`에 모아두고, 추후 난이도/모드 설정으로 노출 가능)

---

## 3. 기능별 설계

### 3.1 1·2군 로스터 체계 + 자동 라인업 구성 (Depth Chart)

- 각 팀의 `roster: PlayerProfile[]`는 최대 65명. `rosterStatus`가 `'1군'`인
  선수는 `ACTIVE_ROSTER_SIZE`(26, 확장기 28)명 이하.
- 새 모듈 `src/roster/depthChart.ts`:
  ```typescript
  export function buildDepthChart(roster: PlayerProfile[]): TeamSetup
  ```
  1군 선수 중에서:
  - **포지션별 최고 선수**로 9인 라인업 구성 (포지션당 1명, 같은 포지션
    복수 후보는 종합 능력치로 정렬해 1명 선발 + 나머지는 벤치 후보)
  - 종합 능력치 상위 5명의 선발 투수로 로테이션 구성
  - 나머지 투수 중 상위 N명으로 불펜 구성
  - 남는 타자 중 상위 2~3명을 벤치로
  - 결과를 기존 `TeamSetup`(lineup/bench/pitcher/bullpen/defense)으로 변환 →
    **`simulateKboSeason`은 수정 없이 그대로 재사용 가능**
- "종합 능력치" 계산용 헬퍼 `src/roster/rating.ts`의 `overallRating(profile)` —
  타자는 contact/power/discipline 가중합, 투수는 stuff/control/stamina 가중합.
  (기존 `mapper/statsToAttributes.ts`와 겹치지 않게 별도 단순 가중치로 구현)

### 3.2 1군 확장 로스터

- `leagueSim.ts`의 게임 루프에 훅 추가: `gameIndex >= EXPANSION_GAME_INDEX`이면
  해당 팀의 `ACTIVE_ROSTER_SIZE` 판정 기준을 28로 올림.
- 확장 시점에 각 팀은 2군에서 종합 능력치가 가장 높은 선수 최대 2명을
  `rosterStatus: '2군' → '1군'`으로 콜업 (포지션 무관, 단 투수/타수 균형은
  기존 1군 구성 비율 유지하도록 단순 가중치 적용).
- 시즌 종료(포스트시즌 진입) 시 확장 인원은 다시 `'2군'`으로 환원.

### 3.3 부상 및 대체

- `src/roster/injuries.ts`:
  ```typescript
  export function rollInjuries(activeRoster: PlayerProfile[], rng: () => number): InjuryEvent[]
  ```
  - 경기당 각 1군 선수에게 매우 낮은 기본 확률(예: 0.15%/경기)로 부상 판정.
  - 확률은 `age`(33+부터 가중), 그리고 기존 `FatigueState`의 누적 피로도로
    보정(피로 높을수록 ↑). 발생 시 `daysRemaining`은 5~60 사이에서 부상
    심각도 등급(경상/중상/대형)에 따라 랜덤 결정.
  - 부상 선수: `rosterStatus → '부상자명단'`, `injury` 필드 채움.
- `src/roster/callUps.ts`:
  ```typescript
  export function fillRosterGaps(team: TeamFranchiseState, rng: () => number): CallUpEvent[]
  ```
  - 1군 인원이 엔트리 정원보다 부족하면, 2군에서 **부상 선수와 같은 포지션/역할
    (타자→같은 Position, 투수→선발/구원 role)** 우선으로 최고 능력치 선수를 콜업.
  - 매 경기(또는 매 N경기) 종료 후 `injury.daysRemaining -= 1`; 0이 되면
    `'부상자명단' → '2군'` 복귀(엔트리가 차 있으면 2군 대기, 비어있으면 즉시 1군
    재합류 가능).
- `leagueSim.ts` 통합: 매 경기 시작 전 `rollInjuries` → `fillRosterGaps` →
  `buildDepthChart`로 그 경기의 `TeamSetup` 재생성. (경기 수가 많아 성능이
  걱정되면 "N경기마다 한 번씩 재판정"으로 빈도 조절 가능 — Phase 2에서 실측 후 결정)

### 3.4 트레이드

- `src/franchise/trade/types.ts`:
  ```typescript
  export interface TradeProposal {
    teamAId: string;
    teamBId: string;
    playersFromA: string[]; // playerId
    playersFromB: string[];
  }
  ```
- `tradeEvaluation.ts`:
  - `playerValue(profile): number` — 종합 능력치 + `potential` 보너스(나이가
    어릴수록 potential 가중 ↑, `PEAK_AGE` 이후엔 현재 능력치 위주) + 계약
    잔여년수 보정.
  - `evaluateTrade(proposal, state): { aGain: number; bGain: number }` —
    양 팀이 받는 쪽 총합 - 주는 쪽 총합. AI 팀은 `aGain >= -tolerance`이고
    포지션 뎁스(같은 포지션 1군 선수가 0명이 되지 않는지)를 만족하면 수락.
- `tradeExecution.ts`: 두 팀의 `roster` 배열에서 선수를 맞바꾸고
  `TransactionRecord`를 `transactionLog`에 추가. `playerId`가 전역 고유이므로
  통계 이력(연도별 누적 스탯, Phase 4에서 다룸)도 그대로 따라간다.
- 트레이드 마감: `TRADE_DEADLINE_GAME_INDEX` 이후 발생한 `TradeProposal`은
  거부(시즌 중 UI에서는 마감 이후 트레이드 화면 비활성화).

### 3.5 국내 선수 FA 영입

- 오프시즌 진입 시, `serviceTimeYears >= FA_ELIGIBILITY_YEARS`인 선수 중
  일부(확률적, 예: 70%)가 "FA 선언" → `domesticFreeAgents`로 이동(원 소속팀
  roster에서는 제거하되, 등급 보상 대상으로 표시).
- FA 등급(A/B/C)은 직전 시즌 `overallRating` 백분위로 산정. 등급별 보상 규칙은
  표시/로그 목적으로만 단순화 구현 (예: A등급 영입 시 보상선수 1명 + 연봉
  200% 또는 연봉 300%, B등급은 1명+150%/300%, C등급은 연봉만) — 실제 보상
  이행은 Phase 5에서 트레이드 실행 로직 재사용.
- AI 영입 로직: 각 팀이 "포지션별 뎁스 점수"가 낮은 자리부터 시장가(연봉
  추정치, `playerValue` 기반) 순으로 입찰 시뮬레이션 → 최고 입찰팀이 영입.
- 영입된 선수: `rosterStatus: '2군'`(또는 즉시 `buildDepthChart` 재계산으로
  1군 편입 가능), `origin` 유지, `serviceTimeYears` 유지, `contract` 갱신.

### 3.6 외국인 선수 영입

- 각 팀은 `FOREIGN_SLOTS`(3) 명까지 `origin: 'foreign'` 보유.
- 계약은 1~2년(`contract.yearsRemaining`). 오프시즌마다 1씩 감소, 0이 되면
  재계약 여부 판정(능력치 우수 + 팀 만족도↑면 재계약 확률 ↑).
- 재계약 실패/방출 시 빈 슬롯은 `foreignFreeAgents` 풀에서 영입.
  `src/franchise/offseason/foreignSigning.ts`의
  `generateForeignFreeAgentPool(rng, count)`이 매 오프시즌 새 후보를 생성
  (기존 `samplePlayers.ts`의 스케일링 로직을 재사용하되, 분산을 더 크게 줘서
  "대박/먹튀" 편차 표현).
- AI 영입: 국내 FA와 동일한 "뎁스 점수 기반 입찰" 로직 재사용.

### 3.7 아시아 쿼터 영입

- `ASIA_QUOTA_SLOTS`(1)명, `origin: 'asiaQuota'`. 메커니즘은 3.6과 동일하되:
  - 별도 풀 `asiaQuotaFreeAgents` (생성 시 `nationality` 메타: 일본/대만/호주 등
    표시용 필드 — `PlayerProfile`에 `nationality?: string` 선택 필드 추가)
  - 생성 시 능력치 분산을 외국인 풀보다 다소 낮게(평균적으로 즉시 전력감이
    크지 않은 캐릭터성 반영) — 단, 가끔 고능력치 "깜짝 영입" 허용.

### 3.8 신인 드래프트 / 2차 드래프트

**신인 드래프트** (`src/franchise/offseason/draft.ts`, 매년):
- `generateDraftClass(rng, size=100)`: 나이 18~21, `attributes`는 낮은
  현재 능력치(대략 20~50)에 `potential`은 30~95로 넓게 분포시켜 생성.
  타자/투수 비율은 기존 리그 비율과 유사하게(약 55:45).
- 드래프트 순서: 직전 시즌 **역순위**(최하위팀이 1라운드 1번 선택).
  `DRAFT_ROUNDS`(10)라운드, 각 라운드 10픽(총 100명).
- AI 픽 로직: 각 팀이 "1군/2군 통합 포지션별 뎁스"가 가장 얕은 포지션을
  우선으로, 해당 포지션 내 `potential` 최고 선수를 선택 (전원 동일 로직이므로
  단순 반복으로 구현 가능).
- 선발된 선수: `origin: 'draft'`, `rosterStatus: '2군'`, `serviceTimeYears: 0`,
  `contract`: 신인 표준계약(낮은 연봉, 다년).

**2차 드래프트** (`secondaryDraft.ts`, `SECONDARY_DRAFT_CYCLE_YEARS`(3)년마다):
- 각 팀이 보유 선수 중 `SECONDARY_DRAFT_PROTECTED_SIZE`(35)명을 "보호선수"로
  지정(AI: `playerValue` 상위 35명 자동 선정). 나머지(최대 30명)가 노출.
- 노출 선수 전체를 풀로 모아, **직전 시즌 역순위**로 팀당 1~2명 한도 픽
  (KBO 규정 단순화: 라운드당 팀별 1명, 총 2라운드).
- 원 소속팀에는 `TransactionRecord`로 보상금 로그만 남김(연봉 일부 단순
  수치 — 실제 자금 시스템은 범위 밖).
- 이적 선수: `origin: 'secondaryDraft'`, `rosterStatus: '2군'`.

### 3.9 선수 성장 및 은퇴

`src/franchise/offseason/development.ts`, 매 오프시즌 모든 비은퇴 선수 대상:

```typescript
export function ageOnePlayer(profile: PlayerProfile, rng: () => number): PlayerProfile
```

- `age += 1`, `serviceTimeYears += 1`.
- **성장/하락 곡선**:
  - `peakAge = kind === 'batter' ? PEAK_AGE_BATTER : PEAK_AGE_PITCHER`
  - `age < peakAge`: 각 스케일 가능 능력치를 `potential` 방향으로
    `growthRate = max(0, (peakAge - age)) * 0.4`만큼 이동(클램프 1~99).
    (어릴수록, potential과 현재치 격차가 클수록 더 빠르게 성장)
  - `age >= peakAge`: `declineRate = (age - peakAge) * 0.3 + jitter`만큼
    능력치 하락. 33세 이후 가속(`* 1.5`).
  - `potential` 자체는 변하지 않음(선수의 타고난 한계).
- **은퇴 판정**:
  - `age >= RETIREMENT_HARD_AGE` → 무조건 은퇴.
  - `age >= RETIREMENT_SOFT_AGE`: `retireProb = (age - RETIREMENT_SOFT_AGE) * 0.08
    + (overallRating < 40 ? 0.15 : 0) + (rosterStatus === '2군' ? 0.1 : 0)`,
    `rng() < retireProb`면 은퇴.
  - 은퇴 시 `rosterStatus: '은퇴'`, 팀 `roster`에서 제거(별도
    `retiredPlayers` 아카이브로 이동 — 향후 "은퇴선수 명예의 전당" 등 확장 여지).

---

## 4. 시즌 시뮬레이션과의 통합 지점

기존 `simulateKboSeason(teams: LeagueTeam[], options, rng)`의 시그니처는 그대로
유지한다. 새 함수 `src/franchise/seasonCycle.ts`의
`playFranchiseSeason(state: FranchiseState, rng): FranchiseState`가:

1. 각 팀 `roster`에서 `buildDepthChart()`로 `LeagueTeam[]` 생성
2. `simulateKboSeason`을 **그대로 호출**하되, `GameOptions`에 새 콜백
   `onGameComplete?: (gameIndex, teamId) => void` 하나를 추가해 그 안에서
   `rollInjuries`/`fillRosterGaps`/확장 로스터/트레이드 마감 체크를 수행
   (즉, `leagueSim.ts`의 게임 루프 자체는 거의 안 건드리고 훅만 추가)
3. 시즌 결과(스탯/순위/포스트시즌)를 `FranchiseState`에 합치고 `phase: 'offseason'`
4. 오프시즌 함수들을 순서대로 실행 → `year += 1`, `phase: 'preseason'`

이 구조 덕분에 **Phase 1~3은 기존 `gameEngine`/`leagueSim` 내부를 거의 수정하지
않고** 새 모듈 추가 + 얇은 훅 삽입만으로 구현 가능하다.

---

## 5. 모듈 구조 계획

```
src/
  types/
    roster.ts            (신규) PlayerProfile, Position, RosterStatus, ContractInfo, ...
  roster/                (신규)
    constants.ts
    rating.ts            overallRating()
    depthChart.ts        buildDepthChart()
    injuries.ts          rollInjuries()
    callUps.ts           fillRosterGaps()
    expansion.ts         확장 로스터 판정
  franchise/             (신규)
    types.ts             FranchiseState, TeamFranchiseState, TransactionRecord
    seasonCycle.ts        playFranchiseSeason()
    trade/
      types.ts
      evaluation.ts
      execution.ts
    offseason/
      development.ts      성장/은퇴
      freeAgency.ts        국내 FA
      foreignSigning.ts    외국인
      asiaQuotaSigning.ts  아시아쿼터
      draft.ts             신인 드래프트
      secondaryDraft.ts    2차 드래프트
  data/
    playerPoolGenerator.ts (신규) 65인 풀 생성 (현재 sampleLeague의 19인 생성을 대체/확장)
```

기존 `src/data/sampleLeague.ts`, `samplePlayers.ts`는 Phase 0에서
`playerPoolGenerator.ts`로 점진 대체(현재 19인 → 65인 풀, 포지션/나이/잠재력
부여).

---

## 6. 단계별 구현 로드맵

| Phase | 내용 | 산출물 |
|---|---|---|
| **0** | `PlayerProfile`/`roster.ts` 타입 정의, 로스터 상수, 65인 선수풀 생성기 (포지션·나이·잠재력 포함, 전역 ID) | 타입 + `playerPoolGenerator.ts` + 테스트 |
| **1** | `overallRating`, `buildDepthChart` → 시즌 시뮬레이션이 1·2군 풀에서 라인업/로테이션/불펜 자동 구성 | `roster/rating.ts`, `roster/depthChart.ts` |
| **2** | 확장 로스터(9월) 로직 + `leagueSim` 훅 | `roster/expansion.ts` |
| **3** | 부상 판정 + 콜업 대체 로직 + `leagueSim` 훅 | `roster/injuries.ts`, `roster/callUps.ts` |
| **4** | `FranchiseState` + `seasonCycle` + 성장/은퇴(오프시즌 루프 최초 완성, 다음 시즌으로 넘어가는 최소 루프) | `franchise/types.ts`, `seasonCycle.ts`, `offseason/development.ts` |
| **5** | 트레이드(평가/실행) + 트레이드 마감 | `franchise/trade/*` |
| **6** | 국내 FA + 외국인 + 아시아쿼터 영입 (입찰 로직 공유) | `offseason/freeAgency.ts`, `foreignSigning.ts`, `asiaQuotaSigning.ts` |
| **7** | 신인 드래프트 + 2차 드래프트 | `offseason/draft.ts`, `secondaryDraft.ts` |
| **8** | 웹 UI: 로스터/뎁스차트 화면, 오프시즌 진행 화면, 드래프트 화면, 트랜잭션 로그 | `web/src/components/*` 신규 |

각 Phase는 독립적으로 테스트 가능하며, Phase 0~3을 마치면 "1·2군 + 확장
로스터 + 부상"이 적용된 **단일 시즌** 시뮬레이션이 완성된다. Phase 4부터
"여러 시즌을 이어서 플레이"하는 진짜 프랜차이즈 모드가 시작된다.

---

## 7. 단순화 가정 (확인 필요)

실제 KBO 규정을 일부 단순화했다. 아래 항목은 현재 가정값으로 진행하되,
원하시면 조정 가능합니다:

1. **군 보류(상무/경찰청) 시스템은 범위에서 제외** — 군 입대로 인한 장기
   이탈은 모델링하지 않음 (필요 시 "장기 부상자명단"으로 대체 표현 가능).
2. **연봉/샐러리캡은 표시·로그용 숫자**일 뿐, 영입 가능 여부를 제한하는
   실제 "구단 예산" 시스템은 만들지 않음 (향후 확장 여지만 남김).
3. **2차 드래프트 보상금 규정은 로그 텍스트로만 표현**(실제 자금 이동 없음).
4. **부상 판정 빈도/확률, 성장·하락 곡선의 구체적 수치(0.4, 0.3 등)는
   초기 추정값** — Phase별 구현 후 시뮬레이션 결과(평균 은퇴 연령, 시즌당
   부상자 수 등)를 보고 튜닝.
5. **선수 이름**: 드래프트/외국인/아시아쿼터로 새로 생성되는 선수 이름을
   위한 한글/외국 이름 풀이 필요 — Phase 0에서 `data/nameGenerator.ts` 추가.

---

## 8. 다음 단계

이 기획대로 진행한다면, **Phase 0(타입 확장 + 65인 선수풀 생성)**부터
시작하는 것을 제안합니다. Phase 0~1이 끝나면 "확장된 로스터에서 자동으로
최고의 라인업을 구성해 시즌을 돌리는" 결과를 웹 UI(시즌 시뮬레이션 화면)에서
바로 체감할 수 있습니다.
