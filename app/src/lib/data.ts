import type { City, Item } from '../types';
import type { RailTable } from './rail';
import { setRailTable } from './rail';
import { setIslandRail } from './routing';

export interface CountryIndex {
  country: string;
  name: string;
  generatedAt: string;
  attribution: string[];
  macroRegions: { id: string; name: string; regions: string[] }[];
  /** 섬 목록. 섬은 자치주가 아니라 섬 하나가 여행 단위다. */
  islands?: Island[];
  cities: City[];
}

export interface Island {
  id: string;
  name: string;
  nameEn: string;
  region: string;
  cities: string[];
  /** 섬 안에 철도가 있는가. 없으면 교통 엔진이 열차를 지어내지 않는다. */
  rail?: boolean;
  note?: string;
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

export async function loadCountry(country: string): Promise<CountryIndex> {
  const idx = await getJSON<CountryIndex>(`data/${country}.json`);
  // 어느 섬에 철도가 있는지 교통 엔진에 알린다. 모르면 섬에는 없다고 본다 —
  // 없는 열차를 지어내는 것보다 있는 열차를 놓치는 편이 낫다.
  setIslandRail(idx.islands ?? []);
  return idx;
}

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
