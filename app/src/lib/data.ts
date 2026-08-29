import type { City, Item } from '../types';

export interface CountryIndex {
  country: string;
  name: string;
  generatedAt: string;
  attribution: string[];
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

export const loadCityItems = (slug: string) => getJSON<Item[]>(`data/cities/${slug}.json`);

/** 선택한 거점 도시와 그 근교 도시의 아이템을 한꺼번에 가져온다. */
export async function loadItemsFor(index: CountryIndex, baseCities: string[]): Promise<Item[]> {
  const wanted = new Set(baseCities);
  for (const slug of baseCities) {
    const city = index.cities.find((c) => c.slug === slug);
    city?.dayTrips.forEach((t) => wanted.add(t.city));
  }
  const lists = await Promise.all(
    [...wanted].map((slug) => loadCityItems(slug).catch(() => [] as Item[])),
  );
  return lists.flat();
}
