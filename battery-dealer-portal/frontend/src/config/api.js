const configuredApiUrl = String(
  import.meta.env.VITE_API_URL || "",
).trim();

const defaultApiUrl = import.meta.env.DEV
  ? "http://localhost:3000"
  : "";

export const API_BASE_URL = (
  configuredApiUrl || defaultApiUrl
).replace(/\/$/, "");

export function apiUrl(path) {
  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  return `${API_BASE_URL}${normalizedPath}`;
}
