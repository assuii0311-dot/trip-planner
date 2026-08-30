import type { City, Item } from '../types';
import type { RailTable } from './rail';
import { setRailTable } from './rail';

export interface CountryIndex {
  country: string;
  name: string;
  generatedAt: string;
  attribution: string[];
  macroRegions: { id: string; name: string; regions: string[] }[];
  cities: City[];
}

const base = import.meta.env.BASE_URL;
const cache = new Map<string, unknown>();

async function getJSON<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다: ${path}`);
  const data = (await res.json()) as T;
  cache.set(path, data);
  return data;
}

export const loadCountry = (country: string) => getJSON<CountryIndex>(`data/${country}.json`);

/**
 * 실제 철도 시간표(Renfe GTFS 에서 뽑은 것)를 받아 라우팅 엔진에 심는다.
 *
 * 없어도 앱은 돈다 — 그때는 운행 패턴으로 추정한다. 그래서 실패해도
 * 오류로 만들지 않고 조용히 추정으로 넘어간다. 다만 화면에는 추정이라고
 * 표시되므로 사용자가 속지는 않는다.
 */
export async function loadRail(country: string): Promise<RailTable | null> {
  try {
    const t = await getJSON<RailTable>(`data/${country}-rail.json`);
    setRailTable(t);
    return t;
  } catch {
    setRailTable(null);
    return null;
  }
}

export const loadCityItems = (slug: string) => getJSON<Item[]>(`data/cities/${slug}.json`);

/**
 * 계획에 쓸 도시들의 아이템을 가져온다.
 * 사용자가 고른 도시에 더해, 시스템이 거점으로 제안한 도시도 포함해야 한다.
 * 마드리드를 고르지 않았어도 거기서 자게 되면 그 도시의 아이템이 필요하다.
 */
export async function loadItemsFor(slugs: string[]): Promise<Item[]> {
  const wanted = new Set(slugs);
  const lists = await Promise.all(
    [...wanted].map((slug) => loadCityItems(slug).catch(() => [] as Item[])),
  );
  return lists.flat();
}
