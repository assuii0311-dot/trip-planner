import { useState } from 'react';
import { diagReport, lastRunTrouble } from '../lib/diag';

/**
 * 직전 화면에서 무슨 일이 있었는지 먼저 말해 준다.
 *
 * 화면이 멈추거나 검게 되면 사용자는 아무것도 누를 수 없다 — 아래쪽 진단
 * 패널까지 내려가 펼치는 것은 애초에 불가능하다. 할 수 있는 것은 새로고침
 * 하거나 탭을 닫고 다시 여는 것뿐이다.
 *
 * 그러니 다시 열렸을 때 **앱이 먼저** 말해야 한다. 기록은 남아 있고
 * (localStorage), 여기서 바로 복사할 수 있다. 사용자가 문제를 기억해 두었다가
 * 찾아 들어오게 만들면 안 된다.
 */
export function TroubleBanner() {
  const [seen] = useState(() => lastRunTrouble());
  const [text, setText] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  if (!seen || hidden) return null;

  const grab = async () => {
    const t = await diagReport();
    setText(t);
    try {
      await navigator.clipboard.writeText(t);
      setMsg('복사했습니다. 그대로 붙여넣어 보내 주세요.');
    } catch {
      setMsg('복사가 막혔습니다 — 아래 글을 길게 눌러 전체 선택해 주세요.');
    }
  };

  return (
    <div className="notice trouble">
      <b>
        직전에 화면이 {seen.stalls > 0 ? '멈춘' : '이상했던'} 기록이 있습니다
        {seen.when !== '직전' && ` (${seen.when})`}
      </b>
      <p className="help" style={{ margin: '6px 0 10px' }}>
        멈춤 {seen.stalls}건 · 오류 {seen.errors}건이 기록되어 있습니다.
        무엇이 있었는지 담겨 있으니 아래를 눌러 보내 주세요. 어디를 누르셨는지와
        오류만 담기며 개인 정보는 들어가지 않습니다.
      </p>
      <div className="crash-btns">
        <button type="button" className="primary" onClick={() => void grab()}>
          기록 복사하기
        </button>
        <button type="button" onClick={() => setHidden(true)}>닫기</button>
      </div>
      {msg && <p className="help" style={{ margin: '10px 0 0' }}>{msg}</p>}
      {text && <textarea className="diag-text" readOnly rows={12} value={text} style={{ marginTop: 10 }} />}
    </div>
  );
}
