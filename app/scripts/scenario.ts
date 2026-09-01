/**
 * 정해진 조합으로 계획을 만들어 눈으로 확인한다.
 * 무작위 시뮬레이션이 놓치는 것(반나절 근교, 거점 제안)을 여기서 본다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { City, Item, Preferences, Priorities } from '../src/types';
import { assignBases } from '../src/lib/basing';
import { buildPlans, formatTime, SLOT_LABEL } from '../src/lib/planner';
import { rankItems } from '../src/lib/scoring';
import { inferThemes } from '../src/lib/taste';
import { defaultState } from '../src/lib/store';

const DATA = join(process.cwd(), 'public', 'data');
const index = JSON.parse(readFileSync(join(DATA, 'spain.json'), 'utf8')) as { cities: City[] };
const itemsOf = (slug: string): Item[] => {
  try { return JSON.parse(readFileSync(join(DATA, 'cities', `${slug}.json`), 'utf8')); }
  catch { return []; }
};
void readdirSync;

function scenario(label: string, slugs: string[], days: number) {
  const chosen = slugs.map((s) => index.cities.find((c) => c.slug === s)!).filter(Boolean);
  const groups = assignBases(chosen, index.cities, days);

  const scope = new Set<string>(slugs);
  groups.forEach((g) => { scope.add(g.base.slug); g.dayTrips.forEach((t) => scope.add(t.city.slug)); });
  const items = [...scope].flatMap(itemsOf);

  const prefs: Preferences = { ...defaultState().prefs, themes: inferThemes(chosen) };
  const priorities: Priorities = {};
  for (const { item } of rankItems(items, prefs, {}).slice(0, days * 3)) priorities[item.id] = 2;

  const { plans, dropped } = buildPlans({
    items, groups, startDate: '2026-05-01', days, prefs, priorities,
  });
  const plan = plans.find((p) => p.style === 'balanced')!;
  const name = (s: string) => index.cities.find((c) => c.slug === s)?.name ?? s;

  console.log(`\n━━ ${label} (${days}일) ━━`);
  for (const g of groups) console.log(`  거점 ${g.base.name} ${g.nights}박${g.baseSuggested ? ' [제안]' : ''} — ${g.reason}`);
  if (dropped.length) console.log(`  넣지 못함: ${dropped.join(', ')}`);
  for (const d of plan.days) {
    const back = d.entries.find((e) => e.returnLeg);
    const where = back
      ? `${name(d.city)}→${name(d.returnTo!)}(${back.slot === 'dinner' ? '저녁' : '오후'}부터)`
      : name(d.city);
    console.log(`  ${d.dayIndex}일차 ${where.padEnd(30)} ${d.entries.length}곳`);
    for (const e of d.entries) {
      const leg = e.returnLeg ? ` [${name(e.returnLeg.from)}→${name(e.returnLeg.to)} ${e.returnLeg.minutes}분]` : '';
      console.log(`      ${formatTime(e.startMin)} ${SLOT_LABEL[e.slot].padEnd(6)}${leg} ${e.item.name}`);
    }
  }
}

scenario('바르셀로나 + 몬세라트 (반나절 근교)', ['barcelona', 'montserrat'], 4);
scenario('소도시만 — 톨레도·세고비아·아빌라', ['toledo', 'segovia', 'avila'], 5);
scenario('멀리 떨어진 두 곳', ['barcelona', 'seville'], 8);
