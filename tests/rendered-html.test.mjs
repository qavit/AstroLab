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
  const response = await render("/solar");
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
  assert.match(html, /模型目錄/);
  assert.match(html, /模型說明/);
  assert.match(html, /匯出/);
  assert.match(html, /影長（竿高 = 1）/);
  assert.doesNotMatch(html, /從地心幾何切換到觀察者的天空/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("server-renders the AstroLab model catalog", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>AstroLab｜互動式科學模型<\/title>/);
  assert.match(html, /選擇一個主題開始探索/);
  assert.match(html, /太陽、天球與竿影/);
  assert.match(html, /全球行星風系/);
  assert.match(html, /岩層位態/);
  assert.match(html, /多導線磁場疊加/);
  assert.match(html, /風場粒子/);
  assert.doesNotMatch(html, /同步控制台/);
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
  const [science, model, view, geocentric, packageJson] = await Promise.all([
    readFile(new URL("../lib/science/solar.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/solar.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/SolarLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/solar/geocentricScene.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(science, /export function solarDeclination/);
  assert.match(science, /export function sunHorizontal/);
  assert.doesNotMatch(science, /three|document|window/i);
  assert.match(model, /export function deriveSolarModel/);
  assert.match(model, /export function advanceSolarState/);
  assert.match(view, /from "@\/lib\/science\/solar"/);
  assert.match(view, /from "@\/models\/solar"/);
  assert.match(view, /from "@\/components\/solar\/scene"/);
  assert.match(geocentric, /makeBasis\(east, north, normal\)/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("drives both solar views from one shared frame", async () => {
  const [scene, frame, observer] = await Promise.all([
    readFile(new URL("../components/solar/scene.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/solar/frame.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/solar/observerScene.ts", import.meta.url), "utf8"),
  ]);
  assert.match(frame, /export function solarFrame/);
  // One frame per update, handed to both scenes, so the two views cannot drift apart.
  assert.match(scene, /const frame = solarFrame\(state\)/);
  assert.match(scene, /geocentric\.update\(state, layers, appearance, frame\)/);
  assert.match(scene, /observer\.update\(state, layers, appearance, frame, shadowTrace\)/);
  assert.match(observer, /setPathsRebuiltHandler/);
});

test("keeps the shared render layer free of model and framework knowledge", async () => {
  const files = ["viewport", "primitives", "interaction", "export"];
  const sources = await Promise.all(
    files.map((name) => readFile(new URL(`../lib/render/${name}.ts`, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(source, /@\/lib\/science/);
    assert.doesNotMatch(source, /@\/models/);
    assert.doesNotMatch(source, /from "react"/);
    assert.doesNotMatch(source, /from "next\//);
  }
  const [viewport, primitives, interaction, exporter] = sources;
  assert.match(viewport, /OrbitControls/);
  assert.match(viewport, /export function createViewport/);
  assert.match(primitives, /CapsuleGeometry/);
  assert.match(interaction, /setPointerCapture/);
  assert.match(exporter, /export function toLineArt/);
});

test("keeps the model layer free of rendering and React", async () => {
  const sources = await Promise.all([
    readFile(new URL("../models/solar.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/magnetism.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/atmosphere.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/geology.ts", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /from "three/);
    assert.doesNotMatch(source, /@\/lib\/render/);
    assert.doesNotMatch(source, /from "react"/);
    assert.match(source, /@\/lib\/science\//);
  }
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
  assert.match(html, /模型目錄/);
});

test("keeps magnetism science calculations independent of the Three.js view", async () => {
  const [science, model, view] = await Promise.all([
    readFile(new URL("../lib/science/magnetism.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/magnetism.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/MagneticFieldLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(science, /export function fieldFromWire/);
  assert.match(science, /export function totalField/);
  assert.doesNotMatch(science, /three|document|window/i);
  assert.match(model, /export function deriveMagnetismModel/);
  assert.match(view, /from "@\/lib\/science\/magnetism"/);
  assert.match(view, /from "@\/models\/magnetism"/);
  assert.match(view, /from "@\/lib\/render\/viewport"/);
});

test("server-renders the global planetary wind model page", async () => {
  const response = await render("/atmosphere");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>全球行星風系｜AstroLab<\/title>/);
  assert.match(html, /全球近地面風帶/);
  assert.match(html, /緯度—高度環流剖面/);
  assert.match(html, /行星自轉速率/);
  assert.match(html, /近地面摩擦/);
  assert.match(html, /粒子密度/);
  assert.match(html, /動畫播放速度/);
  assert.match(html, /流線感/);
  assert.match(html, /理想化三圈環流/);
});

test("keeps atmospheric science independent of the Three.js view", async () => {
  const [science, model, view] = await Promise.all([
    readFile(new URL("../lib/science/atmosphere.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/atmosphere.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/PlanetaryWindLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(science, /export function surfaceWindAt/);
  assert.match(science, /export function coriolisParameter/);
  assert.doesNotMatch(science, /three|document|window/i);
  assert.match(model, /export function deriveAtmosphereModel/);
  assert.match(view, /from "@\/lib\/science\/atmosphere"/);
  assert.match(view, /from "@\/models\/atmosphere"/);
  assert.match(view, /from "@\/lib\/render\/viewport"/);
});

test("server-renders the valley bedding model page", async () => {
  const response = await render("/geology");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>岩層位態與河谷地形｜AstroLab<\/title>/);
  assert.match(html, /地質圖俯視/);
  assert.match(html, /立體地質塊體/);
  assert.match(html, /驗證 V 字法則/);
  assert.match(html, /揭示答案/);
  assert.match(html, /同高程點/);
});

test("keeps valley-rule science independent of its synchronized views", async () => {
  const [science, model, view] = await Promise.all([
    readFile(new URL("../lib/science/geology.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/geology.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/ValleyBeddingLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(science, /export function terrainElevation/);
  assert.match(science, /export function layerElevation/);
  assert.match(science, /export function contourSegments/);
  assert.doesNotMatch(science, /from "three|document|window/i);
  assert.match(model, /export function deriveGeologyModel/);
  assert.match(view, /from "@\/lib\/science\/geology"/);
  assert.match(view, /from "@\/models\/geology"/);
  assert.match(view, /from "@\/lib\/render\/viewport"/);
});
