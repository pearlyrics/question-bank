// Chapters live at /<slug>, so a handful of words can never be slugs.
// import_questions() would happily accept "import" as a bank slug, and the
// chapter would then be unreachable.
export const RESERVED_SLUGS = ['chapters', 'import', 'login', 'logout', 'api', 'assets', 'static']

export const SLUG_PATTERN = /^[a-z0-9-]{2,60}$/

export function parseRoute(pathname) {
  const trimmed = String(pathname ?? '/').replace(/\/+$/, '')
  if (trimmed === '' || trimmed === '/') return { name: 'home' }

  const segments = trimmed.slice(1).split('/')
  if (segments.length > 1) return { name: 'notFound' }

  const [segment] = segments
  if (segment === 'chapters') return { name: 'chapters' }
  if (segment === 'import') return { name: 'import' }
  // Reserved words are held back for future pages. Refusing them here and in
  // the importer keeps one rule: if it can't be a chapter URL, it can't be a
  // chapter slug.
  if (RESERVED_SLUGS.includes(segment)) return { name: 'notFound' }
  if (SLUG_PATTERN.test(segment)) return { name: 'chapter', slug: segment }
  return { name: 'notFound' }
}

export function chapterPath(slug) {
  return `/${slug}`
}

export const CHAPTERS_PATH = '/chapters'
export const IMPORT_PATH = '/import'
