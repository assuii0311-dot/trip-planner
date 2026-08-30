import type { Item } from '../types';
import { PhotoCredit } from './ItemPhoto';

/**
 * 아이템 설명의 뒷부분 — 왜 가는가 / 실무 정보 / 주의점.
 * 목록에서는 summary 한 줄만 보이고, 펼쳤을 때 이 블록이 나온다.
 *
 * 실무 정보는 빈 줄이 생기더라도 아는 것만 적는다.
 * 예약 여부나 붐비는 시간을 그럴듯하게 지어내면, 그 한 줄 때문에
 * 현장에서 못 들어가는 사람이 생긴다.
 */
export function ItemDetail({ item }: { item: Item }) {
  const p = item.practical;
  const rows: [string, string][] = [];
  if (p.booking) rows.push(['예약', p.booking]);
  if (p.closed) rows.push(['휴관', p.closed]);
  if (p.busy) rows.push(['붐빔', p.busy]);
  rows.push(['소요', p.duration]);
  rows.push(['요금', p.price ?? '정보 없음 — 지도에서 확인하세요']);
  if (p.hours) rows.push(['영업시간', p.hours]);

  return (
    <div className="detail">
      {item.why && <p className="why">{item.why}</p>}
      <dl className="practical">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {item.caution && <p className="caution">⚠ {item.caution}</p>}
      {/* CC BY-SA 이행 — 사진을 쓴 이상 저작자와 라이선스는 반드시 보여야 한다. */}
      <PhotoCredit item={item} />
    </div>
  );
}
