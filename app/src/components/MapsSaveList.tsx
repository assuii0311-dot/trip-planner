import { useState } from 'react';
import type { City, Plan } from '../types';
import { mapsPlaceUrl } from '../lib/deeplinks';
import { fmtHm } from '../lib/routing';

/**
 * 계획에 든 곳을 구글 지도 '목록' 에 담기.
 *
 * ## 왜 링크를 늘어놓는가 — 한 번에 넣을 방법이 없다
 *
 * 구글 지도에는 성격이 다른 두 가지가 있고 서로 섞이지 않는다.
 *
 *  - **내 지도(My Maps)**: 파일 가져오기가 된다. 5단계에서 KML 을 받아
 *    한 번에 넣을 수 있다. 다만 지도 앱에서는 '저장됨 → 지도' 에 읽기
 *    전용으로만 보이고, 길찾기나 목록으로는 쓸 수 없다.
 *  - **목록(저장한 장소)**: 지도 앱에서 실제로 쓰는 그것이다. **가져오기가
 *    없다.** 공개 API 도 없어서 바깥에서 써넣을 방법이 아예 없다.
 *
 * 그래서 목록에 담으려면 결국 한 곳씩 눌러 저장하는 수밖에 없다. 대신
 * 이름을 검색해 찾아 들어가는 수고는 없앨 수 있다 — 좌표가 박힌 링크를
 * 그날 순서대로 늘어놓으면, 누르고 **저장** 두 번이면 끝난다.
 *
 * 계정 로그인을 받아 대신 넣어 준다는 바깥 서비스가 있는데 권하지 않는다.
 * 지도뿐 아니라 계정 전체를 넘기는 일이고 구글 약관에도 걸린다.
 */
export function MapsSaveList({ plan, cities }: { plan: Plan; cities: City[] }) {
  const [open, setOpen] = useState(false);
  const cityName = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;
  const cityOf = (slug: string) => cities.find((c) => c.slug === slug);

  const days = plan.days
    .map((d) => ({ ...d, entries: d.entries.filter((e) => e.item.lat !== null && e.item.lon !== null) }))
    .filter((d) => d.entries.length > 0);
  const total = days.reduce((a, d) => a + d.entries.length, 0);
  /* 좌표가 없으면 지도가 엉뚱한 곳을 찍는다. 이름만으로 보내느니 빼고 그 사실을 알린다. */
  const noCoords = plan.stats.items - total;

  return (
    <div className="card" style={{ padding: 14, marginBottom: 20 }}>
      <div className="toolbar" style={{ marginTop: 0, marginBottom: open ? 12 : 0 }}>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          🗺️ 구글 지도에 저장 ({total}곳)
        </button>
      </div>

      {open && (
        <>
          <p className="help" style={{ margin: '0 0 12px' }}>
            구글 지도의 <b>목록</b>에는 한 번에 넣는 길이 없습니다(가져오기도 API 도 없습니다).
            대신 좌표가 박힌 링크를 일자 순서로 늘어놓았습니다 —
            누르고 <b>저장 → 목록 선택</b>, 두 번이면 됩니다. 검색해 찾을 필요가 없습니다.
          </p>

          {days.map((d) => (
            <div key={d.dayIndex} style={{ marginBottom: 14 }}>
              <div className="bundles-head" style={{ marginBottom: 6 }}>
                {d.dayIndex}일차 · {d.date} · {cityName(d.city)}
              </div>
              <ol className="maps-save">
                {d.entries.map((e) => (
                  <li key={e.item.id}>
                    <span className="t">{fmtHm(e.startMin)}</span>
                    <a href={mapsPlaceUrl(e.item, cityOf(e.item.city))} target="_blank" rel="noreferrer">
                      {e.item.name} ↗
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}

          {noCoords > 0 && (
            <p className="help" style={{ margin: '0 0 12px' }}>
              좌표가 없는 {noCoords}곳은 뺐습니다. 이름만으로 링크를 만들면 지도가 엉뚱한 곳을
              찍기 때문입니다 — 대개 정해진 자리가 없는 체험이라 5단계에서 따로 확인하세요.
            </p>
          )}

          <details className="guide">
            <summary>내 지도(My Maps)에 통째로 넣고 싶다면</summary>
            <div className="inner" style={{ padding: 14 }}>
              <p className="help" style={{ margin: 0 }}>
                <b>5단계 · 이동·예약</b>에서 KML 파일을 받아 <b>내 지도</b>로 한 번에 가져올 수 있습니다.
                다만 내 지도와 지도 앱의 <b>목록</b>은 서로 동기화되지 않습니다 —
                내 지도는 앱에서 <b>저장됨 → 지도</b> 에 읽기 전용으로만 보입니다.
                평소 목록을 쓰신다면 위의 링크로 담으시는 편이 낫습니다.
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
