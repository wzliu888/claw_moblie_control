const STORAGE_KEY = 'auth_user';
export function saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}
export function loadUser() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function clearUser() {
    localStorage.removeItem(STORAGE_KEY);
}
