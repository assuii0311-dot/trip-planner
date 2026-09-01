import type { City, Item, Priorities } from '../types';
import { mapsPlaceUrl, blogSearchUrl } from '../lib/deeplinks';
import { ItemDetail } from './ItemDetail';
import { ItemPhoto } from './ItemPhoto';

const STAR_LABEL = ['', '관심', '가고 싶다', '꼭 간다'];

export function ItemMeta({ item, badge }: { item: Item; badge?: string }) {
  return (
    <div className="meta">
      {/* 테마별 접힌 칸을 없애고 한 목록으로 합쳤으므로, 무엇에 속한
          항목인지는 줄마다 구분자로 붙인다. */}
      {badge && <span className="tag is-cat">{badge}</span>}
      <span className="tag">{Math.round(item.durationMin / 15) * 15}분</span>
      <span className="tag">{item.priceEur === null ? '요금 미상' : item.priceEur === 0 ? '무료' : `€${item.priceEur}`}</span>
      {item.district && <span className="tag">{item.district}</span>}
      {/* 섬 안 다른 동네에서 옮겨 온 것. 도심 한복판과 같은 얼굴로 두면 하루를 잘못 짠다. */}
      {item.islandFrom && <span className="tag is-away">🚗 {item.islandFrom} 방면</span>}
      {item.popularity >= 4 && <span className="tag">대표 명소</span>}
      {item.popularity <= 2 && <span className="tag">숨은 곳</span>}
      {item.energy >= 4 && <span className="tag">체력 필요</span>}
    </div>
  );
}

/**
 * 3단계 담기 — 체크박스로 후보에 넣고, 별점 3단계로 우선순위를 준다.
 * 체크를 풀면 0(제외)이 되어 계획에서 빠진다.
 */
export function ItemRow({
  item, city, priorities, onSet, selectable, badge,
}: {
  item: Item;
  city?: City;
  priorities: Priorities;
  onSet: (id: string, v: 0 | 1 | 2 | 3) => void;
  selectable: boolean;
  /** 줄마다 붙이는 구분자. 테마별 접힌 칸을 없앤 대신 여기에 표기한다. */
  badge?: string;
}) {
  const star = priorities[item.id] ?? 0;
  return (
    <div className="item">
      {selectable ? (
        <input
          type="checkbox"
          checked={star > 0}
          aria-label={`${item.name} 후보에 포함`}
          onChange={(e) => onSet(item.id, e.target.checked ? 2 : 0)}
        />
      ) : (
        <span aria-hidden style={{ fontSize: 18, lineHeight: '22px' }}>·</span>
      )}
      <div className="body">
        {/* 사진은 왼쪽 작은 썸네일로 둔다. 한 테마에 40개가 넘게 들어가므로
            가로로 꽉 찬 사진을 매 줄에 깔면 목록을 훑을 수가 없다. */}
        <div className="item-head">
          <ItemPhoto item={item} />
          <div className="item-text">
            <div className="title">{item.name}</div>
            {/* 테마별로 묶여 여러 도시가 섞여 나온다. 어느 도시인지 없으면 목록을 읽을 수 없다. */}
            <div className="sub">
              {city && <span className="city-badge">{city.name}</span>}
              {item.nameLocal ?? item.nameEn}
            </div>
            {item.summary && <div className="desc">{item.summary}</div>}
          </div>
        </div>
        <ItemMeta item={item} badge={badge} />
        <details className="more">
          <summary>자세히</summary>
          <ItemDetail item={item} />
        </details>
        {selectable && star > 0 && (
          <div className="stars" role="group" aria-label="우선순위">
            {[1, 2, 3].map((v) => (
              <button
                key={v} type="button" className="star"
                aria-pressed={star === v}
                onClick={() => onSet(item.id, v as 1 | 2 | 3)}
              >
                {'★'.repeat(v)} <span style={{ fontSize: 11 }}>{STAR_LABEL[v]}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <a className="tag" style={{ textDecoration: 'none' }} href={mapsPlaceUrl(item, city)} target="_blank" rel="noreferrer">
            지도에서 보기 ↗
          </a>
          {/* 후기 본문은 저장하지 않는다. 저작권·약관 때문이기도 하고,
              굳은 요약본보다 지금 올라온 글이 낫기 때문이기도 하다. */}
          <a className="tag" style={{ textDecoration: 'none', marginLeft: 6 }} href={blogSearchUrl(item, city)} target="_blank" rel="noreferrer">
            블로그 후기 ↗
          </a>
        </div>
      </div>
    </div>
  );
}
