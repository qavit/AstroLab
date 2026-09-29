import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { atmosphereProfileCopy, localizedPath } from "../lib/i18n.ts";

test("the atmosphere profile has reviewed UI copy in both supported locales", () => {
  assert.equal(atmosphereProfileCopy("zh-TW").title, "大氣垂直結構");
  assert.equal(atmosphereProfileCopy("en").title, "Vertical Structure of the Atmosphere");
  assert.equal(atmosphereProfileCopy("en").controls.quantityA, "Quantity A (solid line)");
});

test("English URLs use a prefix while the default Chinese URL remains stable", () => {
  assert.equal(localizedPath("zh-TW", "/atmosphere-profile"), "/atmosphere-profile");
  assert.equal(localizedPath("en", "/atmosphere-profile"), "/en/atmosphere-profile");
});

test("the sitemap includes only the published English counterpart", async () => {
  const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(sitemap, /"\/en\/atmosphere-profile"/);
  assert.doesNotMatch(sitemap, /"\/en\/"\s*,/);
});
