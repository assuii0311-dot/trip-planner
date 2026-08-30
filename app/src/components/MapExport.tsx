import { useState } from 'react';
import type { City, Item, Plan } from '../types';
import { buildKml, downloadKml, groupByCity, groupByDay } from '../lib/mapexport';
import type { KmlResult } from '../lib/mapexport';

/**
 * 고른 장소를 구글 '내 지도' 로 옮긴다.
 *
 * 구글은 외부에서 지도에 장소를 써넣는 길을 열어 두지 않았다. '내 지도' 에도
 * 구글 지도의 '저장한 장소' 에도 쓰기 API 가 없다. 공식으로 지원되는 유일한
 * 경로가 파일 가져오기여서, 한 번에 통째로 넣을 수 있는 KML 을 만들어 준다.
 * 어느 지도에 넣을지는 가져오기 화면에서 사용자가 정한다.
 */
export function MapExport({
  allItems, plan, cities, attribution, tripName, fileBase,
}: {
  /** 고른 도시의 전체 아이템. */
  allItems: Item[];
  /** 선택한 계획. 없으면 경로 내보내기는 막는다. */
  plan: Plan | null;
  cities: City[];
  attribution: string[];
  /** 지도 안에 보일 이름. 한글이어도 된다. */
  tripName: string;
  /**
   * 파일 이름의 앞부분. 반드시 ASCII 여야 한다.
   *
   * 브라우저는 <a download> 에 한글이 들어가면 이름을 통째로 버리고
   * 'download' 로 저장한다 — 확장자까지 사라져서 구글이 KML 로 알아보지
   * 못하고 가져오기가 실패한다. 실제로 확인한 동작이다.
   */
  fileBase: string;
}) {
  const [done, setDone] = useState<{ label: string; res: KmlResult } | null>(null);

  const run = (label: string, res: KmlResult, file: string) => {
    downloadKml(res.xml, file);
    setDone({ label, res });
  };

  const exportAll = () => run(
    '전체 장소',
    buildKml(`${tripName} — 전체 장소`, groupByCity(allItems, cities), cities, attribution),
    `${fileBase}-all.kml`,
  );

  const exportPlan = () => {
    if (!plan) return;
    run(
      '여행 경로',
      buildKml(`${tripName} — 여행 경로`, groupByDay(plan, cities), cities, attribution),
      `${fileBase}-route.kml`,
    );
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <p className="help" style={{ margin: '0 0 12px' }}>
        구글은 바깥에서 지도에 장소를 써넣는 길을 열어 두지 않았습니다. 대신 <b>파일 가져오기</b>는
        공식으로 지원하므로, 한 번에 통째로 넣을 수 있는 파일을 만들어 드립니다.
        어느 지도에 넣을지는 가져오기 화면에서 직접 고르시게 됩니다.
      </p>

      <div className="toolbar" style={{ marginTop: 0 }}>
        <button type="button" onClick={exportAll} disabled={allItems.length === 0}>
          ① 전체 장소 ({allItems.length}곳)
        </button>
        <button type="button" onClick={exportPlan} disabled={!plan}>
          ② 여행 경로만 ({plan?.stats.items ?? 0}곳)
        </button>
      </div>
      <p className="help" style={{ margin: '10px 0 0' }}>
        ①은 고르신 도시의 장소 전부를 <b>도시별</b>로, ②는 이 계획에 들어간 곳만 <b>일자별</b>로
        묶습니다. 현지에서는 ②를 켜 두고 그날 것만 보시는 편이 편합니다.
      </p>

      {done && (
        <div className={done.res.warnings.length ? 'notice' : 'card'} style={{ padding: 12, marginTop: 12 }}>
          <b>{done.label} 파일을 받았습니다</b> — {done.res.placed}곳 · {done.res.groups}개 레이어
          {done.res.skipped > 0 && (
            <div style={{ marginTop: 6 }}>
              좌표가 없는 {done.res.skipped}곳은 지도에 찍을 수 없어 뺐습니다.
              대부분 정해진 자리가 없는 식당·체험이라 앱에서 지도 링크로 확인하셔야 합니다.
            </div>
          )}
          {done.res.warnings.map((w) => <div key={w} style={{ marginTop: 6 }}>⚠ {w}</div>)}
        </div>
      )}

      <details className="guide" style={{ marginTop: 12 }}>
        <summary>구글 내 지도에 넣는 방법</summary>
        <div className="inner" style={{ padding: 14 }}>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, fontSize: 13.5 }}>
            <li>브라우저에서 <a href="https://www.google.com/mymaps" target="_blank" rel="noreferrer">google.com/mymaps</a> 를 엽니다</li>
            <li><b>새 지도 만들기</b> — 또는 이미 쓰고 계신 지도를 엽니다</li>
            <li>왼쪽 패널에서 <b>가져오기</b> 를 누릅니다</li>
            <li>방금 받은 <b>.kml</b> 파일을 고릅니다</li>
          </ol>
          <p className="help" style={{ marginTop: 10 }}>
            아이패드·아이폰에서는 받은 파일이 <b>파일</b> 앱에 저장됩니다. 내 지도는 앱이 없어
            사파리에서 열어야 하고, 화면이 좁으면 <b>데스크톱 웹사이트 요청</b> 을 켜야 가져오기 버튼이 보입니다.
          </p>
          <p className="help" style={{ marginTop: 8 }}>
            장소 이름을 누르면 저희가 쓴 설명(왜 가는가·예약·휴관·요금)이 그대로 나옵니다.
            레이어는 왼쪽 목록에서 체크를 풀어 하나씩 끄고 켤 수 있습니다.
          </p>
        </div>
      </details>
    </div>
  );
}
