# 여행 계획 앱

취향과 우선순위를 입력하면 **밀도가 다른 세 가지 여행 일정**을 만들어 주고,
고른 일정의 이동·예약 방법까지 안내하는 모바일 웹앱(PWA)입니다.

아이패드와 폰 브라우저에서 바로 열리고, 홈 화면에 추가하면 앱처럼 동작합니다.
서버도 API 키도 필요 없습니다.

## 5단계 흐름

1. **기초 정보** — 가고 싶은 도시(60곳 전부에서 선택), 출발일·도착일, 인원,
   입국·출국 공항. 무엇이 거점인지는 고른 뒤에 앱이 판단합니다
2. **취향** — 고른 도시에서 테마 관심도를 역산해 보여 주고, 틀린 것만 고칩니다. 남은 질문은 5개
3. **코스 선택** — 도시마다 추천 코스 세 가지 중 하나를 고르고, 빼거나 더합니다.
   담을 때마다 예상 소요 일수가 갱신됩니다
4. **계획 3안** — 알찬형 / 균형형 / 여유형. 일정마다 대안을 최대 3개까지 옆에 붙여
   그 자리에서 바꿀 수 있습니다
5. **이동·예약 안내** — 길찾기 딥링크, 예약 경로, 도시별 교통 가이드,
   **구글 내 지도로 내보내기**(전체 장소 / 여행 경로만)

3단계가 이 앱의 중심입니다. 처음에는 아이템 2천 개를 늘어놓고 고르게 했는데,
스페인을 모르는 사람은 무엇이 좋은지 몰라 고를 수가 없었습니다. 그래서 순서를
뒤집어 코스를 먼저 주고 거기서 손보게 했습니다.

## 현재 데이터

스페인 60개 도시 (거점 14곳 + 근교 46곳), 여행 아이템 2,132개.
모든 아이템의 이름과 설명을 한국어로 직접 썼습니다. 설명은 네 부분으로 나뉩니다 —
목록용 한 줄 요약, 왜 가는가, 실무 정보(예약·휴관·붐빔·소요·요금), 주의점.
거점 도시를 고르면 근교 당일치기 후보가 자동으로 따라옵니다.

철도 시간표는 Renfe 공개 데이터(CC BY 4.0)에서 받습니다 — `node pipeline/fetch-renfe-gtfs.mjs spain`.

데이터 출처와 그 선택 이유는 [docs/01-data-sourcing.md](docs/01-data-sourcing.md),
단계별 정의는 [docs/02-spec.md](docs/02-spec.md),
동선·교통 엔진은 [docs/06-routing.md](docs/06-routing.md) 에 있습니다.

## 실행

```bash
cd app
npm install
npm run dev       # 개발 서버
npm run build     # dist/ 로 정적 빌드
```

휴대폰에서 개발 서버를 열려면 `npm run dev -- --host` 로 띄우고 같은 와이파이에서 접속합니다.

## 데이터 수집

```bash
# 나라 안의 도시를 찾아 아이템 수를 실측한다
node pipeline/discover.mjs Spain --depth 3

# 레지스트리에 등록된 도시를 수집해 앱 데이터로 쓴다
node pipeline/collect.mjs spain --list          # 대상 도시만 확인
node pipeline/collect.mjs spain                 # 전체 수집
node pipeline/collect.mjs spain --exclude vic,blanes
node pipeline/collect.mjs spain --only barcelona,girona
```

대화형으로 실행하면 도시 목록을 보여준 뒤 제외할 도시를 물어봅니다.

새 나라를 추가하려면 `pipeline/registry/<country>.mjs` 를 만들고 거점·근교 관계를 정의하면 됩니다.
앱 코드는 수정하지 않습니다.

## 출처

- [Wikivoyage](https://wikivoyage.org) — CC BY-SA 4.0
- [Wikidata](https://wikidata.org) — CC0
- [OpenStreetMap](https://openstreetmap.org) contributors — ODbL

영업시간·요금·평점은 저장하지 않고 방문 시점에 지도 링크로 확인하도록 했습니다.
그 이유는 [docs/01-data-sourcing.md](docs/01-data-sourcing.md) 에 정리했습니다.
