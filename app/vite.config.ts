import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * 배포마다 달라지는 판 번호.
 *
 * 서비스 워커 캐시 이름에 넣는다. 예전에는 이름이 'trip-planner-v1' 로
 * 고정이라, 한 번 캐시에 들어간 데이터는 새 배포가 나가도 영원히 그대로였다.
 * 자바스크립트만 새것으로 바뀌고 데이터는 몇 주 전 것을 쓰는 상태가 된다.
 */
const BUILD_ID = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

// GitHub Pages 는 /<repo>/ 아래에 배포되므로 base 를 맞춘다.
// 다른 곳에 올릴 때는 BASE_PATH 환경변수로 덮어쓴다.
/*
 * 나라마다 주소가 다르다.
 *
 *   /            → 나라 고르는 곳 (index.html)
 *   /spain/      → 스페인 계획   (spain/index.html)
 *   /japan/      → 일본 계획     (japan/index.html)
 *
 * 나라 페이지들은 같은 앱 코드를 쓰므로 번들이 통째로 복사되지는 않는다 —
 * Vite 가 공통 덩어리를 나눠 두고 세 페이지가 같은 파일을 가리킨다.
 * 나라를 붙일 때는 여기에 한 줄, `src/lib/countries.ts` 에 한 줄이면 된다.
 */
const pages = ['spain', 'japan'];

export default defineConfig({
  base: process.env.BASE_PATH ?? '/0829_kos_basic_001/',
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(pages.map((p) => [p, resolve(__dirname, p, 'index.html')])),
      },
    },
  },
});
