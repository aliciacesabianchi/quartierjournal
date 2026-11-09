// Sharing = handing a link to the user's own messaging app. No invitation or RSVP is created.

export function shareText(title: string, url: string, intro: string): string {
  return `${intro} «${title}»\n${url}`
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function mailtoUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Normalises a URL for duplicate matching: lowercase host, no www, no tracking params, no trailing slash. */
export function normaliseUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    if (!/^https?:$/.test(u.protocol)) return null
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) u.searchParams.delete(k)
    u.protocol = 'https:'
    return u.toString().replace(/\/(\?|$)/, '$1')
  } catch {
    return null
  }
}
