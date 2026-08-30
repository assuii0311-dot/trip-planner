import type { City, Item, Plan } from '../types';

/**
 * 고른 장소를 구글 '내 지도'로 옮기기 위한 KML 만들기.
 *
 * 구글 '내 지도'에는 외부에서 장소를 써넣는 공개 API가 없다. 예전 Maps Data
 * API 는 폐기됐고, 구글 지도의 '저장한 장소' 목록도 마찬가지다. 공식으로
 * 지원되는 유일한 경로가 파일 가져오기(KML/CSV)여서 그쪽으로 만든다.
 *
 * 사용자가 자기 지도를 만들고 이 파일을 가져오면, 어느 지도에 넣을지는
 * 사용자가 정하게 된다.
 *
 * 구글이 문서로 밝힌 제한:
 *   - 레이어 하나에 2,000개까지 (넘으면 조용히 잘린다)
 *   - 지도 하나에 레이어 10개
 *   - 지도 하나에 총 10,000개
 * KML 의 <Folder> 하나가 레이어 하나가 된다.
 */

/** 구글 '내 지도' 제한. 넘기면 경고한다 — 조용히 잘리는 것이 가장 나쁘다. */
export const MYMAPS_LAYER_LIMIT = 10;
export const MYMAPS_PER_LAYER = 2000;
export const MYMAPS_TOTAL = 10000;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** CDATA 안에서는 ]]> 만 깨뜨릴 수 있다. */
const cdata = (s: string) => `<![CDATA[${s.replace(/\]\]>/g, ']]&gt;')}]]>`;

export interface KmlGroup { name: string; items: Item[] }

export interface KmlResult {
  xml: string;
  /** 실제로 담긴 장소 수. */
  placed: number;
  /** 좌표가 없어 지도에 찍을 수 없던 장소 수. */
  skipped: number;
  groups: number;
  /** 구글 제한을 넘겨 잘릴 수 있는 경우의 경고. 없으면 빈 배열. */
  warnings: string[];
}

/** 한 장소의 설명. 앱에서 쓰는 문장을 그대로 옮긴다. */
function describe(item: Item, city: City | undefined): string {
  const lines: string[] = [];
  if (item.why) lines.push(item.why);
  const p = item.practical;
  const facts = [
    p.booking && `예약: ${p.booking}`,
    p.closed && `휴관: ${p.closed}`,
    p.busy && `붐빔: ${p.busy}`,
    `소요: ${p.duration}`,
    p.price && `요금: ${p.price}`,
    p.hours && `영업시간: ${p.hours}`,
  ].filter(Boolean) as string[];
  if (facts.length) lines.push(facts.join(' · '));
  if (item.caution) lines.push(`⚠ ${item.caution}`);
  if (city) lines.push(`도시: ${city.name}`);
  lines.push(item.nameLocal ?? item.nameEn);
  return lines.join('<br>');
}

/**
 * KML 문서를 만든다.
 * 좌표가 없는 장소는 지도에 찍을 수 없으므로 뺀다 — 도시 중심에 몰아
 * 찍으면 엉뚱한 자리를 알려 주는 셈이 된다.
 */
export function buildKml(
  title: string, groups: KmlGroup[], cities: City[], attribution: string[],
): KmlResult {
  const cityOf = (slug: string) => cities.find((c) => c.slug === slug);
  const warnings: string[] = [];
  let placed = 0;
  let skipped = 0;

  const folders = groups.map((g) => {
    const withCoords = g.items.filter((i) => i.lat !== null && i.lon !== null);
    skipped += g.items.length - withCoords.length;
    if (withCoords.length > MYMAPS_PER_LAYER) {
      warnings.push(`'${g.name}' 이 ${withCoords.length}곳이라 구글에서 ${MYMAPS_PER_LAYER}곳까지만 들어갑니다.`);
    }
    placed += withCoords.length;
    const marks = withCoords.map((i) => `      <Placemark>
        <name>${esc(i.name)}</name>
        <description>${cdata(describe(i, cityOf(i.city)))}</description>
        <Point><coordinates>${i.lon},${i.lat},0</coordinates></Point>
      </Placemark>`).join('\n');
    return `    <Folder>\n      <name>${esc(g.name)}</name>\n${marks}\n    </Folder>`;
  });

  if (groups.length > MYMAPS_LAYER_LIMIT) {
    warnings.push(`레이어가 ${groups.length}개입니다. 구글 '내 지도'는 지도 하나에 ${MYMAPS_LAYER_LIMIT}개까지만 받습니다.`);
  }
  if (placed > MYMAPS_TOTAL) {
    warnings.push(`장소가 ${placed}곳입니다. 구글 '내 지도'는 지도 하나에 ${MYMAPS_TOTAL}곳까지만 받습니다.`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(title)}</name>
    <description>${cdata(`출처: ${attribution.join(' · ')}`)}</description>
${folders.join('\n')}
  </Document>
</kml>
`;

  return { xml, placed, skipped, groups: groups.length, warnings };
}

/** 고른 도시의 전체 아이템 — 도시별로 묶는다. */
export function groupByCity(items: Item[], cities: City[]): KmlGroup[] {
  const order = new Map(cities.map((c, i) => [c.slug, i]));
  const m = new Map<string, Item[]>();
  for (const i of items) {
    const list = m.get(i.city) ?? [];
    list.push(i);
    m.set(i.city, list);
  }
  return [...m.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
    .map(([slug, list]) => ({
      name: cities.find((c) => c.slug === slug)?.name ?? slug,
      items: list,
    }));
}

/**
 * 계획에 들어간 아이템 — 일자별로 묶는다.
 *
 * 현지에서는 '오늘 갈 곳' 만 켜 놓고 보게 되므로 일자별이 가장 쓸모 있다.
 * 다만 레이어는 10개까지라, 열흘이 넘으면 도시별로 되돌린다.
 */
export function groupByDay(plan: Plan, cities: City[]): KmlGroup[] {
  if (plan.days.length > MYMAPS_LAYER_LIMIT) {
    return groupByCity(plan.days.flatMap((d) => d.entries.map((e) => e.item)), cities);
  }
  const name = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;
  return plan.days
    .filter((d) => d.entries.length > 0)
    .map((d) => ({
      name: `${d.dayIndex}일차 · ${name(d.city)}`,
      items: d.entries.map((e) => e.item),
    }));
}

/** 파일로 내려받는다. 아이패드에서는 '파일' 앱에 저장된다. */
export function downloadKml(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
