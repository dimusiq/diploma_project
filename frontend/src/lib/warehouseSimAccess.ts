/** Тот же критерий, что backend `get_current_warehouse_sim_admin`. */
export const ROLE_ADMIN = "admin"

export function canAccessWarehouseSim(
  user:
    | {
        is_superuser?: boolean | null
        role_name?: string | null
      }
    | null
    | undefined,
): boolean {
  if (!user) return false
  return Boolean(user.is_superuser) || user.role_name === ROLE_ADMIN
}
