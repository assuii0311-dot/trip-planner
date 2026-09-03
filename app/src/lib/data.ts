import type { City, Item } from '../types';
import type { RailTable } from './rail';
import { setRailTable } from './rail';
import { setIslandRail } from './routing';
import { nameIslandHubs } from './island';

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

/**
 * 나라마다 폴더가 따로다.
 *
 * 예전에는 `data/spain.json` 과 `data/cities/*.json` 이 한 곳에 있었다.
 * 나라가 둘이 되면 도시 slug 가 부딪힌다 — `santiago`, `valencia`, `cordoba`
 * 는 여러 나라에 있는 이름이다. 폴더로 갈라 두면 부딪힐 자리가 없다.
 *
 *   public/data/spain/index.json · spain/rail.json · spain/cities/<slug>.json
 *   public/data/japan/index.json · japan/rail.json · japan/cities/<slug>.json
 */
const dir = (country: string) => `data/${country}`;

/**
 * 지금 페이지의 나라. 도시 아이템을 받을 때 쓴다.
 *
 * 앱은 한 주소에서 한 나라만 다룬다(`/trip-planner/spain/`). 그래서 전역에
 * 하나만 두면 되고, 두면 부르는 쪽마다 나라를 들고 다니지 않아도 된다.
 */
let here = 'spain';
export const setCountry = (country: string): void => { here = country; };
export const getCountry = (): string => here;

async function getJSON<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다: ${path}`);
  const data = (await res.json()) as T;
  cache.set(path, data);
  return data;
}

export async function loadCountry(country: string): Promise<CountryIndex> {
  setCountry(country);
  const idx = await getJSON<CountryIndex>(`${dir(country)}/index.json`);
  // 어느 섬에 철도가 있는지 교통 엔진에 알린다. 모르면 섬에는 없다고 본다 —
  // 없는 열차를 지어내는 것보다 있는 열차를 놓치는 편이 낫다.
  setIslandRail(idx.islands ?? []);
  // 섬은 도시가 아니라 섬 하나가 여행 단위다. 거점 도시는 섬 이름으로 부른다.
  return { ...idx, cities: nameIslandHubs(idx.cities, idx.islands ?? []) };
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
    const t = await getJSON<RailTable>(`${dir(country)}/rail.json`);
    setRailTable(t);
    return t;
  } catch {
    setRailTable(null);
    return null;
  }
}

export const loadCityItems = (slug: string) => getJSON<Item[]>(`${dir(here)}/cities/${slug}.json`);

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
