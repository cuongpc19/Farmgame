/**
 * Flat vector portraits for the dialogue speakers (our own art, inline SVG — no files).
 * Speaker ids stay `hank` / `sofia` (docs/FARM.md):
 * Auntie Hoa (HANK_SVG): conical straw hat tied under the chin, grey hair, smiling eyes, green blouse.
 * Little Bao (SOFIA_SVG): her grandson, black hair with a cowlick, freckles, big grin, sky-blue T-shirt.
 */
export const HANK_SVG = `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 150 C14 114 32 100 60 100 C88 100 106 114 106 150 Z" fill="#4f8a3a"/>
  <path d="M44 102 L60 122 L76 102 C70 100 50 100 44 102 Z" fill="#3d6e2c"/>
  <circle cx="60" cy="134" r="3" fill="#f6e7c4"/><circle cx="60" cy="145" r="3" fill="#f6e7c4"/>
  <rect x="52" y="88" width="16" height="16" rx="6" fill="#e2ad80"/>
  <path d="M33 66 C30 92 40 98 46 96 L46 64 Z M87 66 C90 92 80 98 74 96 L74 64 Z" fill="#c9c4bc"/>
  <ellipse cx="60" cy="72" rx="24" ry="26" fill="#ecbf92"/>
  <path d="M37 64 C40 52 80 52 83 64 C74 58 46 58 37 64 Z" fill="#d8d3cb"/>
  <circle cx="45" cy="80" r="5" fill="#f29a84" opacity=".55"/><circle cx="75" cy="80" r="5" fill="#f29a84" opacity=".55"/>
  <path d="M44 71 Q50 65 56 71 M64 71 Q70 65 76 71" stroke="#3b2414" stroke-width="2.8" fill="none" stroke-linecap="round"/>
  <path d="M40 70 L37 68 M80 70 L83 68" stroke="#c99a70" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M50 84 Q60 92 70 84" stroke="#a8503a" stroke-width="2.8" fill="none" stroke-linecap="round"/>
  <path d="M37 60 L48 98 M83 60 L72 98" stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M6 56 L60 6 L114 56 Q60 66 6 56 Z" fill="#f2cf73"/>
  <path d="M60 6 L24 50 M60 6 L42 56 M60 6 L60 58 M60 6 L78 56 M60 6 L96 50" stroke="#d9ae4f" stroke-width="1.6"/>
  <path d="M6 56 Q60 66 114 56" stroke="#c99a3c" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

export const SOFIA_SVG = `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 150 C20 116 38 104 60 104 C82 104 100 116 100 150 Z" fill="#3d9be0"/>
  <path d="M48 104 Q60 114 72 104" stroke="#2a78b8" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M50 126 l4 -6 l6 6 l6 -6 l4 6" stroke="#ffd34d" stroke-width="3" fill="none" stroke-linejoin="round"/>
  <rect x="52" y="92" width="16" height="15" rx="6" fill="#e3a978"/>
  <ellipse cx="35" cy="74" rx="5" ry="7" fill="#e8b083"/><ellipse cx="85" cy="74" rx="5" ry="7" fill="#e8b083"/>
  <ellipse cx="60" cy="72" rx="25" ry="26" fill="#f0c49a"/>
  <path d="M34 66 C32 42 50 34 62 36 C78 36 90 46 86 66 C82 56 76 52 70 54 C66 48 58 50 54 54 C48 50 40 56 34 66 Z" fill="#2b1d10"/>
  <path d="M58 37 C56 28 62 24 66 26 C62 28 61 32 63 37 Z" fill="#2b1d10"/>
  <circle cx="50" cy="72" r="3.6" fill="#2b1d10"/><circle cx="70" cy="72" r="3.6" fill="#2b1d10"/>
  <circle cx="51.2" cy="70.8" r="1.2" fill="#fff"/><circle cx="71.2" cy="70.8" r="1.2" fill="#fff"/>
  <path d="M45 64 Q50 61 55 64 M65 64 Q70 61 75 64" stroke="#2b1d10" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <circle cx="44" cy="80" r="1.2" fill="#c98a5e"/><circle cx="47" cy="83" r="1.2" fill="#c98a5e"/><circle cx="41" cy="83" r="1.2" fill="#c98a5e"/>
  <circle cx="76" cy="80" r="1.2" fill="#c98a5e"/><circle cx="73" cy="83" r="1.2" fill="#c98a5e"/><circle cx="79" cy="83" r="1.2" fill="#c98a5e"/>
  <path d="M49 84 Q60 96 71 84 Q60 89 49 84 Z" fill="#a8503a"/>
</svg>`;
