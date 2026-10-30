# 파도막이 (Breakwater)

웹 브라우저에서 돌아가는 2D 픽셀 아트 횡스크롤 액션 RPG. 몰려오는 몬스터를 검·도·활·총·스태프로 막아내는 싱글플레이 게임입니다. (3D 버전은 `v0.1-3d` 태그에 남아 있습니다.)

기획서: [docs/GDD.md](docs/GDD.md)

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입 검사 + 프로덕션 빌드 (dist/)
```

개발 서버에서는 `window.__bw`로 전투 시작·진행·몬스터 소환을 할 수 있습니다 (자동화 테스트용).

## 조작

키보드 전용입니다. 모든 키는 설정에서 바꿀 수 있습니다.

| 동작 | 키 |
|---|---|
| 이동 / 앉기 | ← → / ↓ |
| 점프 / 더블 점프 / 발판 아래로 | Space / 공중에서 Space / ↓ + Space |
| 기본 공격 | R |
| 강화 공격 (누르고 있다가 놓기) | T |
| 구르기 / 가드 (근접 무기) | Shift / C |
| 직업 교체 (장착한 두 무기) | Tab |
| 스킬 슬롯 1~8 | Q W E A S D F G |
| 체력·마나 포션 | Z / X |
| NPC와 대화 (마을) | ↑ |
| 메뉴 · 일시정지 | Esc |
| 개발자 모드 | ` (숫자 1 왼쪽) |

## 개발자 모드

` 키로 엽니다. 무적·마나 무한·쿨타임 없음·한 방 처치, 피해·몬스터 체력 배율, 레벨·골드·포인트, 모든 무기·장비·스킬 지급, 최대 강화, 재료·포션, 모든 페이즈 열기, 전투 중 몬스터 소환·전부 처치·즉시 클리어를 할 수 있습니다. 치트 설정은 새로고침하면 초기화됩니다.

## 구조

```
src/
  core/   입력(키맵), 저장
  data/   무기·스킬·몬스터·재료·페이즈 데이터
  game/   Phaser 씬(부트·마을·전투), 플레이어, 몬스터 AI, 전투 로직, 맵, 이펙트, 스탯 공식
  ui/     HUD, 마을 화면
```

## 에셋 출처

픽셀 아트는 [ansimuz (Luis Zuno)](https://ansimuz.itch.io/)의 GothicVania 팩(CC0)을 사용합니다.

- GothicVania Cemetery, Church, Town, Patreon Collection — [OpenGameArt](https://opengameart.org/users/ansimuz)

라이선스 원문은 `public/assets2d/LICENSE-GothicVania.txt`에 있습니다.
