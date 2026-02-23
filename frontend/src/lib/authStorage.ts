const TOKEN_KEY = "access_token"

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token)
    sessionStorage.removeItem(TOKEN_KEY)
  } else {
    sessionStorage.setItem(TOKEN_KEY, token)
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function removeAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}

export function hasAccessToken(): boolean {
  return getAccessToken() !== null
}
