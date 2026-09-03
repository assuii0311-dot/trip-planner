/**
 * 나라 고르는 곳 — 앱에 들어오면 처음 만나는 화면.
 *
 * 여기서 나라를 고르면 그 나라의 주소로 넘어가고, 거기서부터는 그 나라
 * 프로그램이다. 계획도, 캐시도, 홈 화면 아이콘도 나라마다 따로 간다.
 * 왜 그렇게 했는지는 `src/lib/countries.ts` 에 적어 두었다.
 *
 * 이 페이지는 계획 엔진을 부르지 않는다. 나라를 고르기만 하는 자리에
 * 290KB 짜리 번들을 내려받게 할 이유가 없다.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { COUNTRIES, type CountryDef } from './lib/countries';
import { countryHref } from './lib/route';
import { lastVisited } from './lib/recent';
import './styles.css';

function Card({ c, resume }: { c: CountryDef; resume: string | null }) {
  const ready = c.status === 'ready';
  const body = (
    <>
      <span className="pick-flag" aria-hidden="true">{c.flag}</span>
      <span className="pick-body">
        <span className="pick-title">
          {c.name}
          <span className="pick-en">{c.nameEn}</span>
          {!ready && <span className="pick-soon">준비 중</span>}
        </span>
        <span className="pick-tagline">{c.tagline}</span>
        <span className="pick-blurb">{ready ? c.blurb : c.soonNote ?? c.blurb}</span>
        <span className="pick-tags">
          {c.highlights.map((h) => <span className="pick-tag" key={h}>{h}</span>)}
        </span>
        {/*
          짜다 만 계획이 있으면 그것부터 말해 준다. 나라를 다시 고르는 일이
          '처음부터 다시' 로 보이면, 쓰던 사람이 돌아오기를 망설인다.
        */}
        {ready && resume && <span className="pick-resume">이어서 하기 · {resume}</span>}
      </span>
      {ready && <span className="pick-go" aria-hidden="true">→</span>}
    </>
  );

  if (!ready) {
    return (
      <div className="pick is-soon" style={{ ['--pick' as string]: c.accent }} aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <a className="pick" href={countryHref(c.slug)} style={{ ['--pick' as string]: c.accent }}>
      {body}
    </a>
  );
}

function Landing() {
  return (
    <div className="landing">
      <header className="landing-head">
        <p className="landing-kicker">여행 계획</p>
        <h1>어느 나라로 가시나요?</h1>
        <p className="landing-sub">
          가고 싶은 곳을 고르면 <b>어디서 자고 어디를 당일치기로 다녀올지</b> 앱이 묶어 주고,
          하루 일정을 세 가지 안으로 짜 드립니다.
        </p>
      </header>

      <div className="pick-list">
        {COUNTRIES.map((c) => (
          <Card key={c.slug} c={c} resume={c.status === 'ready' ? lastVisited(c.slug) : null} />
        ))}
      </div>

      <section className="landing-how">
        <h2>어떻게 짜 주나요</h2>
        <ol>
          <li><b>기간과 도시</b>를 고릅니다. 어디에 묵을지는 아직 정하지 않아도 됩니다.</li>
          <li><b>취향</b>을 몇 번 눌러 알려 줍니다. 역사·미식·야경 같은 것들입니다.</li>
          <li>도시마다 <b>얼마나 볼지</b> 정합니다. 찍먹·보통·꽉찬 중에서.</li>
          <li><b>계획 3안</b>이 나옵니다. 이동 시간과 교통편, 예상 비용까지 붙습니다.</li>
        </ol>
      </section>

      <footer className="landing-foot">
        <p>
          나라마다 주소가 다릅니다. 스페인 계획을 짜다 일본을 열어도 서로 섞이지 않고,
          홈 화면에 추가하면 그 나라로 바로 열립니다.
        </p>
        <p className="landing-src">
          자료 출처 · Wikivoyage (CC BY-SA) · Wikidata (CC0) · OpenStreetMap (ODbL) · Renfe 공개 시간표
        </p>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Landing /></StrictMode>,
);
