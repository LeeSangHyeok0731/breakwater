# 마왕 레이드 PR 1 (레이드 틀) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 군단장 기지의 마왕성 문으로 들어가 5무기·3벌 방어구로 싸우고, 봉인·약점·봉인 해제 기믹이 돌아가는 레이드 전투를 임시 보스로 끝까지 할 수 있게 한다.

**Architecture:** 데이터·규칙은 `src/data/raid.ts`, 전투 진행은 `src/game/raid/raidFight.ts`(BattleScene이 가진 진행자), 임시 보스 행동은 `src/game/raid/demonKing.ts`. BattleScene은 `raid` 모드에서 진행자에 피해 배율·결정 판정을 물어본다. 창은 `src/ui/raidPanel.ts`.

**Tech Stack:** Phaser 3.80, TypeScript, Vite. 테스트 프레임워크 없음 → `npm run typecheck` + 브라우저 확인 (`window.__bw`).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-11-03-demon-king-raid-design.md`.
- 봉인 단계 10% → 25% → 50% → 100%, 힘·민첩·마력에만, 총 평타는 비율을 곱한다.
- 약점 ×3, 다른 무기 ×0.3. 결정 3개, 결정당 8칸, 15초. 그로기 5초(받는 피해 200%). 심판 예고 2.2초. 제한 6분.
- 난이도 노멀(체력 1, 공격 1, 속도 1) / 하드(2.5, 1.6, 0.8).
- 한국어 UI 문구. 마을 장비는 바뀌지 않는다.
- 커밋 끝 줄: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: 데이터와 세이브

**Files:** Create `src/data/raid.ts`; Modify `src/core/save.ts`, `src/game/stats.ts`, `src/data/monsters.ts`, `src/data/items.ts`

**Produces:**
- `RAID_UNLOCK_PHASE = '10-5'`, `SEAL_STAGES = [0.1, 0.25, 0.5, 1]`, `WEAK_MUL = 3`, `OFF_MUL = 0.3`, `RAID_PHASE_AT = [0.75, 0.5, 0.25]`, `CRYSTAL_COUNT = 3`, `CRYSTAL_HITS = 8`, `CRYSTAL_TIME = 15`, `RAID_GROGGY = 5`, `RAID_JUDGE_WARN = 2.2`, `RAID_TIME = 360`, `RAID_ENRAGE_PACE = 0.8`.
- `type RaidDifficulty = 'normal' | 'hard'`, `RAID_DIFFICULTY: Record<RaidDifficulty, { name; hpMul; dmgMul; pace; essence: [number, number] }>`.
- `interface RaidLoadout { weapons: Partial<Record<WeaponType, string>>; armor: Record<SetLine, Partial<Record<GearSlot, string>>> }`.
- `interface RaidRun { difficulty: RaidDifficulty; weapons: string[] /* uid, 검→지팡이 순 */; armor: RaidLoadout['armor'] }`.
- `raidLoadout(save): RaidLoadout` (저장된 값 검증 + 빈 칸 기본값), `raidWeaponUids(save, loadout): string[]`, `raidGearBonus(save, armor): Required<GearStats>`, `raidPhase(run): PhaseDef`, `raidReward(run): Record<string, number>`.
- `SaveData.raid: { loadout: RaidLoadout | null; clears: number }`.
- `stats.baseStatsWith(save, gear)`, `stats.totalStatsWith(save, gear)`; `baseStats`/`totalStats`는 이것을 부른다.
- 몬스터 `demon_lord_raid` ('종언의 마왕 아스타로트', boss), `seal_crystal` ('봉인의 결정').
- 재료 `demon_essence` ('마왕의 정수').

- [ ] 작성 → `npm run typecheck` 통과 → 커밋.

### Task 2: 전투 진행자와 임시 보스

**Files:** Create `src/game/raid/raidFight.ts`, `src/game/raid/demonKing.ts`, `src/game/raid/raidArt.ts`; Modify `src/game/legion/darklord.ts` (구슬·초승달·기둥 export), `src/game/monster2d.ts` (LOOKS·BEHAVIORS)

**Consumes:** Task 1 상수, `BattleScene` 공개 API (`spawnMonster`, `announce`, `addTelegraph`, `executePlayer`, `fx`, `player`, `level`).

**Produces:**
- `class RaidFight { mode: 'fight' | 'rise' | 'seal' | 'judge'; stage: number; weak: WeaponType; sealMul: number; damageMul(type): number; hitCrystal(m, type): void; update(dt): void; spawnBoss(): Monster; note(): string; time: number; pace(): number; destroy() }`.
- `demonKingRaid: Behavior` — `b.raid.mode === 'fight'`일 때만 패턴, 나머지는 가운데에 떠 있다.

- [ ] 작성 → typecheck → 커밋.

### Task 3: BattleScene 연결

**Files:** Modify `src/game/battleScene.ts`, `src/game/context.ts`, `src/main.ts`, `src/ui/hud.ts`

- `init`의 `raid?: RaidRun` → `this.raid = new RaidFight(...)`을 create에서.
- 무기 = `run.weapons`, 장비 = `raidGearBonus`, 스탯 = `totalStatsWith` 후 봉인은 `damageStats()`로 피해 계산에만.
- `hitMonster`: 결정이면 `raid.hitCrystal` 후 0; 보스면 `raid.damageMul(type)`; 총 평타는 `sealMul`.
- `legionPace`가 레이드에서는 `raid.pace()`.
- 끝: `outcome.raid = run`, 보상 `raidReward`, 기지로 복귀. 결과 창 제목 '마왕 토벌 성공/실패'.
- HUD: legion 블록을 쓰고 status = `raid.note()`.
- 개발 훅 `__bw.raid(difficulty?)`.

- [ ] 작성 → typecheck → 커밋.

### Task 4: 마왕성 문과 레이드 창

**Files:** Modify `src/game/context.ts` (StationId `raid`), `src/game/townScene.ts`, `src/main.ts` (STATION_TABS), `src/ui/village.ts` (탭 `raid`), Create `src/ui/raidPanel.ts`

- 기지 x 1080에 문. 10-5 전에는 잠긴 안내.
- 창: 난이도 2버튼, 무기 5칸(종류별, 끌어다 놓기·더블클릭), 방어구 3줄×4칸, 출격.

- [ ] 작성 → typecheck → 커밋.

### Task 5: 브라우저 확인

- 개발 세이브 백업 → `__bw.raid('normal')` → 봉인 10% 피해, 약점 배율, 75% 결정, 맞는 무기만 깎임, 성공 → 25%·그로기, 실패 → 심판, 처치 → 보상·기지. 창 열어 보기. 세이브 복구, 탭 닫기.
- PR 생성.
