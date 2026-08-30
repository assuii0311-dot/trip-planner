import type { SaveResult } from '../lib/store';

/** '방금' / '3분 전' / '어제'. 초 단위까지 보여줄 이유가 없다. */
export function agoText(from: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - from) / 1000));
  if (sec < 45) return '방금';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.round(hour / 24);
  return day === 1 ? '어제' : `${day}일 전`;
}

/**
 * 저장 상태 한 줄.
 *
 * 자동 저장은 원래도 돌고 있었지만 화면에 아무 표시가 없었다. 그러면
 * 사용자는 앱을 닫아도 되는지 알 수 없어, 결국 한 번에 끝내려 하게 된다.
 * 아이템이 2천 개인 앱에서 그건 무리다.
 *
 * 저장이 실패했을 때는 조용히 넘어가지 않고 눈에 띄게 알린다.
 */
export function SaveStatus({ result, now }: { result: SaveResult | null; now: number }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <span className="save-status is-bad" role="status">
        ⚠ 저장 안 됨 — {result.reason}
      </span>
    );
  }
  return (
    <span className="save-status" role="status">
      저장됨 · {agoText(result.at, now)}
    </span>
  );
}
