import { createContext, useContext } from 'react'

/** Scene colors per theme (the UI itself uses the CSS tokens in index.css). */
export const SCENE = {
  light: {
    background: '#eef1f5',
    skyTop: '#bccbdd',
    horizon: '#f2f4f7',
    floor: '#d4d9e0',
    platform: '#eceff3',
    hemi: ['#ffffff', '#b8c2cf', 0.7],
    cell: '#c4cdd8',
    section: '#8ca2bb',
    shadow: 0.22,
    contact: 0.45,
    studio: '#7f8996', // darker than the page so paint keeps its depth
    origin: '#334155',
    floorAxes: 0.85,
  },
  dark: {
    background: '#090c11',
    skyTop: '#04060a',
    horizon: '#1b2532',
    floor: '#0b1017',
    platform: '#121a25',
    hemi: ['#dbe8ff', '#0d1117', 0.8],
    cell: '#223142',
    section: '#36618a',
    shadow: 0.45,
    contact: 0.65,
    studio: '#0b0f16',
    origin: '#e6edf7',
    floorAxes: 0.6,
  },
}

export const ThemeContext = createContext('light')
export const useSceneTheme = () => SCENE[useContext(ThemeContext)] ?? SCENE.light

export function readTheme() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* storage blocked: the choice just isn't remembered */
  }
}
