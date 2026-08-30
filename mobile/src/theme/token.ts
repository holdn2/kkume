// 꾸메 디자인 토큰 · 다크 전용 · 팔레트 A(보라 + 청록)
// 명세는 docs/discussions/005. 대비율은 WCAG 2.1 상대 휘도 공식으로 실측했다.

// ─── 1층: 원시값. hex는 여기에만 존재한다 ───────────────────────
const palette = {
  ink: { 950: '#07060E', 900: '#0B0A14', 800: '#14121F', 700: '#1E1B2E', 600: '#2A2640', 500: '#2B2740' },
  violet: { 400: '#8B7CF6', 300: '#A48BFF' },
  teal: { 300: '#5EEAD4' },
  amber: { 400: '#FBBF24' },
  rose: { 400: '#FB7185' },
  fg: { 100: '#E8E4F0', 200: '#A9A3BF', 300: '#8079A0', 400: '#565064' },
} as const;

// ─── 2층: 역할. 화면에서는 이것만 쓴다 ──────────────────────────
export const c = {
  // 배경 (아래로 갈수록 위에 올라온다)
  night: palette.ink[950], // RM-1 전용. 앱에서 가장 어두운 화면
  bg: palette.ink[900], // 모든 탭 화면
  surface: palette.ink[800], // 시트 · 보조 카드
  card: palette.ink[700], // 꿈 카드 · 게시글 카드
  field: palette.ink[600], // 입력창 · 비활성 버튼
  line: palette.ink[500], // 경계선

  // 전경
  fg: palette.fg[100], // 본문
  fgMuted: palette.fg[200], // 보조 · 캡션
  fgFaint: palette.fg[300], // 메타 정보
  // 비활성 전용. WCAG 대비 요구가 면제되므로 배경 대비(2.55:1)보다
  // fgFaint와의 구분(1.89:1)을 우선한다 — 처음 값 #6E6889는 fgFaint와
  // 1.29:1이라 실기기에서 둘이 같아 보였다.
  fgDisabled: palette.fg[400],

  // 역할색
  action: palette.violet[400], // 주요 액션 · 선택 상태 · 브랜드
  actionFg: palette.ink[900], // action 배경 위의 전경색 — 흰색은 3.33:1로 부족하다
  running: palette.teal[300], // "진행 중"에만 — 녹음 · 생성 · 미확인
  runningFg: palette.ink[950],
  warning: palette.amber[400], // 오프라인 · 동기화 대기 · 확인 필요
  danger: palette.rose[400], // 삭제 · 신고 · 계정 삭제
} as const;

// ─── 간격 · 형태 ────────────────────────────────────────────────
export const sp = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const r = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

// 터치 타깃 — 새벽에는 손이 정확하지 않다
export const hit = { min: 48, base: 56, stop: 80 } as const;

// ─── 타이포: 크기와 행간을 짝으로 ───────────────────────────────
export const type = {
  display: { fontSize: 32, lineHeight: 40 }, // 녹음 타이머
  title: { fontSize: 24, lineHeight: 32 }, // 화면 제목
  heading: { fontSize: 20, lineHeight: 28 }, // 섹션 · 꿈 제목
  body: { fontSize: 16, lineHeight: 26 }, // 본문 — 꿈 텍스트는 행간을 넉넉히
  label: { fontSize: 15, lineHeight: 22 }, // 버튼 · 탭
  caption: { fontSize: 13, lineHeight: 18 }, // 날짜 · 메타
} as const;

// Pretendard는 굵기별 파일이 따로 있다. fontWeight로 굵기를 지정하면
// Android에서 가짜 볼드로 뭉개지므로, fontFamily를 굵기로 매핑하고
// fontWeight는 'normal'로 고정한다. AppText가 그 규칙을 강제한다.
export const font = {
  regular: 'Pretendard_400',
  medium: 'Pretendard_500',
  semibold: 'Pretendard_600',
  bold: 'Pretendard_700',
} as const;

// ─── 모션 ───────────────────────────────────────────────────────
export const dur = {
  none: 0, // RM-1 — 새벽의 대기 시간은 곧 이탈이다
  fast: 150,
  base: 200,
} as const;

export type Color = keyof typeof c;
export type TypeScale = keyof typeof type;
export type Weight = keyof typeof font;
