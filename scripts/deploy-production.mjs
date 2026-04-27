import { execSync } from 'node:child_process';

const run = (command) => {
  execSync(command, { stdio: 'inherit' });
};

const read = (command) => {
  return execSync(command, { encoding: 'utf8' }).trim();
};

const fail = (message) => {
  console.error(`\n[deploy:production] ${message}\n`);
  process.exit(1);
};

const branch = read('git branch --show-current');
const status = read('git status --porcelain');

if (status) {
  fail('Working tree is not clean. Commit or stash changes before deploying.');
}

if (!branch) {
  fail('Could not determine the current branch.');
}

console.log('\n[deploy:production] Verifying production snapshot from local repo...');
console.log(`[deploy:production] Current branch: ${branch}`);
console.log('[deploy:production] Step 1/3: Build local snapshot');
run('npm run build');

console.log('\n[deploy:production] Step 2/3: Push the exact current HEAD to origin/staging');
run('git push origin HEAD:staging');

console.log('\n[deploy:production] Step 3/3: Deploy the same local snapshot to Vercel production');
run('vercel deploy --prod');

console.log('\n[deploy:production] Done. Local -> staging -> production stayed aligned.');
