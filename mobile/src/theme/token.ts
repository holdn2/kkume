/**
 * 꾸메 디자인 토큰.
 *
 * 원칙 하나로 요약된다 — **UI는 무채색이고, 색이 보이면 그것은 상태다.**
 * 근거와 레퍼런스 매핑은 docs/discussions/014.
 */

// ── 원색 ──────────────────────────────────────────────────────────
// 깊이는 불투명 회색 단계로만 만든다. 반투명 tint를 겹치는 방식은 쓰지 않는다.
// 최소 밝기에서 10~13% 알파는 배경과 구분되지 않는다.
const gray = {
  0: '#000000',
  950: '#0B0B0E',
  900: '#16161A',
  800: '#212127',
  700: '#2E2E36',
  400: '#46464E',
  300: '#6B6B75',
  200: '#9A9AA3',
  50: '#FAFAFA',
} as const;

// 상태색은 전경/배경이 짝으로 다닌다. 배경도 불투명이다.
// 대비는 전부 bg(#0B0B0E) 위에서 잰 값이고 짝 배경 위에서도 AA를 넘는다.
const state = {
  running: '#4FD6C1', // 10.97:1
  runningBg: '#0E3B36', // 그 위에서 6.90:1
  warning: '#E8A33D', // 9.11:1
  warningBg: '#3B2C10', // 6.27:1
  danger: '#F0687A', // 6.52:1
  dangerBg: '#3D1219', // 5.37:1
} as const;

// ── 역할색 ────────────────────────────────────────────────────────
export const c = {
  // 배경
  night: gray[0], // RM-1(새벽 기록) 전용. 순수 검정
  bg: gray[950], // 앱 기본
  surface: gray[900], // 카드 · 입력 · 시트
  raised: gray[800], // surface 위에 올라가는 것 (세그먼트 선택 등)
  line: gray[700], // 경계가 정말 필요한 곳에만

  // 전경
  fg: gray[50],
  fgMuted: gray[200], // 7.04:1 — 보조 설명
  fgFaint: gray[300], // 3.73:1 — 시각 · 메타
  fgDisabled: gray[400], // 2.10:1 — 꺼진 것

  // 주 액션은 흰색이다.
  // 새벽 최소 밝기에서 채도 높은 색은 눈을 때리고, 흰색은 대비가 가장 높으면서 그러지 않는다.
  action: gray[50],
  actionFg: gray[950],

  running: state.running,
  runningBg: state.runningBg,
  warning: state.warning,
  warningBg: state.warningBg,
  danger: state.danger,
  dangerBg: state.dangerBg,
} as const;

/** 아바타 배경. UI가 무채색이라 색이 사람을 구분하는 유일한 자리다 */
// 5번은 처음 #5A3A55였다. 2번(#4A3A6B)과 색상각이 49도밖에 안 떨어져
// 최소 밝기에서 같아 보였다. 장미 쪽으로 밀고 한 단계 밝혀 63도로 벌렸다.
export const avatarBg = ['#39496B', '#4A3A6B', '#2F5A52', '#6B4738', '#6B3757'] as const;

// ── 치수 ──────────────────────────────────────────────────────────
export const sp = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;

/**
 * 반경은 크기가 아니라 **역할**로 고른다. 이름에 sm/md/lg를 쓰면
 * 같은 화면에서 서로 관계없는 값이 섞여 언어가 무너진다.
 *
 * 알약(chip)은 작은 것에만 쓴다. 큰 버튼을 알약으로 만들면 그 순간 흔한 화면이 된다.
 */
export const r = {
  chip: 999, // 뱃지 · 태그 · 세그먼트
  control: 12, // 버튼 · 입력
  surface: 16, // 카드
  sheet: 20, // 바텀시트 상단
} as const;

/** 새벽에 손이 정확하지 않다. 그래서 48이 아니라 56이 기본이다 */
export const hit = { min: 48, base: 56, stop: 80 } as const;

/** 눌림 표현은 하나뿐이다. 컴포넌트마다 다른 값을 쓰면 그게 티가 난다 */
export const press = 0.6;

// ── 타이포 ────────────────────────────────────────────────────────
// 큰 글자일수록 자간을 좁힌다. 제목이 화면을 이끄는 구조라 여기가 인상을 정한다.
export const type = {
  display: { fontSize: 32, lineHeight: 42, letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 34, letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 26, letterSpacing: -0.1 },
  label: { fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  caption: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
} as const;

// Pretendard는 굵기별 파일이 따로 있다. fontWeight로 굵기를 지정하면
// Android가 가짜 볼드를 씌워 자소가 뭉개진다. AppText가 이걸 대신 매핑한다.
export const font = {
  regular: 'Pretendard_400',
  medium: 'Pretendard_500',
  semibold: 'Pretendard_600',
  bold: 'Pretendard_700',
} as const;

export const dur = { none: 0, fast: 150, base: 200 } as const;

export type Color = keyof typeof c;
export type TypeScale = keyof typeof type;
export type Weight = keyof typeof font;
