import type { CountryDef } from './lib/countries';
import { homeHref } from './lib/route';

/**
 * 아직 데이터가 없는 나라의 주소로 들어왔을 때.
 *
 * 그냥 두면 데이터를 받으러 갔다가 실패해서
 * "데이터를 불러오지 못했습니다: data/japan/index.json" 이 뜬다. 그건
 * 망이 끊겼다는 말처럼 읽히고, 사용자는 다시 받기를 눌러 보다 포기한다.
 * 아직인 것과 고장난 것은 다른 일이고, 다르게 말해야 한다.
 */
export function NotReady({ country }: { country: CountryDef }) {
  return (
    <div className="landing">
      <header className="landing-head">
        <p className="landing-kicker">여행 계획</p>
        <h1>{country.flag} {country.name}은 아직 준비 중입니다</h1>
        <p className="landing-sub">{country.soonNote ?? country.blurb}</p>
      </header>
      <p><a className="primary-link" href={homeHref()}>다른 나라 고르기 →</a></p>
    </div>
  );
}
