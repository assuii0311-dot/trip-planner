/** TypeScript 로 쓴 시뮬레이션을 esbuild 로 묶어 실행한다. */
import { build } from 'esbuild';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

await mkdir('node_modules/.sim', { recursive: true });
const out = 'node_modules/.sim/simulate.mjs';
await build({
  entryPoints: ['scripts/simulate.ts'],
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  outfile: out, logLevel: 'error',
});
await import(pathToFileURL(out).href);
await rm(out, { force: true });
