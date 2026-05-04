import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getFlagValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return '';
  return String(args[index + 1] || '').trim();
};
const getFlagValues = (flag) => args
  .flatMap((value, index) => (value === flag ? [String(args[index + 1] || '').trim()] : []))
  .filter(Boolean);

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
Usage:
  node scripts/run-tenant-schema-release.mjs --tenant <slug>:<project-ref> [--tenant <slug>:<project-ref>] [--apply-upgrade] [--allow-extra]

Description:
  Runs the canonical tenant schema release flow for existing workspaces:
  safe upgrade runner first, then blocking schema verification.
  When --apply-upgrade is used, it also runs a guarded post-upgrade runtime verification.
  This flow is tenant-only and must not target the canonical SaharaX source project.

Flags:
  --tenant <slug>:<project-ref>  Repeatable tenant target, for example owner1:tiynxhosawkclmgcyefe
  --apply-upgrade                Apply the guarded schema upgrade before verification
  --allow-extra                  Relax schema verification on extra tables/columns/foreign keys
  --help                         Show this help
`);
  process.exit(0);
}

const tenantSpecs = getFlagValues('--tenant');
if (!tenantSpecs.length) {
  throw new Error('Missing at least one --tenant <slug>:<project-ref> target');
}

const applyUpgrade = hasFlag('--apply-upgrade');
const allowExtra = hasFlag('--allow-extra');

const tenants = tenantSpecs.map((spec) => {
  const [slug, projectRef] = String(spec).split(':');
  if (!slug || !projectRef) {
    throw new Error(`Invalid --tenant value: ${spec}`);
  }
  return {
    slug: slug.trim(),
    projectRef: projectRef.trim(),
  };
});

const runNodeScript = (scriptPath, scriptArgs) => {
  execFileSync('node', [scriptPath, ...scriptArgs], { stdio: 'inherit' });
};

console.log('\n[schema:release:tenant] Starting canonical tenant schema release run');
console.log(`[schema:release:tenant] Targets: ${tenants.map(({ slug, projectRef }) => `${slug}:${projectRef}`).join(', ')}`);

for (const { slug, projectRef } of tenants) {
  console.log(`\n[schema:release:tenant] Tenant: ${slug}`);
  const totalSteps = applyUpgrade ? 3 : 2;
  console.log(`[schema:release:tenant] Step 1/${totalSteps}: ${applyUpgrade ? 'Apply' : 'Plan'} guarded upgrade`);
  runNodeScript('tmp/run_tenant_schema_upgrade_guarded.mjs', [
    '--target-project-ref',
    projectRef,
    '--target-tenant',
    slug,
    ...(applyUpgrade ? ['--apply'] : []),
  ]);

  console.log(`\n[schema:release:tenant] Step 2/${totalSteps}: Verify canonical release gate`);
  runNodeScript('tmp/verify_tenant_schema_release_guarded.mjs', [
    '--target-project-ref',
    projectRef,
    '--target-tenant',
    slug,
    ...(allowExtra ? ['--allow-extra'] : []),
  ]);

  if (applyUpgrade) {
    console.log(`\n[schema:release:tenant] Step 3/${totalSteps}: Verify post-upgrade runtime health`);
    runNodeScript('tmp/verify_tenant_post_upgrade_guarded.mjs', [
      '--target-project-ref',
      projectRef,
      '--target-tenant',
      slug,
    ]);
  }
}

console.log('\n[schema:release:tenant] Done. All tenant targets passed the canonical release flow.');
