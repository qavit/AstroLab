import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
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
  assert.match(html, /24 節氣/);
  assert.match(html, /赤經/);
  assert.match(html, /赤緯/);
  assert.match(html, /黃經/);
  assert.match(html, /黃緯/);
  assert.match(html, /分至點/);
  assert.match(html, /近日點／遠日點/);
  assert.match(html, /高度角/);
  assert.match(html, /方位角/);
  assert.match(html, /天球外框/);
  assert.match(html, /一般經緯線/);
  assert.match(html, /觀察者緯線/);
  assert.match(html, /觀察者經線/);
  assert.match(html, /子午圈/);
  assert.match(html, /酉卯圈/);
  assert.match(html, /日下點/);
  assert.match(html, /北極圈/);
  assert.match(html, /南回歸線/);
  assert.match(html, /春分/);
  assert.match(html, /直接操控/);
  assert.match(html, /模型說明/);
  assert.match(html, /匯出/);
  assert.match(html, /影長（竿高 = 1）/);
  assert.doesNotMatch(html, /從地心幾何切換到觀察者的天空/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("server-renders the model explanation page", async () => {
  const response = await render("/about");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /模型的理想化設計/);
  assert.match(html, /和真實日地系統的差異/);
  assert.match(html, /返回模型/);
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
  assert.match(view, /makeBasis\(east, north, normal\)/);
  assert.match(view, /CapsuleGeometry/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("server-renders the magnetic field model page", async () => {
  const response = await render("/magnetism");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>多導線磁場疊加｜AstroLab<\/title>/);
  assert.match(html, /多導線磁場疊加/);
  assert.match(html, /空間視角/);
  assert.match(html, /俯視示意圖/);
  assert.match(html, /剪斷比較/);
  assert.match(html, /太陽模型/);
});

test("keeps magnetism science calculations independent of the Three.js view", async () => {
  const [science, view] = await Promise.all([
    readFile(new URL("../lib/science/magnetism.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/MagneticFieldLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(science, /export function fieldFromWire/);
  assert.match(science, /export function totalField/);
  assert.doesNotMatch(science, /three|document|window/i);
  assert.match(view, /from "@\/lib\/science\/magnetism"/);
  assert.match(view, /OrbitControls/);
});
