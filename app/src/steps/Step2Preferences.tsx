import type { Companion, Preferences, ThemeId } from '../types';
import { Block, Chips, Field, Scale, Segmented } from '../components/Controls';
import { THEMES } from '../lib/themes';

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

const TRANSPORT = [
  { value: 'walk', label: '도보' },
  { value: 'metro', label: '지하철·버스' },
  { value: 'taxi', label: '택시' },
  { value: 'car', label: '렌터카' },
  { value: 'bike', label: '자전거' },
];

/** 2단계 — 취향 정보. 13개 항목을 받아 5단계 점수 산정에 쓴다. */
export default function Step2Preferences({
  prefs, onChange,
}: { prefs: Preferences; onChange: (patch: Partial<Preferences>) => void }) {
  const setTheme = (id: ThemeId, v: number) => onChange({ themes: { ...prefs.themes, [id]: v } });
  const toggle = (key: 'foodStyles' | 'transport', v: string) => {
    const cur = prefs[key];
    onChange({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<Preferences>);
  };

  return (
    <>
      <h2>어떤 여행을 좋아하시나요</h2>
      <p className="lede">답할수록 3단계 리스트와 5단계 일정이 정확해집니다. 확신이 없으면 가운데를 두세요.</p>

      <Block title="1. 테마별 관심도" help="0은 빼도 좋음, 3은 이번 여행의 목적. 이 값이 아이템 순서를 가장 크게 바꿉니다.">
        <div className="card">
          {THEMES.map((t) => (
            <div className="theme-row" key={t.id}>
              <div className="name">{t.icon} {t.label}</div>
              <div className="dots">
                {[0, 1, 2, 3].map((v) => (
                  <button
                    key={v} type="button" className="dot"
                    aria-pressed={prefs.themes[t.id] === v}
                    aria-label={`${t.label} 관심도 ${v}`}
                    onClick={() => setTheme(t.id, v)}
                  >{v}</button>
                ))}
              </div>
              <div className="hint">{t.hint}</div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="2. 하루 강도">
        <Field label="하루에 얼마나 채울까요" hint={['아주 여유', '여유', '보통', '빡빡', '아주 빡빡'][prefs.pace - 1]}>
          <Scale value={prefs.pace} low="쉬엄쉬엄" high="많이 보고 싶다" onChange={(v) => onChange({ pace: v })} />
        </Field>
      </Block>

      <Block title="3. 예산" help="1인 기준 하루 활동비입니다. 숙박·항공은 제외합니다.">
        <Segmented
          value={prefs.budget}
          options={[{ value: 'low', label: '알뜰 (~15€)' }, { value: 'mid', label: '보통 (~40€)' }, { value: 'high', label: '넉넉 (제한 없음)' }]}
          onChange={(v) => onChange({ budget: v })}
        />
      </Block>

      <Block title="4. 하루 시작 시각">
        <Segmented
          value={prefs.dayStart}
          options={[{ value: 'early', label: '아침형 08:00' }, { value: 'normal', label: '보통 09:30' }, { value: 'late', label: '늦잠 11:00' }]}
          onChange={(v) => onChange({ dayStart: v })}
        />
      </Block>

      <Block title="5. 밤 시간" help="스페인은 저녁 식사가 21시에 시작해 밤이 깁니다.">
        <Field label="야간 일정 선호" hint={['숙소에서 쉼', '가볍게 한잔', '적극적으로', '밤이 본편'][prefs.nightlife]}>
          <Scale value={prefs.nightlife} min={0} max={3} low="일찍 마무리" high="밤이 좋다" onChange={(v) => onChange({ nightlife: v })} />
        </Field>
      </Block>

      <Block title="6. 유명한 곳 vs 숨은 곳">
        <Field label="어느 쪽에 무게를 둘까요" hint={['대표 명소 위주', '대체로 유명한 곳', '골고루', '현지인 동네 위주'][prefs.discovery]}>
          <Scale value={prefs.discovery} min={0} max={3} low="놓치면 안 되는 곳" high="남들 안 가는 곳" onChange={(v) => onChange({ discovery: v })} />
        </Field>
      </Block>

      <Block title="7. 이동 반경" help="하루에 걷고 이동하는 양을 어느 정도로 볼지 정합니다.">
        <Field label="이동 감내도" hint={['한 동네에서', '가까운 곳 위주', '보통', '넓게 돌아도 좋음', '이동은 상관없음'][prefs.walkTolerance - 1]}>
          <Scale value={prefs.walkTolerance} low="적게 걷고 싶다" high="많이 걸어도 좋다" onChange={(v) => onChange({ walkTolerance: v })} />
        </Field>
      </Block>

      <Block title="8. 동행">
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
      </Block>

      <Block title="9. 음식 취향" help="여러 개 고를 수 있습니다.">
        <Chips values={prefs.foodStyles} options={FOOD_STYLES} onToggle={(v) => toggle('foodStyles', v)} />
      </Block>

      <Block title="10. 체력·이동 제약">
        <Segmented
          value={prefs.mobility}
          options={[{ value: 'normal', label: '제약 없음' }, { value: 'limited', label: '오래 걷기 어려움' }]}
          onChange={(v) => onChange({ mobility: v })}
        />
      </Block>

      <Block title="11. 사진">
        <Field label="사진이 얼마나 중요한가요" hint={['별로', '조금', '중요', '아주 중요'][prefs.photo]}>
          <Scale value={prefs.photo} min={0} max={3} low="상관없음" high="사진이 목적" onChange={(v) => onChange({ photo: v })} />
        </Field>
      </Block>

      <Block title="12. 주 이동 수단">
        <Chips values={prefs.transport} options={TRANSPORT} onToggle={(v) => toggle('transport', v)} />
      </Block>

      <Block title="13. 근교 당일치기" help="거점 도시에서 기차나 버스로 다녀오는 하루입니다.">
        <Field label="근교 당일치기 의향" hint={['도시 안에만', '기회가 되면', '한 번은 가고 싶다', '여러 번 가고 싶다'][prefs.dayTripAppetite]}>
          <Scale value={prefs.dayTripAppetite} min={0} max={3} low="필요 없음" high="꼭 넣어줘" onChange={(v) => onChange({ dayTripAppetite: v })} />
        </Field>
      </Block>
    </>
  );
}
