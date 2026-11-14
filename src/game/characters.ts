import type { Gender } from '../api'

const skins = ['#ffc99c', '#f0aa7b', '#c88460', '#ffd9b1']
const hairs = ['#28243b', '#50302c', '#3a294d', '#6e422f', '#282d43', '#553453']
const accents = ['#f8667b', '#39a9a3', '#f3a234', '#8267d9', '#5f95d7', '#e57361']
const bangs = [
  'M5 23Q2 5 19 3Q36-2 42 12L40 24 34 13 28 18 29 11 20 19 19 13 11 24Z',
  'M4 25Q0 3 22 2Q44 2 43 24L37 24 33 13 26 16 16 11 9 24Z',
  'M4 23Q2 10 9 8L6 4 14 6 17 1 23 4 31 1 35 7 42 7 43 20 37 24 33 14 26 20 23 13 13 22 11 16 8 24Z',
  'M3 26Q0 5 18 3Q39-1 44 17L42 29 37 26 35 15Q22 18 16 10 13 22 7 26Z',
  'M4 24Q2 8 14 5Q18-1 26 3Q40 2 43 19L38 25 32 17Q19 21 14 13L9 25Z',
  'M3 26Q0 13 9 6 24-4 38 9 46 13 43 28L38 23 35 12 31 17 26 12 20 18 16 13 8 24Z',
]

const svg = (w: number, h: number, content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`

export const characterKey = (variant: number, gender: Gender | null) => (gender ?? 'unknown') + '-' + variant

export function parts(variant: number, gender: Gender | null = null, scared: boolean | 'dazed' = false) {
  const skin = skins[variant % 4]
  const style = variant % 6
  const hair = hairs[(style + Math.floor(variant / 6)) % 6]
  const accent = accents[style]
  const skirt = gender === 'female'
  const uniform = skirt ? '#7d4ab1' : gender === 'male' ? '#285994' : '#686274'
  const trim = skirt ? '#d4a1ff' : gender === 'male' ? '#8dc6ff' : '#b2a9bd' 
  const outline = '#36283e'
  const head = `<g stroke="${outline}" stroke-width="1.25" stroke-linejoin="round">
   ${skirt ? `<path d="M9 13Q3 18 5 32L5 38Q9 42 15 39L20 31H31L36 40Q41 42 44 37L43 28Q44 15 38 9Z" fill="${hair}"/>` : ''}
   <path d="M5 25Q1 13 12 7Q23 1 36 8Q45 15 41 31L33 40H12Z" fill="${hair}"/>
   <path d="M8 26C1 21 1 35 9 33m31-7c7-5 7 9-1 7" fill="${skin}"/>
   <path d="M8 19Q10 8 23 8Q37 8 40 22L39 31Q37 42 24 43Q11 43 8 32Z" fill="${skin}"/>
   <path d="${bangs[style]}" fill="${hair}"/>
   <path d="M10 13Q16 6 27 6" fill="none" stroke="#fff" opacity=".19" stroke-linecap="round"/>
   </g>
   <ellipse cx="13" cy="32" rx="3.4" ry="1.7" fill="#ec747d" opacity=".54"/><ellipse cx="35" cy="32" rx="3.4" ry="1.7" fill="#ec747d" opacity=".54"/>
   ${scared === 'dazed'
    ? '<path d="M9 22l7-3 3 4-2 4-7 2zm23 7 6-3 1 7-6 4-5-2z" fill="#6c565b" opacity=".8"/><g fill="#fff"><ellipse cx="17" cy="26" rx="4.7" ry="5.1"/><ellipse cx="32" cy="25" rx="4.7" ry="5.1"/></g><g fill="#312737"><circle cx="15.5" cy="26" r="1.5"/><circle cx="33.5" cy="24" r="1.5"/><ellipse cx="24" cy="35" rx="2.2" ry="3"/></g><path d="M12 19l7 1m10-2 7-2" stroke="#403042" stroke-width="1.5" stroke-linecap="round"/>'
    : scared
    ? '<g fill="#fff"><ellipse cx="17" cy="26" rx="4.2" ry="5.3"/><ellipse cx="32" cy="26" rx="4.2" ry="5.3"/></g><g fill="#32253b"><ellipse cx="18" cy="27" rx="2" ry="3"/><ellipse cx="33" cy="27" rx="2" ry="3"/><ellipse cx="25" cy="35" rx="3.8" ry="4.3"/></g><path d="M14 21l5-3m10 0 6 3" stroke="#403042" stroke-width="1.4" stroke-linecap="round"/>'
    : '<g fill="#32253b"><ellipse cx="17" cy="27" rx="2.1" ry="3.1"/><ellipse cx="32" cy="27" rx="2.1" ry="3.1"/><path d="M20 34h9q-1 5-4.5 5T20 34"/></g><g fill="#fff"><circle cx="17.5" cy="25.8" r=".8"/><circle cx="32.5" cy="25.8" r=".8"/><path d="M21 34h7l-1 1.4h-5Z"/></g>'}
   ${style >= 4 ? '<g fill="none" stroke="#674e60" stroke-width="1.25"><rect x="12" y="23" width="10" height="8" rx="3"/><rect x="27" y="23" width="10" height="8" rx="3"/><path d="M22 26h5"/></g>' : ''}
   ${skirt ? `<path d="M34 16l7-3m-6 6 7-3" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>` : ''}`
  const body = `<g stroke="${outline}" stroke-width="1.2" stroke-linejoin="round">
    <path d="M5 7L11 3h9l6 4-3 19H8Z" fill="#fff9ea"/>
    <path d="M10 3l5 5 5-5m-5 5v12" fill="none" stroke="#cabed0"/>
    <path d="M12 6l3 3 4-3-2 6 2 7-4 2-2-3 1-6Z" fill="${accent}" stroke="none"/>
    <path d="M20 12h4v3h-4Z" fill="#ffe17a" stroke="none"/>
    <path d="${skirt ? 'M8 20h15l5 10H3Z' : 'M8 20h15l2 10h-9l-1-4-1 4H6Z'}" fill="${uniform}"/>
    <path d="M9 21h13" stroke="${trim}" />
    ${skirt ? `<path d="M11 23l-2 6m7-6v6m5-6 2 6" fill="none" stroke="${trim}" stroke-width=".85"/>` : ''}
   </g>`
  const arm = `<path d="M3 3Q7 0 10 3l1 8-2 5q-4 4-7 0L1 8Z" fill="${skin}" stroke="${outline}" stroke-width="1.2"/><path d="M2 3Q6-1 10 2l2 7-10 2Z" fill="#fffaed" stroke="${outline}" stroke-width="1.2"/>`
  const leg = `<path d="M3 2h7l-1 12H3Z" fill="${skin}" stroke="${outline}" stroke-width="1.2"/><path d="M3 8h6l1 6 3 2v3H2l-1-3Z" fill="#fffaee" stroke="${outline}" stroke-width="1.2"/><path d="M2 13h8l3 3v3H2Z" fill="#3f3b62" stroke="${outline}" stroke-width="1.2"/><path d="M2 18h11" stroke="#b9acd0"/>`
  return {
    head: svg(48, 45, head), body: svg(31, 32, body), arm: svg(13, 20, arm),
    leg: svg(15, 21, leg),
    preview: svg(60, 76, `<ellipse cx="30" cy="71" rx="17" ry="3.5" fill="#64508c" opacity=".18"/>
      <g transform="translate(19 53)">${leg}</g><g transform="translate(32 53)">${leg}</g>
      <g transform="translate(16 40) rotate(26)">${arm}</g><g transform="translate(39 43) rotate(-24)">${arm}</g>
      <g transform="translate(14 35)">${body}</g><g transform="translate(6 1)">${head}</g>`),
  }
}
export const asImage = (source: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source)
