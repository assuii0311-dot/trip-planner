import { todayISO } from '../lib/caldate';
import { useState } from 'react';
import { diagReport } from '../lib/diag';
import { newerBuild } from '../lib/update';
import { hardRefetch } from '../lib/refetch';
import { SWITCHES, isOff, offList, urlWith } from '../lib/rendermode';

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
  const [stale, setStale] = useState(false);

  const load = async () => {
    setText(await diagReport());
    // 진단을 열었다는 것은 무언가 이상하다는 뜻이다. 낡은 판이면 그것부터.
    setStale(!!(await newerBuild()));
  };

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
    a.download = `진단-${todayISO()}-${new Date().toLocaleTimeString('ko-KR', { hour12: false }).replace(/:/g, '')}.txt`;
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

      {/*
        화면이 비거나 눌리지 않는 문제는 이 기기에서만 보인다 — 사파리 엔진으로
        같은 흐름을 돌려도 DOM 은 멀쩡하다. 그러니 원인은 여기서 좁혀야 한다.
        하나씩 끄면서 어느 것에서 멀쩡해지는지 보는 것이 가장 빠르다.
      */}
      <p className="diag-why">
        <b>화면이 비거나 안 눌리나요?</b> 아래를 눌러 하나씩 꺼 보세요.
        먼저 <b>전부 끄기</b>로 증상이 사라지는지 보고, 사라지면 하나씩
        되돌려 범인을 찾습니다. 어떤 조합이었는지는 아래 기록에 함께 남습니다.
      </p>
      <div className="diag-modes">
        <a className={offList().length === SWITCHES.length ? 'is-on' : ''}
          href={urlWith(SWITCHES.map((x) => x.id))}>전부 끄기</a>
        {SWITCHES.map((sw) => (
          <a key={sw.id} className={isOff(sw.id) ? 'is-on' : ''} href={urlWith([sw.id])}
            title={sw.why}>{sw.label}만 끄기</a>
        ))}
        {offList().length > 0 && <a href={urlWith([])}>원래대로</a>}
      </div>
      {stale && (
        <div className="notice" style={{ marginBottom: 10 }}>
          <b>지금 화면은 예전 판입니다.</b>
          <p className="help" style={{ margin: '6px 0 10px' }}>
            서버에는 더 새 판이 올라와 있습니다. 먼저 새로 받아 보세요 —
            이미 고쳐진 문제일 수 있습니다.
          </p>
          <div className="crash-btns">
            <button type="button" className="primary" onClick={() => void hardRefetch()}>
              새 판으로 받기
            </button>
          </div>
        </div>
      )}
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
