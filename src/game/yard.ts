export const fieldWidth = 1240
export const fieldHeight = 660

export const schoolSign = { x: 498, y: 178, width: 244, height: 38 }

export const schoolyard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 660" width="1240" height="660">
<defs>
 <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#83d5fc"/><stop offset="1" stop-color="#e6f7fb"/></linearGradient>
 <linearGradient id="court" x2="0" y2="1"><stop stop-color="#e3bdab"/><stop offset="1" stop-color="#eabfaf"/></linearGradient>
 <pattern id="grain" width="38" height="29" patternUnits="userSpaceOnUse"><path d="M3 12h3m20 13h2M18 4h1" stroke="#926859" opacity=".17"/></pattern>
 <pattern id="window" width="68" height="62" patternUnits="userSpaceOnUse">
  <rect x="8" y="8" width="42" height="38" rx="3" fill="#956e68"/>
  <rect x="11" y="10" width="36" height="33" rx="2" fill="#86b0c2"/>
  <path d="M12 31l20-20h13L13 42z" fill="#bcdeea" opacity=".65"/>
  <path d="M29 10v33M11 26h36" stroke="#f5ead7" stroke-width="3"/>
  <path d="M6 47h46" stroke="#fef0d8" stroke-width="4"/>
 </pattern>
 <g id="cloud" fill="#fff" opacity=".83"><path d="M0 29c0-10 10-17 21-14 5-17 33-22 45-6 11-3 23 3 24 12 12-1 18 4 18 10H9c-5 0-9 0-9-2Z"/></g>
 <g id="tree">
  <ellipse cx="0" cy="14" rx="56" ry="12" fill="#527b52" opacity=".32"/>
  <path d="M-9 9l4-74-20-30 8-4 17 24 15-21 7 6L5-61l6 70Z" fill="#8b6247"/>
  <path d="M-5 5 1-57l6 4 4 58Z" fill="#aa7752"/>
  <path d="M-55-62c-18-15-14-47 9-56-1-21 23-38 45-31 22-14 50 1 52 19 27 3 35 31 19 48-3 20-31 33-54 23-20 16-50 12-62-5Z" fill="#4ba47c"/>
  <path d="M-57-86c-6-13 1-26 15-31 0-22 25-36 45-30 22-9 45 3 45 20 19 1 29 14 24 29-16 3-25-1-32-7-4 15-24 24-39 17-11 10-40 12-58 2Z" fill="#71bf85"/>
  <path d="M-33-116q14-20 32-15m20 5q14-6 26 8M-43-89q13 5 25 0" fill="none" stroke="#a0d78f" stroke-width="4" stroke-linecap="round"/>
 </g>
</defs>
<rect width="1240" height="660" fill="url(#sky)"/>
<circle cx="1045" cy="75" r="55" fill="#fff3be" opacity=".55"/><circle cx="1045" cy="75" r="42" fill="#fff8db"/>
<use href="#cloud" x="82" y="65"/><use href="#cloud" transform="translate(318 42) scale(.75)"/><use href="#cloud" transform="translate(841 66) scale(1.18)"/>
<path d="M0 227Q55 157 151 207Q251 147 331 205Q430 162 530 213Q611 151 723 213Q831 161 922 216Q1057 152 1134 202Q1189 168 1240 187v136H0Z" fill="#8cc6a8"/>
<path d="M0 252q82-42 161 3 103-54 214 6 184-64 363-4 103-47 202 2 184-67 300-12v80H0Z" fill="#70b694"/>
<rect y="285" width="1240" height="119" fill="#a1cd84"/>
<path d="M0 322h1240m0-19H0" stroke="#e7f0d2" stroke-width="7"/>
<path d="M8 300v41m25-41v41m25-41v41m25-41v41m25-41v41m25-41v41m971-41v41m25-41v41m25-41v41m25-41v41m25-41v41m25-41v41" stroke="#e7f0d2" stroke-width="5"/>
<ellipse cx="620" cy="350" rx="475" ry="28" fill="#779b64" opacity=".32"/>
<rect x="151" y="172" width="938" height="155" rx="4" fill="#ffd9ab"/>
<rect x="151" y="186" width="938" height="7" fill="#f2b384"/>
<path d="M121 182l35-43h928l35 43Z" fill="#c86b60"/>
<path d="M140 172l28-31h900l33 31Z" fill="#de8771"/>
<path d="M161 156h920m-934 11h949" stroke="#ed9e84" stroke-width="2"/>
<rect x="168" y="194" width="900" height="120" fill="url(#window)"/>
<path d="M151 251h938M151 321h938" stroke="#fff0d7" stroke-width="8"/>
<path d="M491 179l129-84 129 84v149H491Z" fill="#f8c398"/>
<path d="M472 181l148-99 148 99-10 13L620 106 482 194Z" fill="#b75955"/>
<path d="M485 181l135-89 135 89" fill="none" stroke="#ec9177" stroke-width="4"/>
<circle cx="620" cy="147" r="19" fill="#fff3d8" stroke="#ac6861" stroke-width="4"/>
<path d="M620 135v13l9 4" fill="none" stroke="#6d5661" stroke-width="3" stroke-linecap="round"/>
<rect x="${schoolSign.x}" y="${schoolSign.y + 2}" width="${schoolSign.width}" height="${schoolSign.height}" rx="5" fill="#ad6b52" opacity=".35"/>
<rect x="${schoolSign.x}" y="${schoolSign.y}" width="${schoolSign.width}" height="${schoolSign.height}" rx="5" fill="#fff2cf" stroke="#bc805a" stroke-width="2"/>
<path d="M553 328v-57a67 55 0 0 1 134 0v57Z" fill="#cb8a70"/>
<path d="M568 328v-55a52 43 0 0 1 104 0v55Z" fill="#775a65"/>
<path d="M579 328v-55a41 33 0 0 1 82 0v55Z" fill="#6e94a8"/>
<path d="M620 242v86m-41-55h82" stroke="#ead5bd" stroke-width="4"/>
<path d="M507 220v110m226-110v110" stroke="#ffe8c5" stroke-width="12"/>
<path d="M555 330h130l23 25H532Z" fill="#fae6cb"/><path d="M546 340h148m-155 8h163" stroke="#d7b6a3" stroke-width="2"/>
<path d="M792 326V77" stroke="#f7f5dc" stroke-width="5"/><circle cx="792" cy="76" r="5" fill="#ffe0a7"/>
<path d="M795 82q32-9 64 1v43q-35-9-64 1Z" fill="#e86661"/><path d="m825 90 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z" fill="#ffeb85"/>
<use href="#tree" transform="translate(103 336) scale(1.15)"/><use href="#tree" transform="translate(1135 337) scale(1.17)"/>
<use href="#tree" transform="translate(227 337) scale(.63)"/><use href="#tree" transform="translate(1002 342) scale(.68)"/>
<g fill="#f5d695"><path d="M139 331h32l-5 23h-22zm926 0h32l-5 23h-22z"/></g>
<g fill="#52956f"><ellipse cx="154" cy="327" rx="22" ry="11"/><ellipse cx="1082" cy="327" rx="22" ry="11"/></g>
<path d="M104 354h1032l104 306H0Z" fill="#f3d9be"/>
<path d="M139 367h962l95 293H44Z" fill="url(#court)"/><path d="M139 367h962l95 293H44Z" fill="url(#grain)"/>
<path d="M162 387h916l80 248H82Zm458 0v248" fill="none" stroke="#fff0d7" stroke-width="4" opacity=".78"/>
<ellipse cx="620" cy="507" rx="111" ry="42" fill="none" stroke="#fff0d7" stroke-width="4" opacity=".78"/>
<path d="M155 442h100l-25 130H102m984-130H985l25 130h128" fill="none" stroke="#fff0d7" stroke-width="4" opacity=".72"/>
<path d="M0 525l60-147m1180 146-60-145" stroke="#f7ead4" stroke-width="4"/>
</svg>`

const skyline = [
  [14, 111, 82, '#708ba9'], [102, 157, 83, '#869fbe'], [197, 91, 91, '#637fa0'],
  [306, 136, 73, '#9aadc9'], [392, 105, 85, '#748caf'], [785, 110, 75, '#809abc'],
  [873, 79, 89, '#748db1'], [979, 143, 70, '#a3adc7'], [1066, 89, 92, '#667fa1'],
  [1170, 131, 67, '#8da3c2'],
] as const

const city = schoolyard
  .replace('fill="#8cc6a8"/>', 'fill="#b1cadb"/>')
  .replace('fill="#70b694"/>', 'fill="#a0b7ca"/>' + skyline.map(([x, top, width, color], i) => `
    <rect x="${x}" y="${top}" width="${width}" height="${286 - top}" rx="3" fill="${color}"/>
    <path d="M${x + 10} ${top - 6}h${width - 20}v6h-${width - 20}z" fill="${color}"/>
    <path d="M${x + width / 2} ${top - 7}v-${8 + i % 3 * 5}" stroke="#7d94af" stroke-width="2"/>
    ${Array.from({ length: 4 }, (_, col) => Array.from({ length: Math.floor((238 - top) / 17) }, (_, row) => `
      <rect x="${x + 9 + col * (width - 12) / 4}" y="${top + 10 + row * 17}" width="8" height="9" rx="1" fill="${(row + col + i) % 4 ? '#c0d9e9' : '#fff1bb'}" opacity=".8"/>
    `).join('')).join('')}
  `).join(''))
  .replace('fill="#ffd9ab"', 'fill="#e0edf5"')
  .replace('fill="#f2b384"', 'fill="#afcfe0"')
  .replace('fill="#f8c398"', 'fill="#c4deed"')
  .replace('fill="#c86b60"', 'fill="#395775"')
  .replace('fill="#de8771"', 'fill="#507492"')
  .replace('stroke="#ed9e84"', 'stroke="#86abc3"')
  .replace('fill="#b75955"', 'fill="#31536f"')
  .replace('stroke="#ec9177"', 'stroke="#7ca6be"')
  .replace('fill="#86b0c2"', 'fill="#5685ab"')
  .replace('stop-color="#e3bdab"', 'stop-color="#90b9c6"')
  .replace('stop-color="#eabfaf"', 'stop-color="#a0c5cb"')

const mountain = schoolyard
  .replace('fill="#8cc6a8"/>', `fill="#9fcbc2"/>
  <path d="M0 232L114 128l47 21L252 60l80 70 53-34 146 131 106-99 63 50L838 63l44 55 57 24 66-36 98 76 137-87v197H0Z" fill="#6d9fa4"/>
  <path d="M161 149l91-89 80 70-51-22-24 12-19-14-41 35zm539 29L838 63l44 55-35-16-15 19-27-6-34 18z" fill="#c5dfd5" opacity=".78"/>
  <path d="M0 253l99-54 83 18 82-38 108 41 92-30 93 48 86-44 126 21 128-44 90 45 100-29 153 48v59H0Z" fill="#588e77"/>
  <path d="M0 251q75-43 137-19t120-6m721-4q68-36 124 5t138-8M0 266q75-38 130-17m999-5q57 11 111-4" fill="none" stroke="#a8c785" stroke-width="7" opacity=".84"/>`)
  .replace('fill="#70b694"/>', 'fill="#659d72"/>')
  .replace('fill="#ffd9ab"', 'fill="#f0d4a6"')
  .replace('fill="#f8c398"', 'fill="#dfb287"')
  .replace('fill="#c86b60"', 'fill="#88544c"')
  .replace('fill="#de8771"', 'fill="#a96b53"')
  .replace('stroke="#ed9e84"', 'stroke="#d69770"')
  .replace('fill="#b75955"', 'fill="#734b45"')
  .replace('stroke="#ec9177"', 'stroke="#d69770"')
  .replace('stop-color="#e3bdab"', 'stop-color="#caae8d"')
  .replace('stop-color="#eabfaf"', 'stop-color="#ddc09a"')

export const schoolyards = { rural: schoolyard, city, mountain }
