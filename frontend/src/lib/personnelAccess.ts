const VIEW_ROLES = new Set(["admin", "manager", "warehouse"])
const EDIT_ROLES = new Set(["admin", "manager"])

export function canViewPersonnel(user: { is_superuser?: boolean | null; role_name?: string | null } | null | undefined): boolean {
  if (!user) return false
  if (user.is_superuser) return true
  return VIEW_ROLES.has(user.role_name ?? "")
}

export function canEditPersonnel(user: { is_superuser?: boolean | null; role_name?: string | null } | null | undefined): boolean {
  if (!user) return false
  if (user.is_superuser) return true
  return EDIT_ROLES.has(user.role_name ?? "")
}
