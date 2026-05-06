import packageJson from '../../package.json';

const REPO_BASELINE_VERSION = packageJson.version;

const normalizeVersion = (value) => {
  const raw = String(value || '').trim();
  return raw || REPO_BASELINE_VERSION;
};

export const APP_VERSION = normalizeVersion(
  import.meta.env.VITE_APP_VERSION || packageJson.version || REPO_BASELINE_VERSION
);

export const APP_VERSION_LABEL = `VER ${APP_VERSION}`;
