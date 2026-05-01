import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const keepWorkdir = process.env.KEEP_PREVIEW_WORKDIR === '1';

const EXCLUDED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
]);

const EXCLUDED_RELATIVE_PATHS = new Set([
  '.vercel/output',
]);

const shouldCopy = (sourcePath) => {
  const relativePath = path.relative(repoRoot, sourcePath);
  if (!relativePath) return true;

  const normalizedRelativePath = relativePath.split(path.sep).join('/');
  if (EXCLUDED_RELATIVE_PATHS.has(normalizedRelativePath)) return false;

  const topLevelName = normalizedRelativePath.split('/')[0];
  return !EXCLUDED_NAMES.has(topLevelName);
};

const removeCronsFromVercelConfig = async (workdir) => {
  const vercelConfigPath = path.join(workdir, 'vercel.json');
  const rawConfig = await readFile(vercelConfigPath, 'utf8');
  const config = JSON.parse(rawConfig);

  if (!Array.isArray(config.crons) || config.crons.length === 0) {
    return false;
  }

  delete config.crons;
  await writeFile(vercelConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return true;
};

const runVercelDeploy = (workdir) => new Promise((resolve, reject) => {
  const child = spawn('vercel', ['deploy', '-y'], {
    cwd: workdir,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`vercel deploy exited with code ${code}`));
  });
});

let previewWorkdir = '';

try {
  previewWorkdir = await mkdtemp(path.join(os.tmpdir(), 'rental-system-preview-'));
  await cp(repoRoot, previewWorkdir, {
    recursive: true,
    filter: shouldCopy,
  });

  const removedCrons = await removeCronsFromVercelConfig(previewWorkdir);

  console.log(`Prepared preview workspace: ${previewWorkdir}`);
  if (removedCrons) {
    console.log('Removed crons from preview copy to satisfy Hobby preview limits.');
  } else {
    console.log('No crons were present in preview copy.');
  }

  await runVercelDeploy(previewWorkdir);
} finally {
  if (!keepWorkdir && previewWorkdir) {
    await rm(previewWorkdir, { recursive: true, force: true });
  } else if (previewWorkdir) {
    console.log(`Kept preview workspace at ${previewWorkdir}`);
  }
}
