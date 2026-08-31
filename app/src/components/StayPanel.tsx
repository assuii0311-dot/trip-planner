import type { City } from '../types';
import { lodgingLinks } from '../lib/deeplinks';

/**
 * 이 도시에서 어디에 묵을 것인가.
 *
 * 동선 엔진은 '어느 도시에서 자는가' 까지만 정해 준다. 그런데 처음 가는
 * 사람이 실제로 막히는 곳은 그다음이다 — 그라나다 알바이신 언덕 위에
 * 숙소를 잡아 캐리어를 들고 계단을 오르거나, 바르셀로나 람블라스 뒷골목에
 * 잡아 새벽 내내 잠을 못 자는 식이다.
 *
 * 값과 평점은 담지 않는다. 수시로 바뀌고 저장할 수도 없다. 동네의 성격만
 * 적고 실제 매물은 예약 링크로 넘긴다 — 지도·후기와 같은 방식이다.
 */
export function StayPanel({ city, nights }: { city: City; nights: number }) {
  const stay = city.stay;
  return (
    <div className="stay">
      <p className="stay-lede">
        {nights > 0
          ? `${city.name}에서 ${nights}박 합니다. 어느 동네에 잡느냐로 하루가 크게 달라집니다.`
          : `${city.name}에 묵는다면 아래 동네를 보세요.`}
      </p>

      {stay ? (
        <>
          <ol className="stay-areas">
            {stay.areas.map((a, i) => (
              <li key={a.name}>
                <div className="stay-area-head">
                  <span className="stay-rank">{i + 1}</span>
                  <span className="stay-area-name">{a.name}</span>
                </div>
                <p className="stay-area-note">{a.note}</p>
                <a
                  className="tag" href={lodgingLinks(city, a.name)[0].url}
                  target="_blank" rel="noreferrer"
                >
                  이 동네 숙소 보기 ↗
                </a>
              </li>
            ))}
          </ol>
          {stay.avoid && <p className="stay-avoid">⚠ {stay.avoid}</p>}
          {stay.tip && <p className="stay-tip">{stay.tip}</p>}
        </>
      ) : (
        /*
          동네 안내를 아직 쓰지 못한 도시. 지어내는 대신 어디에나 통하는
          기준만 적는다. 없는 것을 있는 척하면 그 한 줄 때문에 잘못된 곳에
          숙소를 잡는 사람이 생긴다.
        */
        <div className="stay-generic">
          <p>이 도시는 아직 동네별 안내를 쓰지 못했습니다. 고를 때 이것만 확인하세요.</p>
          <ul>
            <li><b>구시가에서 걸어갈 수 있는가</b> — 스페인 소도시는 볼 것이 구시가에 모여 있습니다.</li>
            <li><b>기차역·버스터미널까지 얼마나 되는가</b> — 다음 도시로 떠나는 날 아침이 달라집니다.</li>
            <li><b>언덕 위인가</b> — 지도에서 등고선을 보세요. 캐리어를 끌 수 없는 경사가 흔합니다.</li>
            <li><b>여름이면 에어컨이 있는가</b> — 내륙은 40도를 넘습니다.</li>
          </ul>
        </div>
      )}

      <div className="stay-links">
        {lodgingLinks(city).map((l) => (
          <a className="link-row" key={l.label} href={l.url} target="_blank" rel="noreferrer">
            <span>
              <div className="l">{l.label}</div>
              <div className="n">{l.note}</div>
            </span>
            <span className="go" aria-hidden>›</span>
          </a>
        ))}
      </div>
    </div>
  );
}
