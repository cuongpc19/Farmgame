// Turn dist/ into one self-contained HTML body for the Artifact host:
// no <html>/<head>/<body> wrapper, CSS + JS + font inlined.
import fs from "node:fs";
import path from "node:path";
const [dist, out] = process.argv.slice(2);
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
// Every font the page references (fonts/*.ttf) becomes a data URI.
const fontUri = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(dist, f)).toString("base64")}`;
const cssHref = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
const jsSrc = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!cssHref || !jsSrc) throw new Error("asset tags not found");
const css = fs.readFileSync(path.join(dist, cssHref[1]), "utf8");
let js = fs.readFileSync(path.join(dist, jsSrc[1]), "utf8");
const n = (js.match(/<\/script/gi) || []).length;
js = js.replace(/<\/script/gi, "<\/script");
const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
  .replace(/<meta charset[^>]*>/, "")
  .replace(/<meta\s+name="viewport"[\s\S]*?\/>/, "")
  .replace(/<link rel="preload"[^>]*>/, "")
  .replace(cssHref[0], "")
  .replace(jsSrc[0], "")
  .replace(/url\("(fonts\/[^"]+\.ttf)"\)/g, (_m, f) => `url(${fontUri(f)})`);
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(jsSrc[0], "");
const page = `${head.trim()}\n<style>${css}</style>\n${body.trim()}\n<script type="module">${js}</script>\n`;
fs.writeFileSync(out, page);
console.log("escaped </script:", n, "bytes:", page.length, "title first:", page.slice(0, 200).includes("<title>"));
