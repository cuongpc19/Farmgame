/**
 * Flat vector portraits for the dialogue speakers (our own art, inline SVG — no files).
 * Hank: hard hat, white beard, blue plaid shirt, arms crossed. Sofia: purple hair, glasses.
 */
export const HANK_SVG = `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
  <defs><pattern id="plaid" width="12" height="12" patternUnits="userSpaceOnUse">
    <rect width="12" height="12" fill="#2f5d9a"/><rect width="12" height="4" y="4" fill="#3d72b8"/>
    <rect width="4" height="12" x="4" fill="#3d72b8" opacity=".8"/><rect width="12" height="1" y="6" fill="#1d3f6e"/></pattern></defs>
  <path d="M14 150 C14 112 32 96 60 96 C88 96 106 112 106 150 Z" fill="url(#plaid)"/>
  <path d="M22 132 C40 120 80 120 98 132 L98 146 C80 136 40 136 22 146 Z" fill="#2a5590"/>
  <rect x="30" y="126" width="60" height="12" rx="6" fill="#d9a066"/>
  <path d="M50 96 L60 110 L70 96 Z" fill="#e8e2d6"/>
  <ellipse cx="60" cy="66" rx="25" ry="29" fill="#f0c49a"/>
  <path d="M36 70 C38 98 82 98 84 70 C80 86 40 86 36 70 Z" fill="#f4f1ea"/>
  <path d="M46 80 C52 76 68 76 74 80 C68 84 52 84 46 80 Z" fill="#e9e4da"/>
  <circle cx="50" cy="64" r="2.6" fill="#2b1d10"/><circle cx="70" cy="64" r="2.6" fill="#2b1d10"/>
  <path d="M44 57 L56 58 M64 58 L76 57" stroke="#e6e1d6" stroke-width="3" stroke-linecap="round"/>
  <path d="M30 50 C30 22 90 22 90 50 Z" fill="#ffc928"/><rect x="24" y="47" width="72" height="8" rx="4" fill="#f2b51a"/>
  <rect x="55" y="26" width="10" height="22" rx="3" fill="#ffd955"/>
</svg>`;

export const SOFIA_SVG = `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 150 C18 114 36 100 60 100 C84 100 102 114 102 150 Z" fill="#33395a"/>
  <path d="M50 100 L60 118 L70 100 Z" fill="#f4f4f8"/>
  <path d="M28 70 C24 30 96 30 92 70 L96 112 C84 104 36 104 24 112 Z" fill="#7b4fc9"/>
  <ellipse cx="60" cy="68" rx="23" ry="27" fill="#f3cfb0"/>
  <path d="M36 56 C40 34 82 30 86 58 C74 46 50 44 36 56 Z" fill="#8a5ad8"/>
  <circle cx="50" cy="68" r="7" fill="none" stroke="#2b2b3a" stroke-width="2.5"/>
  <circle cx="70" cy="68" r="7" fill="none" stroke="#2b2b3a" stroke-width="2.5"/>
  <path d="M57 68 L63 68" stroke="#2b2b3a" stroke-width="2.5"/>
  <circle cx="50" cy="68" r="2.2" fill="#2b1d10"/><circle cx="70" cy="68" r="2.2" fill="#2b1d10"/>
  <path d="M52 82 C56 86 64 86 68 82" stroke="#c0605a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;
