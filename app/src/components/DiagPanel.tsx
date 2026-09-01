import { useState } from 'react';
import { diagReport } from '../lib/diag';

/**
 * 진단 정보를 꺼내는 자리.
 *
 * 아이패드 사파리에는 개발자 콘솔이 없다. 무엇이 잘못됐는지 알아내려면
 * 사용자가 화면에서 바로 복사해 보낼 수 있어야 한다. 눈에 띄지 않게 두되,
 * 필요할 때 두 번 안에 닿게 한다.
 */
export function DiagPanel() {
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => setText(await diagReport());

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied('복사했습니다');
    } catch {
      // 사파리는 사용자 동작 밖에서 클립보드를 막는다. 그때는 직접 고르게 한다.
      setCopied('복사가 막혔습니다 — 아래 글을 길게 눌러 전체 선택해 주세요');
    }
  };

  const download = () => {
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `진단-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <details className="diag" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void load(); }}>
      <summary>문제가 있나요 — 진단 정보 보내기</summary>
      <p className="help" style={{ margin: '8px 0 10px' }}>
        눌렀는데 반응이 없거나 화면이 이상하면, 아래 내용을 복사해 보내 주세요.
        어디를 누르셨는지와 오류만 담기며 개인 정보는 들어가지 않습니다.
      </p>
      <div className="crash-btns" style={{ marginBottom: 10 }}>
        <button type="button" className="primary" onClick={() => void copy()}>복사하기</button>
        <button type="button" onClick={download}>파일로 받기</button>
        <button type="button" onClick={() => void load()}>새로 읽기</button>
      </div>
      {copied && <p className="help" style={{ margin: '0 0 8px' }}>{copied}</p>}
      <textarea className="diag-text" readOnly rows={14} value={text ?? '읽는 중…'} />
    </details>
  );
}
