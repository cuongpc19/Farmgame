// The privacy policy as a page of its own, from the one source the game shows in Settings → PRIVACY
// (src/privacy.html). Used by build-target.mjs (dist/privacy.html) and scripts/stats/site.mjs (the
// hosted copy on Firebase Hosting), so the copies cannot drift.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function privacyBody(root) {
  return readFileSync(join(root, "src/privacy.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function privacyPage(root) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Farm Valley - Privacy Policy</title>
<style>body{margin:0 auto;max-width:720px;padding:24px 18px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#2b2f36;background:#f4f1ea}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:22px 0 6px}.upd{color:#6b7280;font-size:13px}code{background:#e6e1d6;padding:0 4px;border-radius:4px}</style>
</head><body>
${privacyBody(root)}
</body></html>
`;
}
