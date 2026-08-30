import type { TripState } from '../types';
import { agoText } from './SaveStatus';

const STEP_NAME = ['기초 정보', '취향', '아이템', '우선순위', '계획', '교통·예약'];

/**
 * 지난번에 하던 것이 복원됐음을 알린다.
 *
 * 복원은 원래도 되고 있었지만 아무 말이 없어서, 사용자는 자기가 뭘 하던
 * 중이었는지 화면을 뒤져 알아내야 했다. 무엇이 어디까지 복원됐는지 한 줄로
 * 말해 주고, 아니라면 새로 시작할 길을 같은 자리에 둔다.
 *
 * 막지 않는다 — 배너일 뿐이고 앱은 이미 이어서 하는 상태다.
 */
export function ResumeBanner({
  state, now, onDismiss, onReset,
}: {
  state: TripState;
  now: number;
  onDismiss: () => void;
  onReset: () => void;
}) {
  const picked = Object.values(state.priorities).filter((v) => v > 0).length;
  const parts = [`${state.step}단계 · ${STEP_NAME[state.step - 1]}`];
  if (state.basics.cities.length) parts.push(`도시 ${state.basics.cities.length}곳`);
  if (picked) parts.push(`아이템 ${picked}개 선택`);

  return (
    <div className="resume" role="status">
      <div className="resume-body">
        <div className="resume-title">
          이어서 하고 계십니다
          {state.savedAt && <span className="resume-when"> · {agoText(state.savedAt, now)} 저장</span>}
        </div>
        <div className="resume-detail">{parts.join(' · ')}</div>
      </div>
      <div className="resume-acts">
        <button type="button" onClick={onDismiss}>확인</button>
        <button type="button" className="resume-reset" onClick={onReset}>새로 시작</button>
      </div>
    </div>
  );
}

/**
 * 홈 화면에 추가하지 않은 iOS 사파리는 마지막 방문에서 7일이 지나면
 * 저장분을 지운다. 며칠에 걸쳐 나눠 고를 사람에게는 실제로 일어나는 일이라,
 * 고른 것이 쌓이기 시작하면 한 번 알려 준다.
 */
export function StorageWarning({ onExport, onDismiss }: { onExport: () => void; onDismiss: () => void }) {
  return (
    <div className="notice storage-warn">
      <p style={{ margin: '0 0 8px' }}>
        <b>며칠에 걸쳐 고르실 계획이라면</b> — 지금은 브라우저에만 저장되고 있습니다.
        iOS 사파리는 홈 화면에 추가하지 않은 사이트의 저장분을 <b>7일 뒤 지웁니다.</b>
      </p>
      <p style={{ margin: '0 0 10px' }}>
        공유 버튼 → <b>홈 화면에 추가</b> 를 하시면 지워지지 않습니다.
        지금 바로 백업 파일을 받아 두셔도 됩니다.
      </p>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <button type="button" onClick={onExport}>백업 파일 받기</button>
        <button type="button" onClick={onDismiss}>알겠습니다</button>
      </div>
    </div>
  );
}
