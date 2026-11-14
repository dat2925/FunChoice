import { useState } from 'react'
import { schoolThemes, type SchoolTheme } from './api'
import { asImage } from './game/characters'
import { schoolyards } from './game/yard'

const previews = {
  rural: asImage(schoolyards.rural),
  city: asImage(schoolyards.city),
  mountain: asImage(schoolyards.mountain),
}

export default function SchoolThemePicker({ initial }: { initial: SchoolTheme }) {
  const [theme, setTheme] = useState(initial)

  return <label>Nền sân trường
    <select name="theme" value={theme} onChange={(event) => setTheme(event.target.value as SchoolTheme)}>
      {Object.entries(schoolThemes).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
    <img className="school-theme-preview" src={previews[theme]} alt={'Xem trước sân trường ' + schoolThemes[theme].toLowerCase()}/>
  </label>
}
