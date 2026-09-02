import { useState } from 'react';
import type { Item } from '../types';
import { photoUrl, photoSourceUrl } from '../lib/deeplinks';
import { isOff } from '../lib/rendermode';

/**
 * 아이템 대표 사진.
 *
 * 대표급은 앱에 함께 들어 있어 오프라인에서도 뜨지만, 나머지는 커먼즈에서
 * 받아오므로 망이 없으면 실패한다. 실패하면 자리를 차지하지 않고 사라진다 —
 * 깨진 이미지 아이콘이 목록에 줄줄이 남는 것보다 낫다.
 *
 * 커먼즈 사진은 대부분 CC BY-SA 라 저작자와 라이선스를 함께 보여야 한다.
 * 목록 썸네일에는 자리가 없으므로 펼친 상세(ItemDetail)에서 표기한다.
 */
export function ItemPhoto({ item, size = 'thumb' }: { item: Item; size?: 'thumb' | 'wide' }) {
  const [ok, setOk] = useState(true);
  const src = photoUrl(item);
  // 스위치를 끄면 아예 그리지 않는다. 숨기기만 해서는 받아서 디코딩하는 것을 막지 못한다.
  if (!src || !ok || isOff('photos')) return null;
  return (
    <img
      className={size === 'thumb' ? 'item-photo' : 'item-photo-wide'}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setOk(false)}
    />
  );
}

/** 사진 저작자 표기 — CC BY-SA 이행. 사진을 실제로 보여줄 때만 함께 나온다. */
export function PhotoCredit({ item }: { item: Item }) {
  if (!item.photo) return null;
  return (
    <p className="photo-credit">
      사진 {item.photo.author ?? '작자 미상'} / {item.photo.license} ·{' '}
      <a href={photoSourceUrl(item.photo.file)} target="_blank" rel="noreferrer">
        Wikimedia Commons
      </a>
    </p>
  );
}
