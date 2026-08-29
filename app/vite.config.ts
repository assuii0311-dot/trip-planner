import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 는 /<repo>/ 아래에 배포되므로 base 를 맞춘다.
// 다른 곳에 올릴 때는 BASE_PATH 환경변수로 덮어쓴다.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/0829_kos_basic_001/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
