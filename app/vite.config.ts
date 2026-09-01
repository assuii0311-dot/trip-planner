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
export default defineConfig({
  base: process.env.BASE_PATH ?? '/0829_kos_basic_001/',
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { outDir: 'dist', sourcemap: false },
});
