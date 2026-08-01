import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the AstroLab model shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-Hant">/);
  assert.match(html, /<title>太陽、天球與竿影｜AstroLab<\/title>/);
  assert.match(html, /地心模型/);
  assert.match(html, /觀察者模型/);
  assert.match(html, /同步控制台/);
  assert.match(html, /影長（竿高 = 1）/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("keeps science calculations separate from the Three.js view", async () => {
  const [science, view, packageJson] = await Promise.all([
    readFile(new URL("../lib/science/solar.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/SolarLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(science, /export function solarDeclination/);
  assert.match(science, /export function sunHorizontal/);
  assert.doesNotMatch(science, /three|document|window/i);
  assert.match(view, /from "@\/lib\/science\/solar"/);
  assert.match(view, /OrbitControls/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
