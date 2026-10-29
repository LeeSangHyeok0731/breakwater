# 파도막이 (Breakwater)

웹 브라우저에서 돌아가는 3인칭 3D 액션 RPG. 몰려오는 몬스터를 검·스태프 등 여러 무기로 막아내는 싱글플레이 게임입니다.

기획서: [docs/GDD.md](docs/GDD.md)

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입 검사 + 프로덕션 빌드 (dist/)
```

개발 서버에서 `?nolock`을 붙이면(`http://localhost:5173/?nolock`) 포인터 잠금 없이 플레이할 수 있습니다. 브라우저 자동화 테스트용입니다.

## 조작

| 동작 | 키 |
|---|---|
| 이동 / 시점 | WASD / 마우스 |
| 기본 공격 / 강화 공격 | 좌클릭 / 우클릭 |
| 점프 / 구르기 | Space / Shift |
| 가드 (근접 무기, 누르는 순간 패링) | C |
| 무기 교체 | Tab |
| 스킬 슬롯 1~8 | 1 2 3 4 Q E F G |
| 일시정지 | Esc |

## 구조

```
src/
  core/   입력(키맵), 저장
  data/   무기·스킬·몬스터·재료·페이즈 데이터
  game/   전투(battle), 플레이어, 몬스터 AI, 전투 로직, 모델, 이펙트, 스탯 공식
  ui/     HUD, 마을 화면
```
