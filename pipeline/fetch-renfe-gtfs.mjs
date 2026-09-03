#!/usr/bin/env node
/**
 * Renfe 실제 시간표를 받아 앱이 쓸 수 있는 크기로 줄인다.
 *
 * 처음에는 "스페인 철도는 공개 API 가 없다" 고 판단하고 운행 패턴으로
 * 추정했는데, 그것은 틀린 판단이었다. Renfe 는 data.renfe.com 에서 고속·
 * 장거리·중거리 시간표를 GTFS 로, CC BY 4.0 으로 공개한다. 매일 갱신된다.
 *
 *   https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia
 *
 * 원본은 33MB 라 그대로는 못 쓴다. 우리가 다루는 60개 도시 사이의 직통편만
 * 뽑아 몇백 KB 로 줄인다. 환승편은 넣지 않는다 — 환승 조합은 경우의 수가
 * 폭발하고, 그 계산은 Renfe 예매 화면이 훨씬 잘한다.
 *
 * 근교선(Cercanías)과 FEVE 는 이 피드에 없다. 그쪽은 별도 데이터셋이고,
 * 도시 안 이동이라 이 앱의 도시 간 계산에는 쓰이지 않는다.
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const run = promisify(execFile);
const FEED = 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip';
const TMP = new URL('./out/renfe/', import.meta.url);
const countrySlug = process.argv[2] ?? 'spain';

/**
 * 역 이름을 도시에 붙이는 표.
 *
 * 자동 매칭(이름 포함 관계)만으로는 안 된다. 영문 'Seville' 과 스페인어
 * 'Sevilla' 가 다르고, 'Toledo' 는 'Oropesa de Toledo' 같은 엉뚱한 역에도
 * 걸린다. 큰 도시는 손으로 지정하고 나머지만 자동으로 맞춘다.
 */
const STATION_OF = {
  madrid: ['Madrid-Puerta de Atocha-Almudena Grandes', 'Madrid-Chamartín-Clara Campoamor'],
  barcelona: ['Barcelona-Sants'],
  seville: ['Sevilla-Santa Justa'],
  valencia: ['València-Joaquín Sorolla', 'València-Estació del Nord'],
  malaga: ['Málaga María Zambrano'],
  cordoba: ['Córdoba-Julio Anguita'],
  granada: ['Granada'],
  zaragoza: ['Zaragoza-Delicias'],
  alicante: ['Alicante/Alacant Terminal'],
  bilbao: ['Bilbao-Intermod. Abando Indalecio Prieto'],
  'san-sebastian': ['Donostia / San Sebastián'],
  toledo: ['Toledo'],
  segovia: ['Segovia-Guiomar'],
  salamanca: ['Salamanca'],
  avila: ['Ávila'],
  cuenca: ['Cuenca-Fernando Zóbel', 'Cuenca'],
  santiago: ['Santiago de Compostela'],
  'a-coruna': ['A Coruña'],
  vigo: ['Vigo-Guixar', 'Vigo Urzáiz'],
  ourense: ['Ourense'],
  oviedo: ['Oviedo'],
  santander: ['Santander'],
  pamplona: ['Pamplona'],
  vitoria: ['Vitoria/Gasteiz'],
  logrono: ['Logroño'],
  tarragona: ['Camp de Tarragona', 'Tarragona'],
  girona: ['Girona'],
  figueres: ['Figueres-Vilafant', 'Figueres'],
  cadiz: ['Cádiz'],
  jerez: ['Jerez de la Frontera'],
  teruel: ['Teruel'],
  elche: ['Elche-Carrús', 'Elx/Elche-Carrús'],
  xativa: ['Xàtiva'],
  sagunto: ['Sagunt/Sagunto'],
  ronda: ['Ronda'],
  'alcala-de-henares': ['Alcalá de Henares'],
  aranjuez: ['Aranjuez'],
  vic: ['Vic'],
  denia: [],
  penyiscola: ['Benicarló-Peñíscola'],
};

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** GTFS 는 따옴표를 거의 안 쓰지만, 쓰는 경우가 있어 최소한만 처리한다. */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',').map((s) => s.trim());
  return lines.slice(1).map((line) => {
    const v = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { v.push(cur); cur = ''; }
      else cur += ch;
    }
    v.push(cur);
    const o = {};
    head.forEach((k, i) => { o[k] = (v[i] ?? '').trim(); });
    return o;
  });
}

/** 'HH:MM:SS' → 분. GTFS 는 자정을 넘기면 24 를 넘는 시각을 쓴다. */
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

console.error('Renfe GTFS 내려받는 중…');
await mkdir(TMP, { recursive: true });
const zip = new URL('feed.zip', TMP);
const res = await fetch(FEED);
if (!res.ok) throw new Error(`GTFS 내려받기 실패: HTTP ${res.status}`);
await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
await run('unzip', ['-o', '-q', zip.pathname, '-d', TMP.pathname]);

const read = async (f) => parseCsv(await readFile(new URL(f, TMP), 'utf8'));
const [stops, routes, trips, calendar, exceptions, stopTimes] = await Promise.all([
  read('stops.txt'), read('routes.txt'), read('trips.txt'),
  read('calendar.txt'), read('calendar_dates.txt'), read('stop_times.txt'),
]);
console.error(`역 ${stops.length} · 노선 ${routes.length} · 운행 ${trips.length} · 정차 ${stopTimes.length}`);

// ── 도시 ↔ 역 ───────────────────────────────────────────────────────────
const cities = JSON.parse(
  await readFile(new URL(`../app/public/data/${countrySlug}.json`, import.meta.url), 'utf8'),
).cities;

const cityOfStop = new Map();
const stationsOf = {};
for (const c of cities) {
  const listed = STATION_OF[c.slug];
  let matched = [];
  if (listed) {
    matched = stops.filter((s) => listed.some((n) => norm(s.stop_name) === norm(n)));
  } else {
    // 손으로 안 적은 도시는 이름이 정확히 같은 역만 받는다. 부분 일치는
    // 'Oropesa de Toledo' 를 톨레도로 잡아 버린다.
    matched = stops.filter((s) => norm(s.stop_name) === norm(c.nameEn) || norm(s.stop_name) === norm(c.name));
  }
  if (!matched.length) continue;
  stationsOf[c.slug] = matched.map((s) => s.stop_id);
  for (const s of matched) cityOfStop.set(s.stop_id, c.slug);
}
console.error(`도시 매칭 ${Object.keys(stationsOf).length} / ${cities.length}`);

// ── 운행별 요일 ─────────────────────────────────────────────────────────
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const serviceDays = new Map();      // service_id → 요일 비트마스크(일=1, 월=2, …)
const serviceRange = new Map();
for (const c of calendar) {
  let mask = 0;
  DAYS.forEach((d, i) => { if (c[d] === '1') mask |= 1 << i; });
  serviceDays.set(c.service_id, mask);
  serviceRange.set(c.service_id, [c.start_date, c.end_date]);
}
// 예외일(2=운휴)이 많으면 그 요일은 사실상 안 다닌다고 보기 어렵다.
// 개별 날짜까지 담으면 파일이 커지므로, 운휴가 잦은 편은 표시만 해 둔다.
const cancels = new Map();
for (const e of exceptions) {
  if (e.exception_type !== '2') continue;
  cancels.set(e.service_id, (cancels.get(e.service_id) ?? 0) + 1);
}

const routeName = new Map(routes.map((r) => [r.route_id, r.route_short_name || 'Renfe']));
const tripInfo = new Map(trips.map((t) => [t.trip_id, t]));

// ── 운행별 정차 순서 ────────────────────────────────────────────────────
const byTrip = new Map();
for (const st of stopTimes) {
  const l = byTrip.get(st.trip_id) ?? [];
  l.push(st);
  byTrip.set(st.trip_id, l);
}

/**
 * 도시 쌍별 직통편.
 * 한 운행이 A 에 섰다가 뒤에 B 에 서면 그 사이는 직통이다.
 */
const pairs = new Map();
for (const [tripId, list] of byTrip) {
  const t = tripInfo.get(tripId);
  if (!t) continue;
  const mask = serviceDays.get(t.service_id) ?? 0;
  if (!mask) continue;
  const name = routeName.get(t.route_id) ?? 'Renfe';
  const seq = list
    .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
    .map((st) => ({ city: cityOfStop.get(st.stop_id), dep: st.departure_time, arr: st.arrival_time }))
    .filter((x) => x.city);
  for (let i = 0; i < seq.length; i++) {
    for (let j = i + 1; j < seq.length; j++) {
      if (seq[i].city === seq[j].city) continue;
      const key = `${seq[i].city}>${seq[j].city}`;
      const d = toMin(seq[i].dep);
      const a = toMin(seq[j].arr);
      if (a <= d) continue;
      const l = pairs.get(key) ?? [];
      l.push({ d, a, n: name, w: mask, x: cancels.get(t.service_id) ?? 0 });
      pairs.set(key, l);
    }
  }
}

// 같은 출발 시각·같은 열차가 기간만 나뉘어 여러 번 들어온다. 하나로 줄인다.
const out = {};
let total = 0;
for (const [key, list] of pairs) {
  const seen = new Map();
  for (const s of list) {
    const k = `${s.d}|${s.a}|${s.n}`;
    const prev = seen.get(k);
    if (prev) { prev.w |= s.w; prev.x = Math.min(prev.x, s.x); }
    else seen.set(k, { ...s });
  }
  const rows = [...seen.values()].sort((p, q) => p.d - q.d);
  out[key] = rows;
  total += rows.length;
}

const dates = [...serviceRange.values()];
const payload = {
  source: 'Renfe (data.renfe.com)',
  license: 'CC BY 4.0',
  url: 'https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia',
  fetchedAt: new Date().toISOString().slice(0, 10),
  validFrom: dates.map((d) => d[0]).sort()[0],
  validTo: dates.map((d) => d[1]).sort().pop(),
  note: '고속·장거리·중거리 직통편만. 근교선(Cercanías)과 환승편은 들어 있지 않습니다.',
  cities: Object.keys(stationsOf),
  pairs: out,
};

const dest = new URL(`../app/public/data/${countrySlug}/rail.json`, import.meta.url);
await writeFile(dest, JSON.stringify(payload));
const bytes = JSON.stringify(payload).length;
console.log(`도시 쌍 ${Object.keys(out).length} · 편수 ${total} · ${(bytes / 1024).toFixed(0)}KB`);
console.log(`유효 기간 ${payload.validFrom} ~ ${payload.validTo}`);
await rm(TMP, { recursive: true, force: true });
