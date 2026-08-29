import type { City, Item, Priorities } from '../types';
import { mapsPlaceUrl } from '../lib/deeplinks';
import { ItemDetail } from './ItemDetail';

const STAR_LABEL = ['', '관심', '가고 싶다', '꼭 간다'];

export function ItemMeta({ item }: { item: Item }) {
  return (
    <div className="meta">
      <span className="tag">{Math.round(item.durationMin / 15) * 15}분</span>
      <span className="tag">{item.priceEur === null ? '요금 미상' : item.priceEur === 0 ? '무료' : `€${item.priceEur}`}</span>
      {item.district && <span className="tag">{item.district}</span>}
      {item.popularity >= 4 && <span className="tag">대표 명소</span>}
      {item.popularity <= 2 && <span className="tag">숨은 곳</span>}
      {item.energy >= 4 && <span className="tag">체력 필요</span>}
    </div>
  );
}

/**
 * 4단계 우선순위 입력 — 체크박스로 후보에 넣고, 별점 3단계로 우선순위를 준다.
 * 체크를 풀면 0(제외)이 되어 계획에서 빠진다.
 */
export function ItemRow({
  item, city, priorities, onSet, selectable,
}: {
  item: Item;
  city?: City;
  priorities: Priorities;
  onSet: (id: string, v: 0 | 1 | 2 | 3) => void;
  selectable: boolean;
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
        <div className="title">{item.name}</div>
        <div className="sub">{item.nameLocal ?? item.nameEn}{item.city !== city?.slug ? '' : ''}</div>
        {item.summary && <div className="desc">{item.summary}</div>}
        <ItemMeta item={item} />
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
        </div>
      </div>
    </div>
  );
}
