# 검사 평타 5단 동작 도트 Implementation Plan

> **For agentic workers:** 이 계획은 **인라인 실행**(superpowers:executing-plans)으로 한다. 도트는 그림을 보며 고쳐야 해서 한 세션 안에서 눈으로 확인하는 루프가 필요하다. 단계는 체크박스(`- [ ]`)로 추적한다.

**Goal:** 검사 평타 1~5단의 몸동작을 이펙트·타격 시점에 맞게 새로 찍는다 (설계: `docs/superpowers/specs/2026-11-25-swordsman-motion-design.md`).

**Architecture:** 원본 기사 시트에서 거의 안 변하는 부분(머리·머리카락·어깨갑옷·몸통)을 도트 조각(stamp)으로 오려 쓰고, 팔·다리·칼·망토 끝만 포즈마다 새로 찍는다. 조각을 임의 각도로 돌리지 않는다(계단 현상). 뒤집기·1px 이동·미리 그린 변형만 쓴다. 칸은 애니메이션 재생이 아니라 **동작 경과 시간(`PlayerAction.t`)**으로 고른다.

**Tech Stack:** TypeScript, Phaser 3, Canvas 2D. 테스트 러너가 없다 → 검증은 `tsc --noEmit`, 확대 PNG 눈 검사, 브라우저에서 `g.step`으로 시간을 돌려 타격 칸 캡처.

## Global Constraints

- 모든 그림은 오른쪽을 보는 방향. 왼쪽은 `setFlipX`.
- 외곽선·어두운 색 `0x130a1b`. 기사 팔레트: 망토 `0xed053e 0x810936 0x800735`, 금장 `0xffcc61 0xbc6c17 0x983e1d`, 피부 `0xffd9b9 0xffc98b 0xe1924d`, 몸 어두운 보라 `0x573b60 0x966495`, 칼날 회색 `0xaf9785`.
- 새 칸 크기 **96×64**, 발바닥 = 칸 맨 아래 줄(y=63), 몸통 기준 x = **40** (`SWORD_ORIGIN_X = 40/96`).
- 완전한 직선·균일한 굵기를 피한다 (망토는 칸마다 모양이 다르다).
- 스프라이트 확대는 3배 이하 (기존 규칙).
- 검 평타(`weapon.def.type === 'sword'`, 땅에서, `PlayerAction.step` 있음)에서만 새 칸을 쓴다. 도(dao)·공중·웅크림 평타·궁극기의 `slash`는 기존 시트 그대로.
- `SLASH_TIMING`·`comboSlash`의 판정·이동량은 바꾸지 않는다.

## 확인해 둔 사실

- `startAction('slash', dur, hits)`의 `dur`·`hits`는 고정값이다. 공격속도 버프(`speedMul`)는 이동속도에만 쓰여, 동작 시간은 변하지 않는다 → 시간 기준 칸 선택이 타격에 맞는다.
- 검의 칼은 시트에 그려져 있고(`isMelee`면 `updateHeld`가 일찍 끝남) 근접 오라는 몸 앞쪽 대략 위치에서 나온다 → 칼 끝 좌표를 내보낼 필요 없음. 무기별 칼 모양 차이는 오라뿐인 현재 방식 그대로.
- 도(dao)도 `comboSlash`를 쓰므로 반드시 `type === 'sword'`로 가른다.
- 평타 단계는 `p.combo`가 동작 도중 바뀔 수 있어 읽지 않고, 시작할 때 `PlayerAction.step`에 저장한다.

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/game/swordMotion/stamps.ts` (새) | 로드된 `hero-idle`·`hero-attack` 시트에서 머리·어깨갑옷·몸통을 `ImageData` 조각으로 오려 캐시. 조각 좌표 상수. |
| `src/game/swordMotion/pixels.ts` (새) | 96×64 RGBA 버퍼와 도트 도구 (`px`, `line`, `rect`, `stamp`, 외곽선 자동 두르기). DOM 없음. |
| `src/game/swordMotion/poses.ts` (새) | `SwordPose` 타입, 평타 1~5단 포즈 칸 목록과 칸별 시작 시각. **이 데이터가 산출물**이며 그림을 보며 조정한다. |
| `src/game/swordMotion/rig.ts` (새) | `drawPose(buf, pose, stamps)`: 조각 배치 + 팔·다리·칼·망토 찍기. |
| `src/game/swordMotion/index.ts` (새) | `createSwordMotion(scene)`: 단계별 시트 텍스처 `sword-combo-1..5` 등록. `swordFrameAt(step, t)`: 경과 시간 → 칸 번호. `SWORD_ORIGIN_X`. |
| `src/game/bootScene.ts` | `createClassSprites` 다음에 `createSwordMotion(this)` 호출. |
| `src/game/player2d.ts` | `PlayerAction.step?` 추가. `animate()`에서 검 평타면 시간 기준 칸을 고르고 기준점 적용. `play()`가 포즈 뒤 되돌아올 때 멈추지 않게 처리. |
| `src/game/combat/index.ts:63-66` | 평타 시작 때 `step` 저장. |
| `src/game/dev.ts` | `window.__bw.swordSheet(step)`: 단계 시트를 PNG dataURL로 돌려줌 (미리보기용). |

---

### Task 1: 한 칸 스파이크 — 원본과 나란히 놓고 사용자 승인 (이 Task에서 멈춘다)

방법 A가 원본 그림체와 어울리는지가 이 계획 전체의 전제다. 한 칸이 승인되기 전에 Task 2 이후를 만들지 않는다.

**Files:** Create `src/game/swordMotion/pixels.ts`, `stamps.ts`, `rig.ts`, `poses.ts`(1단 타격 칸 하나만), `index.ts`(미리보기용 최소); Modify `src/game/dev.ts`.

**Interfaces:**
- Produces:
  - `type Buf = { w: number; h: number; data: Uint8ClampedArray }`, `newBuf(w, h)`
  - `px(b, x, y, rgb)`, `rect(b, x0, y0, x1, y1, rgb)`, `line(b, x0, y0, x1, y1, rgb | ((i:number)=>number))`, `blit(b, src: Buf, dx, dy, flip = false)`, `outline(b, rgb = 0x130a1b)` (투명 픽셀 중 불투명과 맞닿은 곳을 칠함)
  - `interface SwordPose { torso: [x: number, y: number]; head: [x: number, y: number]; lean: number; front: Limb; back: Limb; legs: Legs; blade: [baseX: number, baseY: number, tipX: number, tipY: number]; cape: [x: number, y: number][] }` — 좌표는 칸 안 픽셀, 발바닥 y=63. `Limb = { shoulder: [number, number]; elbow: [number, number]; hand: [number, number] }`, `Legs = { frontFoot: [number, number]; backFoot: [number, number]; knees: [[number, number], [number, number]] }`
  - `drawPose(pose: SwordPose, stamps: Stamps): Buf`

- [ ] **Step 1: 조각 좌표 재기.** 원본을 격자 확대로 본다.
  ```bash
  cd "<scratchpad>" && venv/Scripts/python -I grid.py "C:/Users/USER/Desktop/project/public/assets2d/hero/idle.png" idle_grid.png 10 0
  ```
  (`grid.py`는 이 단계에서 `zoom.py`에 10픽셀마다 눈금선·좌표 라벨을 넣어 만든다.) 이미지를 읽고 `idle` 0번 칸(38×48)과 `attack` 3번 칸(96×48, 팔을 앞으로 뻗은 칸)에서 **머리+머리카락, 어깨갑옷, 몸통(목~허리)** 사각형 `{src, frame, x, y, w, h}`을 `stamps.ts`의 `STAMP_RECTS`에 적는다.
- [ ] **Step 2: `pixels.ts`, `stamps.ts` 작성.** `stamps.ts`는 `scene.textures.get(key).getSourceImage()`를 캔버스에 그려 `getImageData`로 조각을 만든다.
- [ ] **Step 3: `rig.ts` + 1단 타격 칸 하나.** 포즈 기준: 앞발 내디딤, 상체가 앞으로 기울고, 앞팔이 사선으로 뻗어 칼이 오른쪽 아래를 가리키며, 망토 끝이 뒤로 휘날림. 외곽선은 `outline()`으로 두른다.
- [ ] **Step 4: 미리보기 출력.** `dev.ts`에 `swordSheet(step)`을 추가한다 (캔버스 → `toDataURL('image/png')`). 개발 서버(`npm run dev`)를 띄우고 브라우저 도구로 `await __bw.swordSheet(1)`을 실행해 base64를 받아 스크래치패드에 PNG로 저장한다.
- [ ] **Step 5: 원본 옆에 놓고 6배로 비교.** `compare.py`로 `idle` 0번 칸·`attack` 0~3번 칸·새 칸을 한 줄에 놓은 `spike_x6.png`를 만든다. 직접 눈으로 확인하고, 거칠면 조각을 더 쓰거나(몸통 아래·허벅지까지) 팔 도트를 고친다. 3번 이상 고쳐도 원본과 이질적이면 방법을 사용자와 다시 정한다 (조각 오려 위치 바꾸기 / 칸을 문자열로 직접 찍기).
- [ ] **Step 6: 커밋하고 사용자에게 이미지 경로를 보여 주며 승인을 받는다.** `npx tsc --noEmit -p .`가 통과해야 한다.
  ```bash
  git add src/game/swordMotion src/game/dev.ts && git commit -m "Spike: swordsman combo-1 strike pose via pixel rig"
  ```
  **승인 전에는 Task 2로 가지 않는다.**

---

### Task 2: 시간 기준 칸 선택과 게임 연결 (칸은 1단 하나로 먼저)

**Files:** Modify `src/game/player2d.ts` (`PlayerAction`, `animate()`, `play()`), `src/game/combat/index.ts:63-66`, `src/game/bootScene.ts`, `src/game/swordMotion/index.ts`.

**Interfaces:**
- Produces: `swordFrameAt(step: number, t: number): number` (경과 시간 `t`초 → 칸 번호. 칸 목록 `[{at: 0, frame: 0}, ...]`에서 `at <= t`인 마지막 칸), `swordTexKey(step: number): string` (`sword-combo-${step}`), `SWORD_ORIGIN_X`.

- [ ] **Step 1: `PlayerAction`에 `step?: number` 추가, `combat/index.ts`에서 저장.**
  ```ts
  // combat/index.ts, 평타 else 분기
  const [dur, hits] = SLASH_TIMING[n - 1];
  p.startAction('slash', dur, hits);
  p.action!.step = n;
  ```
- [ ] **Step 2: `animate()`에 검 평타 분기 추가.** 기존 `else play('hero-attack', a)` 앞에:
  ```ts
  else if (a.kind === 'slash' && a.step && this.weapon.def.type === 'sword' && this.grounded) {
    const key = swordTexKey(a.step);
    s.anims.stop();
    s.setTexture(key, swordFrameAt(a.step, a.t));
    this.posed = true;
    posed = true;
  }
  ```
  `animate()` 위쪽에 `let posed = false;`를 두고, 아래 기준점 계산에서 `posed`이면 `ox = SWORD_ORIGIN_X`를 쓴다 (`baseAnimKey(currentAnim)`을 건너뜀).
- [ ] **Step 3: 포즈에서 돌아올 때 멈춤 방지.** `private posed = false;`를 추가하고 `play()` 맨 앞에서 `const stale = this.posed; this.posed = false;`, 두 조건 모두에 `|| stale`을 붙인다 (직전 프레임이 포즈면 같은 키라도 다시 재생). 포즈 분기에서만 `this.posed = true`.
- [ ] **Step 4: `createSwordMotion(this)`를 `bootScene.ts`의 `createClassSprites(this)` 다음에 호출.**
- [ ] **Step 5: `npx tsc --noEmit -p .` 통과, 브라우저에서 수련장 허수아비를 1단으로 쳐서 확인.** 탭이 가려지면 프레임이 멈추므로 메모리의 브라우저 테스트 요령(`g.step`, `getDelta` 패치)을 쓴다. 타격 시점(0.11초)에 칸이 타격 칸인지 `s.frame.name`으로 확인. 도(dao)로 바꿔 평타를 쳐서 기존 시트를 쓰는지도 확인.
- [ ] **Step 6: 커밋.** `git commit -m "Drive swordsman slash frames from action time"`

---

### Task 3: 평타 1~5단 포즈 모두 찍기

**Files:** Modify `src/game/swordMotion/poses.ts`, 필요하면 `rig.ts`.

설계서의 표(단·몸동작·칸 수)를 따른다. 칸마다 시작 시각 `at`은 `SLASH_TIMING`에 맞춘다: 타격 칸의 `at`이 해당 `hits[i]` 직전(0.02초 이내)이다.

| 단 | 칸 `at` (초) — 타격 칸에 ★ |
|---|---|
| 1 | 0, 0.05, 0.09★(0.11), 0.17, 0.25 |
| 2 | 0, 0.05, 0.09★(0.11), 0.17, 0.25 |
| 3 | 0, 0.04, 0.07★(0.09), 0.14, 0.19★(0.21), 0.28 |
| 4 | 0, 0.06, 0.12★(0.15), 0.2, 0.28, 0.36 |
| 5 | 0, 0.04, 0.08★(0.10), 0.14, 0.2★(0.23), 0.28, 0.35★(0.38), 0.45, 0.53 |

- [ ] **Step 1~5: 단마다 칸을 찍고, 각 단을 `swordSheet(n)`으로 뽑아 6배 비교표를 만들어 눈으로 확인.** 포즈 수치는 그림을 보며 정하므로 이 문서에 미리 적지 않는다. 한 단이 끝날 때마다 `npx tsc --noEmit -p .`와 커밋.
- [ ] **Step 6: 이질감 점검.** 대기·달리기 칸과 평타 5단을 한 장에 놓고, 외곽선 굵기·음영·색이 어긋난 곳을 고친다.
- [ ] **Step 7: 커밋.** `git commit -m "Paint swordsman combo 1-5 poses"`

---

### Task 4: 이펙트 정렬, 검증, PR

**Files:** Modify `src/game/combat/basic.ts`(필요한 좌표만).

- [ ] **Step 1: 타격 칸에서 이펙트가 칼 끝에서 나오는지 확인.** 1~5단마다 타격 시점의 스크린샷을 `g.step`으로 찍어, 이펙트 시작점(`p.x + f * r(18)`, `p.y - 2` 등)이 칼의 위치와 어긋나면 이 좌표를 맞춘다. 판정(`box`)·이동량은 바꾸지 않는다.
- [ ] **Step 2: 회귀 확인.** 도 평타, 공중·웅크림 평타, 검 스킬(회전베기 등), 궁극기 시전이 전과 같은 시트를 쓰는지 확인. 포즈 후 대기·달리기로 돌아올 때 멈추지 않는지 확인.
- [ ] **Step 3: 테스트 탭 닫기, 세이브 복구 확인** (메모리의 테스트 요령).
- [ ] **Step 4: `npm run build`, PR 생성.** `docs/ROADMAP.md`에 한 줄 추가. 본문은 `--body-file`로. 보고에 **확인한 것 / 확인 못 한 것(손맛)**을 나눠 적는다. 머지는 사용자가 말할 때만.

## Self-Review

- 스펙 커버: 범위(평타만) Task 3, 방법 A Task 1, 시간 기준 칸 Task 2, 이펙트 정렬 Task 4, 검증 Task 2·4, 도·공중·웅크림 보존 Task 2·4. 갭 없음.
- 포즈 수치와 조각 좌표는 일부러 비워 두었다. 둘 다 그림을 보며 정하는 산출물이고, 얻는 방법(Task 1 Step 1, Task 3 Step 1~5)을 적었다.
- 이름 일관성: `SwordPose`, `swordFrameAt`, `swordTexKey`, `SWORD_ORIGIN_X`, `PlayerAction.step`, `posed`를 전 Task에서 같게 썼다.
