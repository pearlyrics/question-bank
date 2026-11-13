// Accounts are username-only. The password is derived from the username, so
// there is exactly one thing to type and one thing to remember.
//
// Trade-off, accepted deliberately: anyone who knows a username can sign in as
// that user. Nothing sensitive belongs in this app.

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/
const PASSWORD_PAD = 'qbank1'
const MIN_PASSWORD = 6 // Supabase's floor

export function normalizeUsername(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
}

export function usernameError(username) {
  if (!username) return 'Enter a username.'
  if (username.length < 3) return 'Usernames are at least 3 characters.'
  if (username.length > 32) return 'Usernames are at most 32 characters.'
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use lowercase letters, numbers, dots, dashes or underscores.'
  }
  return null
}

// Supabase requires 6+ characters, so short usernames are padded by a fixed
// rule. Deterministic: the same username always yields the same password.
export function passwordFor(username) {
  if (username.length >= MIN_PASSWORD) return username
  return (username + PASSWORD_PAD).slice(0, MIN_PASSWORD)
}

export function emailFor(username, domain) {
  return `${username}@${domain || 'qbank.local'}`
}
