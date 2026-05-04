import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getFlagValues = (flag) => args
  .flatMap((value, index) => (value === flag ? [String(args[index + 1] || '').trim()] : []))
  .filter(Boolean);

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
Usage:
  node scripts/deploy-production-with-tenant-release.mjs --tenant <slug>:<project-ref> [--tenant <slug>:<project-ref>] [--allow-extra]

Description:
  Runs the tenant schema release flow in apply mode for the provided tenants,
  then executes the normal production deployment flow from the exact same local snapshot,
  then verifies the live tenant aliases are serving the current deployment and passing runtime checks.
  This flow is tenant-only and must not target the canonical SaharaX source project.

Flags:
  --tenant <slug>:<project-ref>  Repeatable tenant target, for example owner1:tiynxhosawkclmgcyefe
  --allow-extra                  Relax verification on extra tables/columns/foreign keys
  --help                         Show this help
`);
  process.exit(0);
}

const tenantSpecs = getFlagValues('--tenant');
if (!tenantSpecs.length) {
  throw new Error('Missing at least one --tenant <slug>:<project-ref> target');
}

const allowExtra = hasFlag('--allow-extra');

const runNodeScript = (scriptPath, scriptArgs) => {
  execFileSync('node', [scriptPath, ...scriptArgs], { stdio: 'inherit' });
};

console.log('\n[deploy:production:tenant-release] Step 1/2: Apply tenant schema release gate');
runNodeScript('scripts/run-tenant-schema-release.mjs', [
  ...tenantSpecs.flatMap((value) => ['--tenant', value]),
  '--apply-upgrade',
  ...(allowExtra ? ['--allow-extra'] : []),
]);

console.log('\n[deploy:production:tenant-release] Step 2/3: Run production deploy');
runNodeScript('scripts/deploy-production.mjs', []);

console.log('\n[deploy:production:tenant-release] Step 3/3: Verify live tenant aliases and runtime health');
runNodeScript('tmp/verify_post_deploy_tenant_hosts_guarded.mjs', [
  ...tenantSpecs.flatMap((value) => ['--tenant', value]),
]);
