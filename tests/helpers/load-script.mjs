import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const PROJECT_ROOT = resolve(__dirname, '../..');

/**
 * Load a browser JS file into a Node vm sandbox and return its globals.
 *
 * **Test-only helper — not used in production code.**
 *
 * In V8's vm module, `const` / `let` declarations are script-scoped and
 * do NOT become properties of the sandbox context — only `var` does.
 * To surface IIFE-defined constants like `const FileExtractor = (function(){ … })();`
 * we rewrite top-level `const`/`let` to `var` before execution.
 * This intentionally changes scoping semantics; it is acceptable here
 * because the sandbox is single-script and disposable.
 *
 * `typeof window !== 'undefined'` guards evaluate to false so
 * `window.X` assignments are skipped automatically.
 *
 * @param {string} relativePath - Path relative to project root (e.g. 'js/file-extractor.js')
 * @param {object} extraGlobals - Additional globals to inject into the sandbox
 * @returns {object} The sandbox context containing all top-level declarations
 */
export function loadScript(relativePath, extraGlobals = {}) {
  const filePath = resolve(PROJECT_ROOT, relativePath);
  const code = readFileSync(filePath, 'utf8');

  // Rewrite top-level const/let → var so declarations attach to the sandbox.
  // Only matches lines starting at column 0 (top-level), not nested ones.
  const patchedCode = code.replace(/^(const|let) /gm, 'var ');

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...extraGlobals
  };
  createContext(sandbox);
  new Script(patchedCode, { filename: filePath }).runInContext(sandbox);
  return sandbox;
}
