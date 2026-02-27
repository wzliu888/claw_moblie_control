// Service layer — encapsulates auth API calls
export interface AuthUser {
  uid: string;
  login_type: string;
  created_at: string;
}

const STORAGE_KEY = 'auth_user';

export function saveUser(user: AuthUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}
