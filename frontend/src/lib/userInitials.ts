/** Инициалы для аватара-заглушки из ФИО или email. */
export function initialsFromUser(
  fullName: string | null | undefined,
  email: string,
): string {
  const n = (fullName ?? "").trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      const a = parts[0]?.[0] ?? ""
      const b = parts[parts.length - 1]?.[0] ?? ""
      return (a + b).toUpperCase()
    }
    return n.slice(0, 2).toUpperCase()
  }
  const local = email.split("@")[0] ?? email
  return local.slice(0, 2).toUpperCase()
}
