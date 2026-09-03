/**
 * 이 페이지는 어느 나라의 것인가.
 *
 * 주소에서 읽는다. `import.meta.env.BASE_URL` 뒤에 오는 첫 칸이 나라다.
 *
 *   /trip-planner/          → null (나라 고르는 곳)
 *   /trip-planner/spain/    → 'spain'
 *   /trip-planner/spain/?x  → 'spain'
 *
 * 물음표 뒤(`?safe=1` 같은 문제 찾기 스위치)는 보지 않는다. 주소 칸만 본다.
 */
import { COUNTRIES, countryOf, type CountryDef } from './countries';

const base = import.meta.env.BASE_URL;

/** 주소에서 나라 칸을 떼어 낸다. 없으면 null. */
export function countrySlugFromPath(pathname = location.pathname): string | null {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  const first = rest.split('/').filter(Boolean)[0] ?? null;
  return first && COUNTRIES.some((c) => c.slug === first) ? first : null;
}

/** 이 페이지의 나라. 나라 고르는 곳이면 null. */
export function currentCountry(): CountryDef | null {
  return countryOf(countrySlugFromPath());
}

/** 그 나라의 주소. 링크와 '나라 바꾸기' 에 쓴다. */
export const countryHref = (slug: string): string => `${base}${slug}/`;

/** 나라 고르는 곳의 주소. */
export const homeHref = (): string => base;
