/** One line of at most `max` characters. */
export function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

/** Markdown as one plain line, for a row that cannot draw it. */
export function plainLine(text: string, max: number): string {
  return clip(text.replace(/[*_`#>]/g, ''), max)
}

/** Single line breaks the model wrote are meant as breaks: make them hard ones. */
export function hardBreaks(text: string): string {
  return text.replace(/([^\n])\n(?=[^\n])/g, '$1  \n')
}

export function hhmm(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 1) return '1分未満'
  if (minutes < 60) return `${minutes}分`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`
}

export function shortPath(cwd: string, home: string): string {
  if (cwd.includes('/scratch-workspaces/')) return 'フォルダなし'
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}
