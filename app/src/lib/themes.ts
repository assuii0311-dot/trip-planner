import type { ThemeId } from '../types';

export const THEMES: { id: ThemeId; label: string; icon: string; hint: string }[] = [
  { id: 'history',   label: '역사·유적',     icon: '🏛️', hint: '성당, 궁전, 로마 유적, 옛 시가지' },
  { id: 'art',       label: '예술·박물관',   icon: '🎨', hint: '미술관, 박물관, 공연' },
  { id: 'landmark',  label: '랜드마크·건축', icon: '🗼', hint: '전망대, 상징 건축물, 광장' },
  { id: 'nature',    label: '자연경관',      icon: '🌿', hint: '공원, 해변, 전망 포인트, 정원' },
  { id: 'food',      label: '미식',          icon: '🍽️', hint: '식당, 타파스, 시장 먹거리, 카페' },
  { id: 'nightlife', label: '나이트라이프',  icon: '🍷', hint: '바, 플라멩코, 라이브 음악' },
  { id: 'activity',  label: '액티비티',      icon: '🚴', hint: '투어, 하이킹, 해양 스포츠' },
  { id: 'shopping',  label: '쇼핑·시장',     icon: '🛍️', hint: '재래시장, 공예품, 편집숍' },
];

export const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.id, t.label])) as Record<ThemeId, string>;
export const THEME_ICON = Object.fromEntries(THEMES.map((t) => [t.id, t.icon])) as Record<ThemeId, string>;
