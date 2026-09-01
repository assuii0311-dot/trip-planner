import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { hardRefetch } from '../lib/refetch';
import { DiagPanel } from './DiagPanel';

/**
 * 화면이 하얗게 비지 않게 한다.
 *
 * 리액트는 그리는 중에 오류가 나면 트리를 통째로 버린다. 받아 주는 곳이
 * 없으면 남는 것은 빈 `<div id="root">` 하나다 — 사용자에게는 '화면이 안
 * 뜬다', '눌러도 아무 반응이 없다' 로 보이고, 무엇이 잘못됐는지도, 어떻게
 * 빠져나오는지도 알 수가 없다.
 *
 * 그래서 세 가지를 준다.
 *
 * 1. 무엇이 잘못됐는지 (개발자에게 보낼 수 있게 오류 문구 그대로)
 * 2. 지금까지 만든 계획을 파일로 빼내는 길 — 고장난 상태에서도 잃지 않게
 * 3. 빠져나오는 길 — 다시 그려 보기 / 받아 둔 것 비우고 새로 받기 /
 *    그래도 안 되면 처음부터
 *
 * 특히 '비우고 새로 받기' 가 중요하다. 서비스 워커가 예전 데이터를 쥐고
 * 있어서 나는 고장이라면 그것만으로 풀린다.
 */
export class Crashguard extends Component<
  { children: ReactNode; onExport: () => void; onReset: () => void },
  { err: Error | null }
> {
  state: { err: Error | null } = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // 콘솔에는 남긴다. 사용자가 캡처를 보내 줄 때 이것이 단서가 된다.
    console.error('화면을 그리는 중 오류', err, info.componentStack);
  }

  render() {
    const { err } = this.state;
    if (!err) return this.props.children;
    return (
      <div className="app">
        <main>
          <div className="crash">
            <h2>화면을 그리다 멈췄습니다</h2>
            <p className="lede">
              지금까지 고르신 것은 남아 있습니다. 아래 순서대로 해 보세요.
            </p>
            <ol className="crash-steps">
              <li><b>다시 그려 보기</b> — 일시적인 문제라면 이걸로 돌아옵니다.</li>
              <li><b>받아 둔 것 비우고 새로 받기</b> — 예전 판 데이터가 남아 있을 때 풉니다.</li>
              <li><b>처음부터</b> — 위 둘로 안 되면. 고르신 것은 사라집니다.</li>
            </ol>
            <div className="crash-btns">
              <button type="button" className="primary" onClick={() => this.setState({ err: null })}>
                다시 그려 보기
              </button>
              <button type="button" onClick={() => void hardRefetch()}>
                받아 둔 것 비우고 새로 받기
              </button>
              <button type="button" onClick={this.props.onExport}>백업 파일 받기</button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('처음부터 다시 시작할까요? 지금까지 고른 것은 사라집니다.')) {
                    this.props.onReset();
                  }
                }}
              >
                처음부터
              </button>
            </div>
            <details className="crash-detail">
              <summary>오류 내용</summary>
              <pre>{err.message}{'\n\n'}{err.stack ?? ''}</pre>
            </details>
            {/* 여기까지 왔다면 보낼 것이 있다. 꺼내는 길을 이 화면에도 둔다. */}
            <DiagPanel />
          </div>
        </main>
      </div>
    );
  }
}
