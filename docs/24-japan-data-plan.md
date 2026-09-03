# 일본 데이터 — 시작하기 전에

구조는 끝났다(`docs/23-adding-a-country.md`). 남은 것은 **데이터를 채우는
일**이고, 대부분은 사람이 판단해야 하는 층이다. 새 세션에서 시작할 때
이 문서부터 읽으면 된다.

## 무엇을 만들어야 하나

### 1. `pipeline/registry/japan.mjs` — 뼈대

`registry/spain.mjs`(348줄, 도시 61곳)가 본보기다. 도시마다:

```js
{ slug: 'kanazawa', title: 'Kanazawa', name: '가나자와', nameEn: 'Kanazawa',
  region: '호쿠리쿠', lat: 36.5613, lon: 136.6562,
  isHub: true,                       // 거점이면 dayTrips, 근교면 hub: '거점slug'
  blurb: '한 줄 소개',
  dayTrips: [ T('shirakawa-go', 75, '노선버스', '설명') ],   // 편도 분 · 실제 운행 시간
  transitGuide: { passes: [...], apps: [...], tips: [...] } }
```

`T(city, transitMin, mode, note)` 의 `transitMin` 은 **거리에서 추정한 값이
아니라 실제 운행 시간**이다. 이것이 이 파일이 존재하는 이유다 — 나머지는
자동으로 모을 수 있지만 이건 아니다.

### 2. `pipeline/registry/japan-character.mjs` — 성격

`MACRO_REGIONS`, `ISLANDS`, `ISLAND_OF`, `CHARACTER` 를 내보낸다.
`CHARACTER` 는 도시마다 8축 프로필(취향 역산에 쓴다) + 며칠 묵을 만한가 +
계절 + 태그. 스페인 것은 562줄이다.

### 3. 수집

```bash
node pipeline/collect.mjs japan --list     # 도시 목록만 보고 멈춤
node pipeline/collect.mjs japan
```

Wikivoyage(CC BY-SA) · Wikidata(CC0) · OSM(ODbL) 에서만 받는다.
평점·영업시간은 저장하지 않는다 — 이유는 `docs/01-data-sourcing.md`.

### 4. 마무리

- `app/src/lib/countries.ts` 의 japan 을 `status: 'ready'` 로
- `app/src/lib/outlines.ts` 에 국경선(범위 `FRAMES.japan` 은 이미 넣어 두었다)
- `npx tsx scripts/country-check.mjs` — 나라가 둘이 되면 이 검사가
  **서로 새지 않는지**까지 본다. 지금은 그걸 볼 수 없다

## 먼저 정해야 할 것

일을 시작하기 전에 답이 필요한 것들이다. 스페인 때는 하면서 정했고,
몇 번 되돌렸다.

**1. 몇 도시로 가나.** 스페인은 거점 14 + 근교 46 = 60곳이었다. 일본은
지리가 길어 홋카이도~규슈를 한 여행에 담기 어렵다. 거점을 늘리기보다
**간사이·간토·규슈처럼 권역을 나누고 권역 안에서 촘촘하게** 가는 편이
이 앱의 거점·근교 모델과 맞는다.

**2. slug 를 어떻게 쓰나.** 로마자(`kanazawa`, `shirakawa-go`)를 권한다.
스페인이 그렇게 했고, 파일 이름·주소에 그대로 쓰인다.

**3. 철도 시간표.** 스페인은 Renfe GTFS 를 받아 실제 시간표를 쓴다
(`pipeline/fetch-renfe-gtfs.mjs`). 일본에 대응되는 공개 GTFS 가 있는지,
없다면 등록부의 `transitMin` 만으로 갈지 정해야 한다. **없으면 앱은
그대로 돌고 화면에 '추정치' 라고 표시된다** — 없는 시간표를 지어내지
않는다는 규칙은 이미 코드에 있다.

**4. 신칸센·JR패스를 어디까지 다루나.** `transitGuide.passes` 에 넣으면
5단계 교통 안내에 뜬다. 스페인의 T-casual 자리다.

## 하지 않아도 되는 것

- 엔진 수정 — 나라를 모른다
- 화면 수정 — 1~5단계 그대로
- 지도 코드 — 국경선이 없어도 도시 좌표로 그린다

## 규모 감각

스페인 기준: 등록부 348줄 + 성격 562줄을 사람이 썼고, 수집 결과가
도시 60곳 · 아이템 2,132개 · 2.3MB 다. 아이템 설명(요약·왜 가는가·
실무 정보·주의점)은 전부 한국어로 직접 썼다. **여러 세션에 걸친 일이다.**
