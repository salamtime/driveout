import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env.vercel.prod', override: false });

const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const managementToken = String(process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim();

const minimumSaharaXLegacyRentals = Number(process.env.SAHARAX_MIN_LEGACY_RENTALS || 100);

if (!url || !anonKey || !serviceKey) {
  throw new Error('Missing Supabase URL, anon key, or service role key.');
}

const projectRef = new URL(url).hostname.split('.')[0];
const admin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const protectedTables = [
  { key: 'rentals', table: 'app_4c3a7a6153_rentals' },
  { key: 'vehicles', table: 'saharax_0u4w4d_vehicles' },
  { key: 'customers', table: 'app_4c3a7a6153_customers' },
  { key: 'maintenance', table: 'app_687f658e98_maintenance' },
  { key: 'receiveFunds', table: 'app_4c3a7a6153_receive_funds_entries' },
  { key: 'financeExpenses', table: 'finance_expenses' },
];

const normalize = (value) => String(value || '').trim().toLowerCase();

const requireSingle = (label, rows) => {
  if (!rows?.length) {
    throw new Error(`Missing ${label}`);
  }
  return rows[0];
};

const readResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const runManagementSql = async (query) => {
  if (!managementToken) {
    return { skipped: 'missing_management_token' };
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${managementToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, read_only: true }),
  });

  const payload = await readResponse(response);
  if (!response.ok) {
    return { error: payload?.message || payload?.error || payload?.raw || `Query failed: ${response.status}` };
  }

  return Array.isArray(payload) ? payload : payload.data || payload.result || payload.rows || [];
};

const countQuery = async (client, table, build = (query) => query) => {
  const base = client.from(table).select('id', { count: 'exact', head: true });
  const { count, error } = await build(base);
  if (error) {
    return { error: error.message || 'Query failed', code: error.code || null };
  }
  return { count: Number(count || 0) };
};

const countValue = (result) => {
  if (result?.error) return 0;
  return Number(result?.count || 0);
};

const createUserSessionClient = async (email) => {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: 'http://localhost:5173/auth/callback',
    },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`Failed to generate verification session for ${email}: ${linkError?.message || 'missing token'}`);
  }

  const verifier = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: sessionData, error: sessionError } = await verifier.auth.verifyOtp({
    type: linkData.properties.verification_type || 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });

  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error(`Failed to verify session for ${email}: ${sessionError?.message || 'missing access token'}`);
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const { data: organizations, error: organizationError } = await admin
  .from('app_organizations')
  .select('id,name,slug,organization_type,is_platform_organization,created_at')
  .order('created_at', { ascending: true });

if (organizationError) {
  throw organizationError;
}

const platformOrg = requireSingle(
  'platform organization',
  (organizations || []).filter((org) => Boolean(org.is_platform_organization))
);

const offroadOrg = requireSingle(
  'OFFROAD organization',
  (organizations || []).filter(
    (org) => normalize(org.name).includes('offroad') || normalize(org.slug).includes('offroad')
  )
);

const { data: platformUsers, error: platformUserError } = await admin
  .from('app_b30c02e74da644baad4668e3587d86b1_users')
  .select('id,email,role,primary_organization_id')
  .eq('primary_organization_id', platformOrg.id)
  .not('email', 'is', null)
  .order('created_at', { ascending: true })
  .limit(10);

if (platformUserError) {
  throw platformUserError;
}

const { data: offroadUsers, error: offroadUserError } = await admin
  .from('app_b30c02e74da644baad4668e3587d86b1_users')
  .select('id,email,role,primary_organization_id')
  .eq('primary_organization_id', offroadOrg.id)
  .not('email', 'is', null)
  .order('created_at', { ascending: true })
  .limit(10);

if (offroadUserError) {
  throw offroadUserError;
}

const platformUser = requireSingle('platform user', platformUsers);
const offroadUser = requireSingle('OFFROAD user', offroadUsers);
const [platformClient, offroadClient] = await Promise.all([
  createUserSessionClient(platformUser.email),
  createUserSessionClient(offroadUser.email),
]);

const countProtectedTable = async (client, tableConfig, orgFilter = 'all') => {
  if (orgFilter === 'all') {
    return countQuery(client, tableConfig.table);
  }

  if (orgFilter === 'legacy') {
    return countQuery(client, tableConfig.table, (query) => query.is('organization_id', null));
  }

  const orgId = orgFilter === 'platform' ? platformOrg.id : offroadOrg.id;
  return countQuery(client, tableConfig.table, (query) => query.eq('organization_id', orgId));
};

const buildProtectedTableAudit = async (client) => {
  const entries = await Promise.all(
    protectedTables.map(async (tableConfig) => {
      const [all, legacyNullOrg, platformOrgRows, offroadOrgRows] = await Promise.all([
        countProtectedTable(client, tableConfig, 'all'),
        countProtectedTable(client, tableConfig, 'legacy'),
        countProtectedTable(client, tableConfig, 'platform'),
        countProtectedTable(client, tableConfig, 'offroad'),
      ]);

      return [
        tableConfig.key,
        {
          table: tableConfig.table,
          all,
          legacyNullOrg,
          platformOrg: platformOrgRows,
          offroadOrg: offroadOrgRows,
        },
      ];
    })
  );

  return Object.fromEntries(entries);
};

const [adminCounts, platformCounts, offroadCounts, policyState] = await Promise.all([
  buildProtectedTableAudit(admin),
  buildProtectedTableAudit(platformClient),
  buildProtectedTableAudit(offroadClient),
  runManagementSql(`
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced,
      count(p.policyname)::int as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
    where n.nspname = 'public'
      and c.relname in (${protectedTables.map((table) => `'${table.table}'`).join(', ')})
    group by c.relname, c.relrowsecurity, c.relforcerowsecurity
    order by c.relname;
  `),
]);

const { data: offroadSaharaXPlateRows, error: offroadSaharaXPlateError } = await offroadClient
  .from('app_4c3a7a6153_rentals')
  .select('id,rental_id,vehicle_plate_number,organization_id')
  .in('vehicle_plate_number', ['48952', '48956', '48957', '48959'])
  .limit(1);

const failures = [];

const assertZero = (label, result) => {
  if (result?.error) {
    failures.push(`${label}: query failed (${result.code || 'unknown'} ${result.error})`);
    return;
  }

  if (countValue(result) !== 0) {
    failures.push(`${label}: expected 0, got ${countValue(result)}`);
  }
};

if (countValue(platformCounts.rentals?.legacyNullOrg) < minimumSaharaXLegacyRentals) {
  failures.push(
    `SaharaX legacy rental visibility dropped below ${minimumSaharaXLegacyRentals}; got ${countValue(platformCounts.rentals?.legacyNullOrg)}`
  );
}

if (countValue(platformCounts.rentals?.all) !== countValue(adminCounts.rentals?.all)) {
  failures.push(
    `SaharaX rental total mismatch: platform sees ${countValue(platformCounts.rentals?.all)}, admin sees ${countValue(adminCounts.rentals?.all)}`
  );
}

for (const tableConfig of protectedTables) {
  assertZero(`OFFROAD ${tableConfig.key} legacy rows`, offroadCounts[tableConfig.key]?.legacyNullOrg);
  assertZero(`OFFROAD ${tableConfig.key} platform rows`, offroadCounts[tableConfig.key]?.platformOrg);

  const allVisible = countValue(offroadCounts[tableConfig.key]?.all);
  const ownOrgVisible = countValue(offroadCounts[tableConfig.key]?.offroadOrg);
  if (allVisible !== ownOrgVisible) {
    failures.push(
      `OFFROAD ${tableConfig.key}: visible total ${allVisible} does not match own-org total ${ownOrgVisible}`
    );
  }
}

if (offroadSaharaXPlateError) {
  failures.push(`OFFROAD SaharaX plate probe failed: ${offroadSaharaXPlateError.message}`);
} else if ((offroadSaharaXPlateRows || []).length > 0) {
  failures.push('OFFROAD can read at least one SaharaX plate rental.');
}

if (Array.isArray(policyState)) {
  for (const tableConfig of protectedTables) {
    const tablePolicy = policyState.find((row) => row.table_name === tableConfig.table);
    if (!tablePolicy) {
      failures.push(`${tableConfig.table}: missing policy metadata`);
      continue;
    }

    if (!tablePolicy.rls_enabled || !tablePolicy.rls_forced) {
      failures.push(`${tableConfig.table}: RLS must be enabled and forced`);
    }

    if (Number(tablePolicy.policy_count || 0) < 4) {
      failures.push(`${tableConfig.table}: expected at least 4 scoped policies, got ${tablePolicy.policy_count}`);
    }
  }
} else if (policyState?.error) {
  failures.push(`Policy metadata query failed: ${policyState.error}`);
} else {
  failures.push('Policy metadata query did not return rows.');
}

const report = {
  ok: failures.length === 0,
  projectRef,
  minimumSaharaXLegacyRentals,
  users: {
    platform: {
      id: platformUser.id,
      email: platformUser.email,
      role: platformUser.role,
      organizationId: platformUser.primary_organization_id,
    },
    offroad: {
      id: offroadUser.id,
      email: offroadUser.email,
      role: offroadUser.role,
      organizationId: offroadUser.primary_organization_id,
    },
  },
  organizations: {
    platform: platformOrg,
    offroad: offroadOrg,
  },
  counts: {
    admin: adminCounts,
    platformSession: platformCounts,
    offroadSession: offroadCounts,
  },
  policyState,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
