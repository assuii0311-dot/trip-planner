import type { City, Companion, Preferences, ThemeId } from '../types';
import { Block, Chips, Field, Scale, Segmented } from '../components/Controls';
import { THEMES } from '../lib/themes';
import { describeTaste } from '../lib/taste';

const FOOD_STYLES = [
  { value: 'local', label: '현지 가정식' },
  { value: 'tapas', label: '타파스·바 순례' },
  { value: 'fine', label: '파인다이닝' },
  { value: 'street', label: '시장·길거리' },
  { value: 'seafood', label: '해산물' },
  { value: 'vegetarian', label: '채식 가능' },
  { value: 'cafe', label: '카페·디저트' },
  { value: 'wine', label: '와이너리·와인바' },
];

/**
 * 2단계 — 도시 선택에서 읽어낸 취향을 확인하고, 읽어낼 수 없는 것만 묻는다.
 *
 * 테마 관심도는 1단계 도시 선택에서 역산했다. 빈 설문을 채우게 하는 대신
 * "이렇게 보입니다"를 제시하고 틀린 곳만 고치게 한다.
 * 강도·예산·동행·음식 제한·밤은 도시 선택에 담기지 않으므로 직접 묻는다.
 */
export default function Step2Preferences({
  prefs, selectedCities, inferred, onChange,
}: {
  prefs: Preferences;
  selectedCities: City[];
  inferred: Record<ThemeId, number>;
  onChange: (patch: Partial<Preferences>) => void;
}) {
  const setTheme = (id: ThemeId, v: number) => onChange({ themes: { ...prefs.themes, [id]: v } });
  const toggle = (key: 'foodStyles' | 'transport', v: string) => {
    const cur = prefs[key];
    onChange({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<Preferences>);
  };
  const changed = THEMES.filter((t) => prefs.themes[t.id] !== inferred[t.id]).length;

  return (
    <>
      <h2>이런 여행을 원하시는 것 같습니다</h2>
      <p className="lede">{describeTaste(prefs.themes, selectedCities)}</p>

      <Block
        title="맞는지 확인해 주세요"
        help="고르신 도시에서 읽은 값입니다. 다르면 바꾸세요. 0은 빼도 좋음, 3은 이번 여행의 목적입니다."
      >
        <div className="card">
          {THEMES.map((t) => {
            const v = prefs.themes[t.id];
            const moved = v !== inferred[t.id];
            return (
              <div className="theme-row" key={t.id}>
                <div className="name">
                  {t.icon} {t.label}
                  {moved && <span className="tag" style={{ marginLeft: 6 }}>수정함</span>}
                </div>
                <div className="dots">
                  {[0, 1, 2, 3].map((n) => (
                    <button
                      key={n} type="button" className="dot"
                      aria-pressed={v === n}
                      aria-label={`${t.label} 관심도 ${n}`}
                      onClick={() => setTheme(t.id, n)}
                    >{n}</button>
                  ))}
                </div>
                <div className="hint">{t.hint}</div>
              </div>
            );
          })}
        </div>
        {changed > 0 && (
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button type="button" onClick={() => onChange({ themes: { ...inferred } })}>
              읽은 값으로 되돌리기 ({changed}개 수정됨)
            </button>
          </div>
        )}
      </Block>

      <h3 style={{ marginTop: 28, marginBottom: 4 }}>도시 선택으로는 알 수 없는 것</h3>
      <p className="help" style={{ marginBottom: 18 }}>
        같은 바르셀로나라도 빡빡하게 다닐지 여유롭게 다닐지는 사람마다 다릅니다. 다섯 가지만 여쭙겠습니다.
      </p>

      <Block title="1. 하루 강도">
        <Field label="하루에 얼마나 채울까요" hint={['아주 여유', '여유', '보통', '빡빡', '아주 빡빡'][prefs.pace - 1]}>
          <Scale value={prefs.pace} low="쉬엄쉬엄" high="많이 보고 싶다" onChange={(v) => onChange({ pace: v })} />
        </Field>
      </Block>

      <Block title="2. 예산" help="1인 기준 하루 활동비입니다. 숙박·항공은 제외합니다.">
        <Segmented
          value={prefs.budget}
          options={[
            { value: 'low', label: '알뜰 (~15€)' },
            { value: 'mid', label: '보통 (~40€)' },
            { value: 'high', label: '넉넉 (제한 없음)' },
          ]}
          onChange={(v) => onChange({ budget: v })}
        />
      </Block>

      <Block title="3. 동행" help="아이나 부모님이 함께라면 체력 소모가 큰 일정을 줄입니다.">
        <Segmented
          value={prefs.companion}
          options={[
            { value: 'solo', label: '혼자' }, { value: 'couple', label: '둘이' },
            { value: 'friends', label: '친구' }, { value: 'family', label: '아이 동반' },
          ] as { value: Companion; label: string }[]}
          onChange={(v) => onChange({ companion: v })}
        />
        <div style={{ marginTop: 8 }}>
          <Segmented
            value={prefs.companion === 'parents' ? 'parents' : 'other'}
            options={[{ value: 'other', label: '위에서 선택' }, { value: 'parents', label: '부모님 동반' }]}
            onChange={(v) => v === 'parents' && onChange({ companion: 'parents' })}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Segmented
            value={prefs.mobility}
            options={[{ value: 'normal', label: '오래 걸어도 괜찮음' }, { value: 'limited', label: '오래 걷기 어려움' }]}
            onChange={(v) => onChange({ mobility: v })}
          />
        </div>
      </Block>

      <Block title="4. 음식" help="여러 개 고를 수 있습니다. 제한이 있으면 꼭 표시해 주세요.">
        <Chips values={prefs.foodStyles} options={FOOD_STYLES} onToggle={(v) => toggle('foodStyles', v)} />
      </Block>

      <Block title="5. 밤 시간" help="스페인은 저녁 식사가 21시에 시작해 밤이 깁니다.">
        <Field label="야간 일정 선호" hint={['숙소에서 쉼', '가볍게 한잔', '적극적으로', '밤이 본편'][prefs.nightlife]}>
          <Scale value={prefs.nightlife} min={0} max={3} low="일찍 마무리" high="밤이 좋다" onChange={(v) => onChange({ nightlife: v })} />
        </Field>
      </Block>

      <details className="guide" style={{ marginTop: 20 }}>
        <summary>세부 설정 (기본값으로 두어도 됩니다)</summary>
        <div className="inner" style={{ padding: '4px 14px 14px' }}>
          <Block title="유명한 곳 ↔ 숨은 곳">
            <Field label="어느 쪽에 무게를 둘까요" hint={['대표 명소 위주', '대체로 유명한 곳', '골고루', '현지인 동네 위주'][prefs.discovery]}>
              <Scale value={prefs.discovery} min={0} max={3} low="놓치면 안 되는 곳" high="남들 안 가는 곳" onChange={(v) => onChange({ discovery: v })} />
            </Field>
          </Block>
          <Block title="하루 시작 시각">
            <Segmented
              value={prefs.dayStart}
              options={[
                { value: 'early', label: '08:00' }, { value: 'normal', label: '09:30' }, { value: 'late', label: '11:00' },
              ]}
              onChange={(v) => onChange({ dayStart: v })}
            />
          </Block>
          <Block title="이동 반경">
            <Field label="이동 감내도" hint={['한 동네에서', '가까운 곳 위주', '보통', '넓게 돌아도 좋음', '이동은 상관없음'][prefs.walkTolerance - 1]}>
              <Scale value={prefs.walkTolerance} low="적게 걷고 싶다" high="많이 걸어도 좋다" onChange={(v) => onChange({ walkTolerance: v })} />
            </Field>
          </Block>
          <Block title="사진">
            <Field label="사진이 얼마나 중요한가요" hint={['별로', '조금', '중요', '아주 중요'][prefs.photo]}>
              <Scale value={prefs.photo} min={0} max={3} low="상관없음" high="사진이 목적" onChange={(v) => onChange({ photo: v })} />
            </Field>
          </Block>
        </div>
      </details>
    </>
  );
}
