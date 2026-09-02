import { useState } from 'react';
import type { City } from '../types';
import { THEME_ICON, THEME_LABEL } from '../lib/themes';
import { isOff } from '../lib/rendermode';
import type { ThemeId } from '../types';

/** 성격 점수가 3인 테마를 강점으로 본다. 없으면 2점짜리를 쓴다. */
function strongThemes(city: City): ThemeId[] {
  if (!city.profile) return [];
  const entries = Object.entries(city.profile) as [ThemeId, number][];
  const top = entries.filter(([, v]) => v === 3);
  const pool = top.length ? top : entries.filter(([, v]) => v === 2);
  return pool.slice(0, 3).map(([k]) => k);
}

export default function CityCard({
  city, selected, onToggle,
}: { city: City; selected: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  // 사진은 외부(위키미디어)에서 받아온다. 못 받아와도 카드가 깨지지 않게 숨긴다.
  const [photoOk, setPhotoOk] = useState(true);

  return (
    <div className={`city-card${selected ? ' is-selected' : ''}`}>
      <button type="button" className="city-main" onClick={onToggle} aria-pressed={selected}>
        {/*
          스위치를 끄면 아예 그리지 않는다. display:none 으로 숨기기만 하면
          브라우저는 여전히 받아서 디코딩한다 — 이미지 메모리를 의심하는
          중이라면 숨기는 것으로는 아무것도 확인할 수 없다.
        */}
        {city.photo && photoOk && !isOff('photos') && (
          <img
            className="city-photo" src={`${import.meta.env.BASE_URL}${city.photo}`}
            alt="" loading="lazy" decoding="async"
            onError={() => setPhotoOk(false)}
          />
        )}
        <div className="city-body">
          <div className="city-head">
            <span className="city-name">{city.name}</span>
            {city.firstTimer && <span className="badge-first">처음이라면</span>}
            <span className="city-check" aria-hidden>{selected ? '✓' : ''}</span>
          </div>
          <p className="city-tagline">{city.tagline}</p>
          <div className="city-themes">
            {strongThemes(city).map((t) => (
              <span className="tag" key={t}>{THEME_ICON[t]} {THEME_LABEL[t]}</span>
            ))}
          </div>
        </div>
      </button>

      <button type="button" className="city-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? '접기' : '자세히'} {open ? '▴' : '▾'}
      </button>

      {open && (
        <div className="city-detail">
          {city.suitedFor && (
            <p className="detail-row"><b>이런 분께</b> {city.suitedFor}</p>
          )}
          {city.highlights.length > 0 && (
            <p className="detail-row"><b>대표 명소</b> {city.highlights.join(' · ')}</p>
          )}
          {city.season && (
            <p className="detail-row"><b>가기 좋은 때</b> {city.season.best} — {city.season.note}</p>
          )}
          {photoOk && city.photoCredit?.license && (
            <p className="photo-credit">
              사진 {city.photoCredit.author ?? '작자 미상'} / {city.photoCredit.license} ·{' '}
              <a href={city.photoCredit.source} target="_blank" rel="noreferrer">Wikimedia Commons</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
