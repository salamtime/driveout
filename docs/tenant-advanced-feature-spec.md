# Tenant Advanced Feature Spec

This document freezes the intended product behavior for tenant advanced and add-on features before implementation cleanup.

## Source of truth

- Plan defaults live in `/Users/amrani/Desktop/rental-system-frontend/src/config/tenantPlans.js`
- Manual tenant overrides live in tenant `feature_access`
- Route/module enforcement must use `hasFeature(...)`, `requiredFeature`, or `MODULE_FEATURE_REQUIREMENTS`
- Commercial upsell UI must mirror the same behavior and never invent a second access model

## Decision rules

- `Keep and enforce`: the feature is valid and should have real UI/runtime gating
- `Keep as visible lock`: the feature can stay visible if the user gets a clear upgrade state
- `Merge`: the flag should not survive as a separate concept and should be folded into another feature
- `Remove`: the flag should be removed from the feature matrix until there is real product behavior behind it

## Current decision matrix

| Feature key | Current state | Decision | Intended behavior |
| --- | --- | --- | --- |
| `pricing_km_packages` | Wired in UI and service layer | Keep and enforce | Hidden or unavailable outside eligible plans; fully usable when enabled |
| `pricing_tier_rules` | Wired in UI and service layer | Keep and enforce | Hidden or unavailable outside eligible plans; fully usable when enabled |
| `pricing_fuel_rules` | Wired in UI and service layer | Keep and enforce | Hidden or unavailable outside eligible plans; fully usable when enabled |
| `website_editor` | Route and nav gated | Keep and enforce | Website editor only appears and loads when enabled |
| `advanced_roles_permissions` | Mapped to `User & Role Management` | Keep and enforce | User management remains a premium admin capability |
| `project_export` | Route and permission gated | Keep and enforce | Export area only appears and loads when enabled |
| `ocr_id_scan` | Visible with lock/fallback | Keep as visible lock | Scan button can stay visible; OCR processing must lock cleanly on lower plans |
| `whatsapp_tools` | Visible with lock in Rentals | Keep as visible lock | WhatsApp action can stay visible; sending must lock cleanly on lower plans |
| `public_storefront` | Present in plans, weak enforcement | Keep and enforce | Public marketplace/storefront pages must be blocked or redirected when disabled |
| `online_booking` | Present in plans/settings, weak enforcement | Keep and enforce | Public booking flows must be blocked when disabled even if storefront exists |
| `multilingual_storefront` | Plan-only/commercial flag | Keep and enforce | Additional public languages only when enabled; fallback to single-language storefront otherwise |
| `advanced_reporting` | Plan-only/commercial flag | Keep and enforce | Premium reporting surfaces and exports only when enabled |
| `rentals_advanced` | Plan-only flag | Merge | Removed from the active tenant feature matrix until there is a real rental premium capability to enforce |
| `fleet_advanced` | Plan-only flag | Merge | Removed from the active tenant feature matrix until there is a real fleet premium capability to enforce |
| `finance_advanced` | Plan-only flag | Merge | Removed from the active tenant feature matrix until there is a real finance premium capability to enforce |
| `maintenance_advanced` | Plan-only flag | Merge | Removed from the active tenant feature matrix until there is a real maintenance premium capability to enforce |

## Planned implementation scope

### Step 2: public-surface enforcement

Implement real gating for:

- `public_storefront`
- `online_booking`
- `multilingual_storefront`

### Step 3: premium admin-surface enforcement

Implement real gating for:

- `advanced_reporting`

Replace vague umbrella flags by either:

- concrete subordinate features
- or direct inclusion into the base module entitlement

Current result of that merge pass:

- `rentals_advanced` removed from the active matrix
- `fleet_advanced` removed from the active matrix
- `finance_advanced` removed from the active matrix
- `maintenance_advanced` removed from the active matrix

## Merge targets

The following umbrella flags have now been removed from the active tenant matrix and should only come back if they are replaced with concrete product behavior:

- `rentals_advanced`
- `fleet_advanced`
- `finance_advanced`
- `maintenance_advanced`

## Acceptance criteria

Before this cleanup is complete:

1. Every feature in the advanced/add-on list must be one of:
   - enforced and working
   - intentionally visible with a lock/fallback
   - removed from the matrix
2. No feature may remain in plans and upsell UI without a matching runtime behavior.
3. Workspaces, upgrades, and route guards must all agree on the same access model.
