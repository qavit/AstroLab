/**
 * Vendors MathJax's standalone SVG bundle into `public/` before dev and build.
 *
 * Self-hosted rather than loaded from a CDN so the model works with no third-party runtime
 * dependency — including offline, which matters for a teaching tool used in a classroom. The SVG
 * output is chosen over CHTML because it needs no accompanying web fonts, so this one file is the
 * whole of it. It is copied rather than committed, since it is 2 MB of build output.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("mathjax-full/package.json")), "es5", "tex-svg.js");
const targetDirectory = join(process.cwd(), "public", "mathjax");

await mkdir(targetDirectory, { recursive: true });
await copyFile(source, join(targetDirectory, "tex-svg.js"));
console.log("copied mathjax tex-svg.js into public/mathjax/");
