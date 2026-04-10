import { supabase } from '../lib/supabase';
import { fetchTourPackages } from './tourPackageService';

const normalizeMarketplaceStatus = (value, fallback = 'draft') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  const aliases = {
    pending: 'pending_review',
    active: 'live',
    published: 'live',
    hidden: 'unpublished',
    inactive: 'unpublished',
  };

  return aliases[normalized] || normalized;
};

class PlatformExperienceService {
  constructor() {
    this.tableExistenceCache = new Map();
  }

  async checkTableExists(tableName) {
    if (this.tableExistenceCache.has(tableName)) {
      return this.tableExistenceCache.get(tableName);
    }

    try {
      const { error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
      const exists = !error;
      this.tableExistenceCache.set(tableName, exists);
      return exists;
    } catch (error) {
      this.tableExistenceCache.set(tableName, false);
      return false;
    }
  }

  async safeLoadTable(tableName, columns = '*') {
    const exists = await this.checkTableExists(tableName);
    if (!exists) return [];

    try {
      const { data, error } = await supabase.from(tableName).select(columns);
      if (error) return [];
      return data || [];
    } catch (error) {
      return [];
    }
  }

  normalizeListingRow(listing, profilesById) {
    const profile = profilesById.get(String(listing.vehicle_public_profile_id || listing.profile_id || '')) || {};
    const listingStatus = normalizeMarketplaceStatus(listing.listing_status || listing.status || 'draft');
    const ownerType = String(listing.owner_type || profile.owner_type || 'owner').toLowerCase();
    const visibility =
      listingStatus === 'live' && Boolean(profile.marketplace_visible ?? listing.marketplace_visible ?? true);

    return {
      id: String(listing.id),
      title:
        profile.short_description ||
        listing.title ||
        `${ownerType === 'operator' ? 'Operator' : 'Owner'} listing ${String(listing.id).slice(0, 8)}`,
      ownerType,
      listingStatus,
      bookingMode: String(listing.booking_mode || 'request'),
      marketplaceVisible: visibility,
      price:
        Number(listing.hourly_price_amount || 0) ||
        Number(listing.daily_price_amount || 0) ||
        Number(listing.weekly_price_amount || 0) ||
        0,
      depositAmount: Number(listing.deposit_amount || 0),
      updatedAt: listing.updated_at || listing.created_at || null,
    };
  }

  async getPublicContentSnapshot() {
    const [cmsPages, cmsSections, translations, rawListings, rawProfiles, tourPackages] = await Promise.all([
      this.safeLoadTable('cms_pages', 'id,title,slug,is_published,updated_at,created_at'),
      this.safeLoadTable('cms_sections', 'id,page_id,section_key,is_published,updated_at,created_at'),
      this.safeLoadTable('app_translations', 'id,entity_type,entity_id,field_name,language_code'),
      this.safeLoadTable(
        'app_marketplace_listings',
        'id,vehicle_public_profile_id,owner_type,listing_status,status,booking_mode,hourly_price_amount,daily_price_amount,weekly_price_amount,deposit_amount,created_at,updated_at'
      ),
      this.safeLoadTable(
        'app_vehicle_public_profiles',
        'id,owner_type,marketplace_visible,is_active,short_description,updated_at,created_at'
      ),
      fetchTourPackages().catch(() => []),
    ]);

    const profilesById = new Map((rawProfiles || []).map((row) => [String(row.id), row]));
    const listings = (rawListings || []).map((row) => this.normalizeListingRow(row, profilesById));
    const activeMarketplaceCount = listings.filter((row) => row.marketplaceVisible).length;
    const publishedCmsPages = (cmsPages || []).filter((page) => page.is_published !== false).length;
    const publishedCmsSections = (cmsSections || []).filter((section) => section.is_published !== false).length;
    const tourPackageRows = Array.isArray(tourPackages) ? tourPackages : [];
    const websiteVisibleTours = tourPackageRows.filter((pkg) => Boolean(pkg.websiteVisible || pkg.website_visible)).length;

    const contentRows = [
      {
        id: 'home-hero',
        title: 'Homepage hero and conversion entry',
        type: 'homepage',
        status: publishedCmsPages > 0 ? 'connected' : 'fallback',
        detail: publishedCmsPages > 0
          ? `${publishedCmsPages} CMS page(s) available for public content`
          : 'Landing is using code-first content and can later switch to CMS records',
      },
      {
        id: 'tour-preview',
        title: 'Tour preview and website package visibility',
        type: 'tour',
        status: websiteVisibleTours > 0 ? 'ready' : 'hidden',
        detail: `${websiteVisibleTours} website-visible tour package(s) are ready for public discovery`,
      },
      {
        id: 'marketplace-surface',
        title: 'Marketplace discovery surface',
        type: 'marketplace',
        status: activeMarketplaceCount > 0 ? 'ready' : 'quiet',
        detail: `${activeMarketplaceCount} marketplace listing(s) are currently visible on the public catalog`,
      },
      {
        id: 'translations',
        title: 'Dynamic translation coverage',
        type: 'translation',
        status: (translations || []).length > 0 ? 'ready' : 'fallback',
        detail: `${(translations || []).length} translation row(s) found across dynamic entities`,
      }
    ];

    return {
      cmsPagesTotal: (cmsPages || []).length,
      publishedCmsPages,
      publishedCmsSections,
      translationsTotal: (translations || []).length,
      tourPackagesTotal: tourPackageRows.length,
      websiteVisibleTours,
      marketplaceVisibleCount: activeMarketplaceCount,
      contentRows,
      tourRows: tourPackageRows.slice(0, 8).map((pkg) => ({
        id: String(pkg.id),
        title: pkg.name || pkg.title || 'Tour package',
        duration: Number(pkg.duration || 0),
        websiteVisible: Boolean(pkg.websiteVisible || pkg.website_visible),
        active: Boolean(pkg.is_active ?? true),
      }))
    };
  }

  async getMarketplaceControlSnapshot() {
    const [rawListings, rawProfiles] = await Promise.all([
      this.safeLoadTable(
        'app_marketplace_listings',
        'id,vehicle_public_profile_id,owner_type,listing_status,status,booking_mode,hourly_price_amount,daily_price_amount,weekly_price_amount,deposit_amount,created_at,updated_at'
      ),
      this.safeLoadTable(
        'app_vehicle_public_profiles',
        'id,owner_type,owner_id,marketplace_visible,is_active,short_description,updated_at,created_at'
      ),
    ]);

    const profilesById = new Map((rawProfiles || []).map((row) => [String(row.id), row]));
    const listings = (rawListings || []).map((row) => this.normalizeListingRow(row, profilesById));

    const groupedByStatus = listings.reduce((acc, row) => {
      acc[row.listingStatus] = (acc[row.listingStatus] || 0) + 1;
      return acc;
    }, {});

    const groupedByOwnerType = listings.reduce((acc, row) => {
      acc[row.ownerType] = (acc[row.ownerType] || 0) + 1;
      return acc;
    }, {});

    return {
      totalListings: listings.length,
      activeListings: listings.filter((row) => row.marketplaceVisible).length,
      pendingReviewListings: (groupedByStatus.pending_review || 0) + (groupedByStatus.pending || 0),
      draftListings: groupedByStatus.draft || 0,
      operatorListings: groupedByOwnerType.operator || 0,
      ownerListings: groupedByOwnerType.individual_owner || groupedByOwnerType.owner || 0,
      reviewQueue: listings
        .filter((row) => ['pending_review', 'pending', 'draft'].includes(row.listingStatus))
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        .slice(0, 10),
      liveRows: listings
        .filter((row) => row.marketplaceVisible)
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        .slice(0, 8),
    };
  }
}

const platformExperienceService = new PlatformExperienceService();

export default platformExperienceService;
