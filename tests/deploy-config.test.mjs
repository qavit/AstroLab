import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

/**
 * The Cloudflare Vite plugin writes `.wrangler/deploy/config.json`, which redirects `wrangler
 * deploy` to the generated `dist/server/wrangler.json` rather than the repo's own wrangler.jsonc.
 * So the committed config only governs production if the plugin is pointed at it — otherwise the
 * Worker silently deploys under whatever name the plugin inferred. These tests assert the two
 * files agree, so that failure mode cannot return unnoticed.
 */

test("the committed wrangler config names the Kakau Lab worker", async () => {
  const config = await read("../wrangler.jsonc");
  assert.equal(config.name, "kakau-lab");
  assert.equal(config.main, "./worker/index.ts");
  assert.equal(config.assets.binding, "ASSETS");
  assert.ok(config.compatibility_flags.includes("nodejs_compat"));
});

test("the built deploy config inherits the committed worker name and runtime", async () => {
  const [committed, effective] = await Promise.all([
    read("../wrangler.jsonc"),
    read("../dist/server/wrangler.json"),
  ]);
  // `wrangler deploy` reads the built config, so a mismatch here means production would not be
  // the worker this repo declares.
  assert.equal(effective.name, committed.name);
  assert.equal(effective.compatibility_date, committed.compatibility_date);
  assert.deepEqual(effective.compatibility_flags, committed.compatibility_flags);
  assert.equal(effective.assets.binding, committed.assets.binding);
});

test("deploying vendors MathJax, which a bare vite build would omit", async () => {
  // `vinext deploy` invokes Vite's builder directly instead of `npm run build`, so the `prebuild`
  // hook never fires for it. Without a `predeploy` hook of its own, a fresh clone would deploy
  // without public/mathjax and Model 07's theory notes would render no mathematics.
  const { scripts } = await read("../package.json");
  assert.match(scripts.predeploy, /copy-mathjax/);
  assert.match(scripts.deploy, /vinext deploy/);
  await assert.doesNotReject(
    access(new URL("../dist/client/mathjax/tex-svg.js", import.meta.url)),
    "the built client bundle must carry the self-hosted MathJax bundle",
  );
});
