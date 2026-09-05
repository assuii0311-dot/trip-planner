# 이 저장소에서 일하는 법

여행 계획 PWA. React 18 + TypeScript + Vite 5, 서버 없음.
`app/` 이 앱, `pipeline/` 이 데이터 수집, `docs/` 가 왜 그렇게 했는지의 기록.

## 무엇이 어디에 있나

| | |
|---|---|
| `app/src/lib/` | 엔진 — `planner`(하루 짜기) `daypack`(날 나누기) `itinerary`(거점·순서) `routing`(교통) `rank`(추천) |
| `app/src/steps/` | 1~5단계 화면 |
| `app/src/lib/countries.ts` | 이 앱이 아는 나라. 나라를 붙일 때 첫 자리 |
| `app/public/data/<나라>/` | 그 나라 데이터. `index.json` `rail.json` `cities/<slug>.json` |
| `pipeline/registry/<나라>.mjs` | 사람이 정하는 층 — 어디서 자고 어디를 당일치기로, 몇 분 걸리는지 |
| `docs/` | 고장의 기록. 무엇이 왜 잘못됐고 어떻게 막았는지 |

**엔진과 화면은 나라를 모른다.** 도시 목록·아이템·이동 시간만 받는다.
나라를 붙이는 일은 코드가 아니라 데이터를 채우는 일이다 →
[docs/23-adding-a-country.md](docs/23-adding-a-country.md)

## 지금 하는 일 — 일본(도쿄)

스페인은 1차 마무리. 다음은 일본이고, **일본은 여행의 모양이 달라 데이터보다
엔진이 먼저다** — 도시 하나에 묵고 지역을 돈다(스페인의 도시 = 일본의 지역).

정해진 것과 순서가 [docs/24-japan-data-plan.md](docs/24-japan-data-plan.md)
에 다 있다. **일본 작업을 시작한다면 그 문서부터 읽는다.** 요약하면

1. 온천 테마 추가 → 2. 지역 등급 + 문앞~문앞 오버헤드 → 3. 구간별 화면 →
4. 도쿄 등록부

①~③ 을 건너뛰고 데이터를 쓰면 잘못된 모양으로 쌓인다.

## 검증 — 고치면 반드시 돌린다

브라우저 검사는 엔진이 무한 루프에 빠지면 **실패하지 않고 같이 멈춘다.**
그래서 엔진은 시간 예산을 건 단위 검사로 따로 본다. 둘 다 돌려야 한다.

### 준비 (컨테이너마다 한 번)

```bash
cd app && npm install
# 브라우저 검사는 빌드된 것을 본다. 두 포트를 쓴다(4300: verify·android·country, 4174: smoke·edge)
npm run build
rm -rf /tmp/serve && mkdir -p /tmp/serve/0829_kos_basic_001 && cp -r dist/* /tmp/serve/0829_kos_basic_001/
(cd /tmp/serve && npx --yes http-server -p 4300 -c-1 --silent . &)
(cd /tmp/serve && npx --yes http-server -p 4174 -c-1 --silent . &)

# 사파리(WebKit)로도 봐야 한다 — 아이패드에서만 나는 것이 있었다. 컨테이너마다 다시 깐다.
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw npx playwright install webkit
```

`.ts` 를 읽는 스크립트가 있으므로 **`npx tsx`** 로 돌린다(`node` 아님).

### 엔진 (빠름, 서버 불필요)

```bash
cd app
for s in planner-check daypack-check date-check order-verify rank-check rank-truth \
         basing-check taste-check airport-check island-check routing-check itinerary-check; do
  npx tsx scripts/$s.mjs
done
```

| 스크립트 | 무엇을 지키는가 |
|---|---|
| `planner-check` | 계획 생성이 **반드시 끝난다**(400ms 예산). 담은 것이 말없이 사라지지 않는다. 타는 구간은 모두 안내된다 |
| `daypack-check` | 하루가 칸이 아니라 예산으로 돈다 |
| `date-check` | 시간대를 바꿔도 달력이 안 흔들린다 (컨테이너가 UTC 라 이게 없으면 못 잡는다) |
| `rank-truth` | **순위가 사람의 판단과 맞는가.** 등록부 `highlights` 를 정답지로, `must` 를 빼고 잰다 — 순위 작업의 판정 기준이다 |
| 나머지 | 순서·순위·거점·취향·공항·섬·교통 |

수집기(`pipeline/`)를 고쳤으면 한 가지 더. 망이 필요 없다.

```bash
node pipeline/popularity-check.mjs   # 명성을 한 곳에서 · 위키백과 언어판만 세는가
```

수집기가 못 잡는 장소(거리·지구·산책로·곶)는 손으로 적는다.
**전체 재수집은 하지 않는다** — 다시 돌리면 장소 선정까지 달라진다.

```bash
node pipeline/verify-extras.mjs              # 손으로 적은 좌표가 실제와 맞는가 (망 필요)
node pipeline/apply-manual.mjs               # manual-extras.mjs 를 데이터에 얹는다
node pipeline/apply-islands.mjs              # 섬 항목도 같은 방식
node pipeline/repopulate-popularity.mjs spain --dry   # 무엇이 바뀌는지만 본다
node pipeline/repopulate-popularity.mjs spain         # 언어판 수를 받아 채운다
```

새 장소를 넣거나 등록부의 `highlights` 를 고쳤으면 **반드시**
`npx tsx scripts/rank-truth.mjs` 를 돌린다 — 등록부가 꼽은 대표가
데이터에서 사라지지 않았는지 거기서 본다(지금 결손 0개).

### 화면

```bash
cd app
npx tsx scripts/verify.mjs        # 228건. 가장 넓다
npx tsx scripts/country-check.mjs # 나라가 서로 안 섞이는가
npx tsx scripts/smoke.mjs         # 1~5단계 한 바퀴
npx tsx scripts/edge.mjs          # 경계값
npx tsx scripts/android-check.mjs # 손가락 크기·가로 넘침

# 엔진과 시간대를 바꿔 가며
VERIFY_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/pw npx tsx scripts/verify.mjs
VERIFY_TZ=Asia/Seoul npx tsx scripts/verify.mjs
```

WebKit 은 메모리를 많이 쓴다. 여러 개를 한 명령에 몰아 돌리면 죽는다(exit 137).
**하나씩** 돌린다.

### 고칠 때의 규칙

새 검사를 넣었으면 **고친 것을 되돌려 그 검사가 실제로 걸리는지 확인한다.**
안 걸리는 검사는 검사가 아니다. 이 저장소의 고장은 대부분 '조용히 잘못된'
것들이었다 — 화면이 멈추거나, 담은 도시가 사라지거나, 날짜가 하루 밀리거나.

## 배포

GitHub Pages. 두 저장소를 쓴다.

```bash
git push -u origin claude/travel-planning-program-r4dv63   # 작업 브랜치
git checkout export/trip
git merge claude/travel-planning-program-r4dv63 -m "Merge …"
git push trip export/trip:main                              # → assuii0311-dot.github.io/trip-planner
git checkout claude/travel-planning-program-r4dv63
```

배포 뒤에는 실행판 번들에 바뀐 것이 실제로 들어갔는지 확인한다.
Playwright 는 이 컨테이너에서 실행판에 못 붙으므로 `curl` 로 본다.

```bash
curl -s https://assuii0311-dot.github.io/trip-planner/ | grep -o 'assets/landing-[^"]*\.js'
```

## 이 앱이 지키는 것

- **조용히 실패하지 않는다.** 못 넣은 일정은 `unseen`/`overflow` 로 화면에 말한다
- **아직인 것과 고장난 것은 다르게 말한다** (준비 중 나라 ≠ 망 오류)
- **모르면서 정하지 않는다.** 시각을 안 넣었으면 하루를 다 쓴다
- 주석은 *무엇을* 이 아니라 *왜, 그리고 예전에 무엇이 잘못됐는지* 를 적는다
