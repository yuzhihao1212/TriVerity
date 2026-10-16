// Test helper: transpile a src/*.ts module with `typescript` (as tests/sidebar.test.mjs does)
// and import it from a data URL. Relative runtime imports ("./x") are transpiled the same way,
// recursively, so a pure module may import another pure module. Type-only imports are erased.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const cache = new Map();

async function url(name) {
  if (cache.has(name)) return cache.get(name);
  const promise = (async () => {
    const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
    let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    for (const dep of new Set([...outputText.matchAll(/from "\.\/([\w-]+)"/g)].map(match => match[1]))) {
      outputText = outputText.replaceAll(`from "./${dep}"`, `from "${await url(dep)}"`);
    }
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  })();
  cache.set(name, promise);
  return promise;
}

/** `await load('gpsStory')` -> the module's exports. */
export async function load(name) {
  return import(await url(name));
}
