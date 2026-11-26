// 도객 동작. 검사와 같은 관절 장치(`poses.ts`)를 쓰되, 도는 낮은 자세에서 한 방에 베고 달을 그리는 큰 호가 중심이다.
// 평타는 검사처럼 앞 단의 마지막 자세가 다음 단의 첫 자세다. 스킬·궁극기는 타격 시점이 정의에 고정돼 있어 시간 배율 없이 쓴다.

import { buildFrames, K0, type KeySpec, type P, type SwordPose } from './poses';

export type DaoSkill = 'crescent' | 'skyfall' | 'hamstring' | 'rage' | 'iai' | 'moonstorm' | 'heavenfall' | 'bloodcharge' | 'bloodstrike';

const IDLE: P = { c: [40, 35], yaw: 10, rf: [44, 62], lf: [34, 62], rh: [47, 41], az: 0, el: -25 };

/** 평타 단마다 [동작 시간, 타격 시점들] */
export const DAO_TIMING: [number, number[]][] = [
  [0.36, [0.15]],
  [0.36, [0.15]],
  [0.46, [0.13, 0.26]],
  [0.5, [0.22]],
  [0.74, [0.14, 0.3, 0.48]],
];

/** 스킬·궁극기마다 [동작 시간, 타격 시점들] */
export const DAO_SKILL_TIMING: Record<DaoSkill, [number, number[]]> = {
  crescent: [0.8, [0.12, 0.3, 0.52]],
  skyfall: [0.75, [0.12, 0.5]],
  hamstring: [0.62, [0.1, 0.24, 0.38]],
  rage: [0.6, []],
  iai: [0.8, [0.14, 0.3, 0.36, 0.42, 0.5]],
  // 궁극기: 타격은 이펙트가 정한다
  moonstorm: [1.05, []],
  heavenfall: [0.95, []],
  bloodcharge: [0.6, []],
  bloodstrike: [0.34, []],
};

/** 되풀이하는 동작: 이 시각부터 끝까지를 계속 돈다 */
export const DAO_LOOPS: Partial<Record<DaoSkill, number>> = { bloodcharge: 0.12, bloodstrike: 0.06 };
/** 공중에서도 보이는 동작 */
export const DAO_AIRBORNE: ReadonlySet<DaoSkill> = new Set(['skyfall', 'heavenfall']);

// ───────── 평타: 각 단이 끝나는 자세는 다음 단의 시작과 같다 ─────────
const D1: P = { c: [46, 37], yaw: -20, lean: 3, rf: [40, 62], lf: [56, 62], rh: [55, 32], az: -10, el: 62, len: 32 };
const D2: P = { c: [44, 38], yaw: 0, lean: 2, rf: [42, 62], lf: [54, 62], rh: [52, 44], az: 0, el: -35 };
const D3: P = { c: [48, 36], yaw: -10, lean: 2, rf: [42, 62], lf: [57, 62], rh: [56, 32], az: 0, el: 50 };
const D4: P = { c: [50, 37], yaw: -20, lean: 3, rf: [46, 62], lf: [64, 62], rh: [60, 44], az: -30, el: -25 };

// 1타: 낮게 웅크려 파고들며 아래에서 위로 올려 벤다
const c1 = buildFrames(
  [
    K0(0, IDLE),
    K0(0.08, { c: [36, 39], yaw: 30, hipDy: 2, rf: [43, 62], lf: [33, 62], rh: [36, 48], az: 0, el: -70 }, 'io'),
    K0(0.15, { c: [48, 37], yaw: -20, lean: 4, rf: [40, 62], lf: [56, 62], rh: [56, 34], az: -10, el: 40, len: 32 }, 'in', true),
    K0(0.22, { c: [47, 37], yaw: -20, lean: 3, rf: [40, 62], lf: [56, 62], rh: [55, 31], az: -10, el: 62, len: 32 }, 'out'),
    K0(0.36, D1, 'io'),
  ],
  0.36,
);

// 2타: 칼을 뒤로 넘겨 돌려 쥐고 제자리에서 내려 벤다
const c2 = buildFrames(
  [
    K0(0, D1),
    K0(0.07, { c: [45, 37], yaw: -5, rf: [40, 62], lf: [56, 62], rh: [50, 24], az: 0, el: 130 }, 'io'),
    K0(0.15, { c: [47, 39], yaw: -25, lean: 5, hipDy: 1, rf: [40, 62], lf: [57, 62], rh: [56, 43], az: 0, el: -50, len: 32 }, 'in', true),
    K0(0.22, { c: [47, 39], yaw: -25, lean: 5, hipDy: 1, rf: [40, 62], lf: [57, 62], rh: [57, 45], az: 0, el: -58, len: 32 }, 'out'),
    K0(0.36, D2, 'io'),
  ],
  0.36,
);

// 3타: 엇갈려 두 번 (내려 베고, 낮게 훑어 올려 벤다)
const c3 = buildFrames(
  [
    K0(0, D2),
    K0(0.06, { c: [42, 36], yaw: 20, rf: [42, 62], lf: [54, 62], rh: [38, 28], az: 0, el: 120 }, 'io'),
    K0(0.13, { c: [48, 38], yaw: -20, lean: 3, rf: [41, 62], lf: [56, 62], rh: [56, 42], az: 0, el: -40, len: 32 }, 'in', true),
    K0(0.19, { c: [47, 40], yaw: -10, hipDy: 2, rf: [41, 62], lf: [56, 62], rh: [50, 50], az: 0, el: -75 }, 'io'),
    K0(0.26, { c: [50, 36], yaw: -15, lean: 4, rf: [42, 62], lf: [57, 62], rh: [58, 30], az: 0, el: 50, len: 32 }, 'in', true),
    K0(0.34, { c: [50, 36], yaw: -15, lean: 4, rf: [42, 62], lf: [57, 62], rh: [58, 28], az: 0, el: 60, len: 32 }, 'out'),
    K0(0.46, D3, 'io'),
  ],
  0.46,
);

// 4타: 칼을 뒤로 감았다가 한 걸음 크게 내디디며 넓게 쓸어 벤다
const c4 = buildFrames(
  [
    K0(0, D3),
    K0(0.14, { c: [40, 38], yaw: 60, lean: -3, rf: [40, 62], lf: [50, 62], rh: [28, 38], az: 170, el: 5 }, 'io'),
    K0(0.22, { c: [56, 37], yaw: -30, lean: 6, rf: [44, 62], lf: [68, 62], rh: [64, 40], az: -20, el: -8, len: 34 }, 'in', true),
    K0(0.32, { c: [57, 37], yaw: -30, lean: 6, rf: [44, 62], lf: [68, 62], rh: [66, 42], az: -26, el: -14, len: 34 }, 'out'),
    K0(0.5, D4, 'io'),
  ],
  0.5,
);

// 5타: 몸을 감았다가 한 바퀴 반 돌며 세 번 (앞 · 뒤 · 앞, 마지막이 가장 크다)
const c5 = buildFrames(
  [
    K0(0, D4),
    K0(0.08, { c: [52, 38], yaw: -100, lean: -2, hipDy: 2, rf: [46, 62], lf: [64, 62], rh: [38, 40], az: -180, el: 0, len: 31 }, 'io'),
    K0(0.14, { c: [52, 38], yaw: -10, rf: [46, 62], lf: [64, 62], rh: [62, 40], az: 0, el: -3, len: 32 }, 'in', true),
    K0(0.3, { c: [52, 38], yaw: 170, rf: [46, 62], lf: [64, 62], rh: [34, 40], az: 180, el: -3, len: 32 }, 'lin', true),
    K0(0.48, { c: [54, 37], yaw: 350, lean: 4, rf: [46, 62], lf: [66, 62], rh: [65, 40], az: 360, el: -6, len: 34 }, 'lin', true),
    K0(0.58, { c: [55, 37], yaw: 360, lean: 4, rf: [46, 62], lf: [66, 62], rh: [66, 41], az: 366, el: -10, len: 34 }, 'out'),
    K0(0.74, { ...IDLE, yaw: 370, az: 360 }, 'io'),
  ],
  0.74,
);

export const DAO_COMBOS: SwordPose[][] = [c1, c2, c3, c4, c5];

// ───────── 스킬 ─────────

// 초승달 베기(만월): 앞을 크게 베고, 몸을 돌려 뒤를 베고, 머리 위로 들어 한 바퀴 돌려 달을 그리며 내려 벤다
const crescent = buildFrames(
  [
    K0(0, IDLE),
    K0(0.08, { c: [38, 37], yaw: -80, hipDy: 1, rf: [45, 62], lf: [33, 62], rh: [34, 38], az: -180, el: 0 }, 'io'),
    K0(0.12, { c: [42, 37], yaw: -10, lean: 3, rf: [45, 62], lf: [33, 62], rh: [58, 40], az: 0, el: -3, len: 33 }, 'in', true),
    K0(0.3, { c: [42, 37], yaw: 170, lean: 2, rf: [45, 62], lf: [33, 62], rh: [26, 40], az: 180, el: -3, len: 33 }, 'io', true),
    K0(0.42, { c: [41, 35], yaw: 280, rf: [45, 62], lf: [33, 62], rh: [40, 30], az: 270, el: 50, len: 31 }, 'io'),
    K0(0.52, { c: [46, 38], yaw: 370, lean: 5, rf: [44, 62], lf: [58, 62], rh: [60, 42], az: 360, el: -25, len: 34 }, 'in', true),
    K0(0.62, { c: [47, 38], yaw: 370, lean: 5, rf: [44, 62], lf: [58, 62], rh: [61, 44], az: 362, el: -30, len: 34 }, 'out'),
    K0(0.8, { ...IDLE, yaw: 370, az: 360 }, 'io'),
  ],
  0.8,
);

// 낙월: 웅크렸다 뛰어오르며 올려 베고, 높이서 칼을 뒤로 젖혔다가 달이 떨어지듯 내려찍는다
const skyfall = buildFrames(
  [
    K0(0, IDLE),
    K0(0.07, { c: [40, 41], yaw: 10, lean: 3, hipDy: 3, rf: [46, 62], lf: [34, 62], rh: [38, 50], az: 0, el: -90 }, 'io'),
    K0(0.12, { c: [44, 31], yaw: 5, lean: -3, rf: [46, 58], lf: [38, 56], rh: [54, 24], az: 0, el: 55, len: 32 }, 'in', true),
    K0(0.3, { c: [44, 29], yaw: 20, lean: -3, rf: [47, 54], lf: [39, 52], rh: [50, 24], az: 0, el: 50 }, 'out'),
    K0(0.4, { c: [43, 30], yaw: 20, lean: -5, rf: [47, 54], lf: [39, 52], rh: [40, 30], az: 0, el: 110 }, 'io'),
    K0(0.5, { c: [48, 38], yaw: -15, lean: 6, rf: [50, 62], lf: [44, 62], rh: [56, 50], az: 0, el: -60, len: 32 }, 'in', true),
    K0(0.58, { c: [48, 41], yaw: -15, lean: 6, hipDy: 4, rf: [50, 62], lf: [44, 62], rh: [57, 52], az: 0, el: -64, len: 32 }, 'out'),
    K0(0.75, IDLE, 'io'),
  ],
  0.75,
);

// 발목 베기(연환각): 바닥을 쓸 듯 낮게 세 번, 한 발씩 파고든다
const hamstring = buildFrames(
  [
    K0(0, IDLE),
    K0(0.06, { c: [40, 42], yaw: 30, hipDy: 4, rf: [44, 62], lf: [34, 62], rh: [34, 50], az: 165, el: -15 }, 'io'),
    K0(0.1, { c: [46, 43], yaw: -20, lean: 4, hipDy: 5, rf: [40, 62], lf: [56, 62], rh: [58, 52], az: -15, el: -12, len: 32 }, 'in', true),
    K0(0.16, { c: [45, 43], yaw: 20, hipDy: 5, rf: [40, 62], lf: [56, 62], rh: [36, 51], az: 160, el: -12 }, 'io'),
    K0(0.24, { c: [50, 43], yaw: -20, lean: 4, hipDy: 5, rf: [58, 62], lf: [46, 62], rh: [62, 52], az: -15, el: -12, len: 32 }, 'in', true),
    K0(0.3, { c: [49, 43], yaw: 20, hipDy: 5, rf: [58, 62], lf: [46, 62], rh: [40, 51], az: 160, el: -12 }, 'io'),
    K0(0.38, { c: [54, 42], yaw: -25, lean: 5, hipDy: 5, rf: [50, 62], lf: [66, 62], rh: [66, 50], az: -20, el: -8, len: 34 }, 'in', true),
    K0(0.46, { c: [54, 42], yaw: -25, lean: 5, hipDy: 5, rf: [50, 62], lf: [66, 62], rh: [67, 51], az: -22, el: -10, len: 34 }, 'out'),
    K0(0.62, IDLE, 'io'),
  ],
  0.62,
);

// 투혼: 웅크려 투기를 모았다가 앞으로 기울인 채 칼과 주먹을 내밀며 일어선다
const rage = buildFrames(
  [
    K0(0, IDLE),
    K0(0.1, { c: [40, 41], yaw: 20, lean: 3, hipDy: 3, rf: [46, 62], lf: [34, 62], rh: [38, 48], lh: [40, 46], az: 0, el: -70 }, 'io'),
    K0(0.2, { c: [43, 35], yaw: -5, lean: 6, rf: [50, 62], lf: [30, 62], rh: [57, 34], lh: [48, 32], az: 0, el: 25, len: 32 }, 'in'),
    K0(0.3, { c: [43, 36], yaw: -5, lean: 6, rf: [50, 62], lf: [30, 62], rh: [57, 35], lh: [48, 33], az: 0, el: 25, len: 32 }, 'io'),
    K0(0.4, { c: [43, 35], yaw: -5, lean: 6, rf: [50, 62], lf: [30, 62], rh: [57, 34], lh: [48, 32], az: 0, el: 25, len: 32 }, 'io'),
    K0(0.6, IDLE, 'io'),
  ],
  0.6,
);

// 발도: 허리를 낮추고 칼을 칼집째 뒤로 당겼다가, 번개처럼 앞으로 뽑아 베고, 잠시 버티다 칼을 거둔다
const iai = buildFrames(
  [
    K0(0, IDLE),
    K0(0.1, { c: [36, 42], yaw: 20, lean: 3, hipDy: 4, rf: [48, 62], lf: [28, 62], rh: [40, 46], lh: [34, 46], az: 0, el: 200 }, 'io'),
    K0(0.14, { c: [52, 40], yaw: -20, lean: 7, rf: [40, 62], lf: [66, 62], rh: [66, 42], az: 0, el: 356, len: 34 }, 'in', true),
    K0(0.5, { c: [52, 41], yaw: -20, lean: 7, rf: [40, 62], lf: [66, 62], rh: [66, 44], az: 0, el: 350, len: 34 }, 'out'),
    K0(0.64, { c: [48, 40], yaw: -10, lean: 4, rf: [42, 62], lf: [60, 62], rh: [44, 44], az: 0, el: 190 }, 'io'),
    K0(0.8, { ...IDLE, el: 335 }, 'io'),
  ],
  0.8,
);

// ───────── 궁극기 ─────────

// 월하 폭풍참: 앞·뒤로 쉬지 않고 돌며 크게 여섯 번
function moonstormKeys(): KeySpec[] {
  const keys: KeySpec[] = [
    K0(0, IDLE),
    K0(0.06, { c: [41, 38], yaw: -100, hipDy: 2, rf: [46, 62], lf: [32, 62], rh: [30, 40], az: -180, el: 0, len: 31 }, 'io'),
  ];
  for (let i = 0; i < 6; i++) {
    const front = i % 2 === 0;
    keys.push(
      K0(
        0.12 + i * 0.13,
        { c: [41, 38], yaw: i * 180 - 10, lean: 2, rf: [46, 62], lf: [32, 62], rh: front ? [57, 40] : [26, 40], az: i * 180, el: i % 4 >= 2 ? 12 : -8, len: 33 },
        i === 0 ? 'in' : 'lin',
        true,
      ),
    );
  }
  keys.push(K0(0.9, { c: [42, 37], yaw: 1000, rf: [45, 62], lf: [34, 62], rh: [52, 41], az: 1040, el: -10 }, 'out'));
  keys.push(K0(1.05, { ...IDLE, yaw: 1090, az: 1080 }, 'io'));
  return keys;
}
const moonstorm = buildFrames(moonstormKeys(), 1.05);

// 천붕: 땅을 박차 높이 솟아 칼을 하늘로 들어 올리고, 뒤로 젖혔다가 대지를 내려찍는다
const heavenfall = buildFrames(
  [
    K0(0, IDLE),
    K0(0.06, { c: [42, 33], yaw: 10, lean: -2, hipDy: -2, rf: [45, 58], lf: [38, 56], rh: [50, 24], az: 0, el: 60 }, 'in'),
    K0(0.2, { c: [44, 28], yaw: 20, lean: -4, rf: [47, 52], lf: [39, 50], rh: [48, 24], az: 0, el: 55 }, 'out'),
    K0(0.38, { c: [43, 29], yaw: 20, lean: -6, rf: [47, 52], lf: [39, 50], rh: [40, 30], az: 0, el: 105 }, 'io'),
    K0(0.46, { c: [48, 34], yaw: -15, lean: 6, rf: [50, 58], lf: [44, 58], rh: [56, 48], az: 0, el: -70, len: 32 }, 'in', true),
    K0(0.64, { c: [48, 41], yaw: -15, lean: 6, hipDy: 5, rf: [50, 62], lf: [44, 62], rh: [57, 52], az: 0, el: -64, len: 32 }, 'out'),
    K0(0.95, IDLE, 'io'),
  ],
  0.95,
);

// 혈월 발도: 모으는 동안은 허리를 낮추고 칼에 손을 얹고 떤다 (되풀이)
const bloodcharge = buildFrames(
  [
    K0(0, IDLE),
    K0(0.12, { c: [36, 42], yaw: 20, lean: 3, hipDy: 4, rf: [48, 62], lf: [28, 62], rh: [40, 46], lh: [34, 46], az: 0, el: 200 }, 'io'),
    K0(0.24, { c: [36, 43], yaw: 20, lean: 3, hipDy: 5, rf: [48, 62], lf: [28, 62], rh: [41, 47], lh: [34, 47], az: 0, el: 202 }, 'io'),
    K0(0.36, { c: [36, 42], yaw: 20, lean: 3, hipDy: 4, rf: [48, 62], lf: [28, 62], rh: [40, 46], lh: [34, 46], az: 0, el: 200 }, 'io'),
    K0(0.48, { c: [36, 43], yaw: 20, lean: 3, hipDy: 5, rf: [48, 62], lf: [28, 62], rh: [41, 47], lh: [34, 47], az: 0, el: 202 }, 'io'),
    K0(0.6, { c: [36, 42], yaw: 20, lean: 3, hipDy: 4, rf: [48, 62], lf: [28, 62], rh: [40, 46], lh: [34, 46], az: 0, el: 200 }, 'io'),
  ],
  0.6,
);

// 혈월 발도, 베는 동안: 몸은 제자리에서 위·아래로 쉬지 않고 난타한다 (되풀이)
const bloodstrike = buildFrames(
  [
    K0(0, { c: [48, 39], yaw: -10, lean: 5, rf: [42, 62], lf: [60, 62], rh: [58, 34], az: 0, el: 30, len: 34 }),
    K0(0.06, { c: [48, 39], yaw: -10, lean: 5, rf: [42, 62], lf: [60, 62], rh: [58, 34], az: 0, el: 30, len: 34 }, 'lin', true),
    K0(0.2, { c: [49, 40], yaw: -20, lean: 5, rf: [42, 62], lf: [60, 62], rh: [61, 46], az: 0, el: -35, len: 34 }, 'lin', true),
    K0(0.34, { c: [48, 39], yaw: -10, lean: 5, rf: [42, 62], lf: [60, 62], rh: [58, 34], az: 0, el: 30, len: 34 }, 'lin', true),
  ],
  0.34,
);

export const DAO_SKILL_MOTIONS: Record<DaoSkill, SwordPose[]> = { crescent, skyfall, hamstring, rage, iai, moonstorm, heavenfall, bloodcharge, bloodstrike };
