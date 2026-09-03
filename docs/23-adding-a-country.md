# 나라를 하나 더 붙이려면

## 왜 나라마다 주소가 다른가

한 주소 안에서 나라를 바꾸면 데이터가 겹친다.

- **도시 slug 가 부딪힌다.** `santiago`, `valencia`, `cordoba`, `toledo` 는
  여러 나라에 있는 이름이다. 한 폴더에 두면 어느 쪽이 진짜인지 알 수 없다.
- **저장해 둔 계획이 섞인다.** localStorage 는 주소가 달라도 같은 서랍을
  본다. 열쇠를 안 나누면 스페인 도시가 담긴 계획을 일본 데이터로 읽으려 든다.
- **캐시가 섞인다.** 서비스 워커가 받아 둔 앞 나라의 데이터를 뒷 나라가 읽는다.

그래서 나라를 고르는 순간 프로그램이 갈라지게 했다.

```
/trip-planner/           나라 고르는 곳
/trip-planner/spain/     스페인 계획
/trip-planner/japan/     일본 계획
```

주소가 다르면 **저장분도, 홈 화면 아이콘도, 서비스 워커가 내주는 셸도**
따로 간다. 스페인 계획을 짜다 일본을 열어도 서로를 건드릴 자리가 없다.

## 붙이는 순서

### 1. 앱에 알린다 — `app/src/lib/countries.ts`

```ts
{
  slug: 'italy', name: '이탈리아', nameEn: 'Italy', flag: '🇮🇹',
  tagline: '북부 · 토스카나 · 남부',
  blurb: '…',
  highlights: ['도시 40곳'],
  status: 'soon',          // 데이터가 준비되면 'ready'
  accent: '#3f6b4a',
}
```

`status: 'soon'` 이면 접수 페이지에서 카드가 흐려지고 눌리지 않는다.
그 주소로 직접 들어오면 "아직 준비 중입니다" 가 뜬다 — 데이터를 받으러
갔다가 실패한 망 오류처럼 보이지 않게 하려는 것이다. **아직인 것과 고장난
것은 다른 일이고, 다르게 말해야 한다.**

### 2. 페이지를 만든다 — `app/italy/index.html`, `app/vite.config.ts`

`spain/index.html` 을 복사해 제목·테마색만 바꾼다.
`vite.config.ts` 의 `pages` 배열에 `'italy'` 를 넣는다.
`app/public/italy/manifest.webmanifest` 도 같은 요령으로.

### 3. 데이터를 모은다 — `pipeline/registry/italy.mjs`

`registry/spain.mjs` 가 본보기다. 사람이 정하는 층이다 —
어디에 묵고, 어디를 어디서 당일치기로 다녀오고, 그게 몇 분 걸리는지.
이동 시간은 **거리에서 추정한 값이 아니라 실제 운행 시간**을 적는다.

```
node pipeline/collect.mjs italy            # 전부
node pipeline/collect.mjs italy --list     # 도시 목록만 보고 멈춤
```

결과는 `app/public/data/italy/index.json` 과 `italy/cities/<slug>.json`
으로 떨어진다. 철도 시간표가 있으면 `italy/rail.json` 도.

### 4. 지도 — `app/src/lib/outlines.ts`

국경선(`OUTLINES`)과 지도 범위(`FRAMES`)를 넣는다. **둘 다 없어도 지도는
나온다** — 국경선은 빈 배열이 되고, 범위는 고른 도시들로 만들어 낸다.
새 나라를 붙일 때 지도 때문에 막히지 않게 해 둔 것이다.

### 5. `status: 'ready'` 로 바꾸고 검사한다

```
npx tsx scripts/country-check.mjs
```

나라가 둘 이상 준비되면 이 검사가 **서로 새지 않는지**까지 본다 —
한 나라에서 도시를 고르고 다른 나라 주소로 가서, 앞 나라 계획이 딸려
오지 않는지.

## 나라에 딸린 것과 안 딸린 것

| | 나라마다 따로 | 함께 쓰는 것 |
|---|---|---|
| 데이터 | `public/data/<slug>/` | — |
| 저장분 | `trip-planner.v1.<slug>` | 진단 기록 |
| 주소·매니페스트 | `/<slug>/` | — |
| 지도 국경선·범위 | `outlines.ts` | 지도 그리는 코드 |
| 계획 엔진 | — | 전부 (`planner`, `daypack`, `itinerary`, `routing`, `rank`) |
| 화면 | — | 전부 (1~5단계) |

**엔진과 화면은 나라를 모른다.** 도시 목록과 아이템, 이동 시간만 받는다.
그래서 나라를 붙이는 일은 코드를 고치는 일이 아니라 데이터를 채우는 일이다.

## 옛 주소로 들어온 사람

나라를 쪼개기 전 주소(`/trip-planner/`)로 들어오면 이제 접수 페이지가 뜬다.
그때 저장해 둔 계획은 스페인 것이므로(그때는 스페인밖에 없었다) 처음
읽을 때 `trip-planner.v1` → `trip-planner.v1.spain` 으로 한 번 옮긴다.
쓰던 사람의 계획이 사라지면 안 된다.

없는 나라 주소(`/trip-planner/france/`)는 `public/404.html` 이 받아
접수 페이지로 돌려보낸다.
