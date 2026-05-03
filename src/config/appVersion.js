import packageJson from '../../package.json';

const REPO_BASELINE_VERSION = '9.1';

const normalizeVersion = (value) => {
  const raw = String(value || '').trim();
  return raw || REPO_BASELINE_VERSION;
};

export const APP_VERSION = normalizeVersion(
  import.meta.env.VITE_APP_VERSION || REPO_BASELINE_VERSION || packageJson.version
);

export const APP_VERSION_LABEL = `VER ${APP_VERSION}`;
