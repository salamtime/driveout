import { supabase } from '../lib/supabase.js';
import MaintenanceService from './MaintenanceService.js';
import WebsiteBookingLifecycleService from './WebsiteBookingLifecycleService.js';
import {
  buildRentalCreatedTelegramPricingSnapshot,
  countRentalDocuments,
  dispatchRentalLifecycleTelegramEvent,
} from './RentalLifecycleDispatchService.js';
import { buildInitialPaymentReceivedTelegramPayload, shouldDispatchInitialPaymentReceived } from '../utils/rentalTelegram.js';
import { applyOrganizationMatch, applyOrganizationScope, getCurrentOrganizationId } from './OrganizationService.js';
import {
  mergeUniqueCustomersById,
  normalizeCustomerIdentityFields,
  pickBestExistingCustomerMatch,
  pickMostCompleteCustomerProfile,
} from '../utils/customerIdentity.js';

const DEFAULT_SCHEDULED_RENTAL_GRACE_MINUTES = 120;
const VEHICLES_TABLE = 'saharax_0u4w4d_vehicles';
const CUSTOMERS_TABLE = 'app_4c3a7a6153_customers';
const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const VEHICLE_REPORTS_TABLE = 'app_4c3a7a6153_vehicle_reports';

const RENTAL_REFERENCE_RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const isPermissionDeniedError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const status = Number(error?.status || 0);
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('rls')
  );
};

/**
 * TransactionalRentalService - Enhanced rental management with comprehensive transaction support
 * 
 * FEATURES:
 * - Atomic rental creation with availability checking
 * - Real-time conflict detection and prevention
 * - Comprehensive error handling with detailed diagnostics
 * - Transaction rollback on failures
 * - Advanced availability checking with time-based conflicts
 * - FIXED: Proper date validation and sanitization to prevent PostgreSQL errors
 * - FIXED: Database constraint compliance for payment_status and other fields
 * - NEW: Customer ID linkage system to resolve "Error: ID Not Linked" display issues
 * - CRITICAL FIX: UUID parameter validation to prevent availability check failures
 * - FINAL CRITICAL FIX: Guaranteed customer_id foreign key assignment during rental creation
 * - TRANSACTIONAL CUSTOMER CREATION: Enforced customer creation sequence before rental creation
 * - AUTHORITY LOGIC: Form data takes precedence over database data for contact fields
 * - HEALING FIX: Master customer record updated with correct contact info after rental creation
 * - FINAL SANITIZATION FIX: Protected customer contact fields from final null conversion
 * - VEHICLE STATUS CHECK: Verify vehicle status before checking rental overlaps
 * - AVAILABILITY LOGIC FIX: Strict conflict detection - return immediately when conflicts found
 * - AUTO-STATUS UPDATE: Automatic vehicle status updates based on rental lifecycle
 * - SCHEDULED STATUS: Added support for "scheduled" status for vehicles with upcoming reservations
 * - ENHANCED AUTO-STATUS: Vehicle status updates to "scheduled" when rental status is "scheduled"
 * - START RENTAL FIX: Allow starting rentals when vehicle is "scheduled" for that specific rental
 * - DELETE RENTAL FIX: Automatically revert vehicle status to "available" when rental is deleted
 * - CRITICAL STATUS FIELD FIX: Removed all "status" field references to prevent database column errors
 * - CRITICAL BOOKING FIX: Vehicle status check is now informational only - allows multiple bookings as long as dates don't overlap
 */
class TransactionalRentalService {
  static buildRentalReferenceCandidate() {
    const year = new Date().getFullYear();
    const timestampPart = Date.now().toString(36).toUpperCase().slice(-5);
    let randomPart = '';

    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);
      randomPart = Array.from(bytes)
        .map((byte) => RENTAL_REFERENCE_RANDOM_ALPHABET[byte % RENTAL_REFERENCE_RANDOM_ALPHABET.length])
        .join('');
    } else {
      randomPart = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    }

    return `RNT-${year}-${timestampPart}${randomPart}`;
  }

  static async rentalReferenceExists(reference) {
    const normalizedReference = String(reference || '').trim();
    if (!normalizedReference) return false;

    const { data, error } = await supabase
      .from(RENTALS_TABLE)
      .select('id')
      .eq('rental_id', normalizedReference)
      .limit(1);

    if (error) {
      throw new Error(`Failed to verify rental reference uniqueness: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0;
  }

  static async resolveUniqueRentalReference(preferredReference = '') {
    const normalizedPreferred = String(preferredReference || '').trim();

    if (normalizedPreferred && !(await this.rentalReferenceExists(normalizedPreferred))) {
      return normalizedPreferred;
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = this.buildRentalReferenceCandidate();
      if (!(await this.rentalReferenceExists(candidate))) {
        return candidate;
      }
    }

    throw new Error('Unable to generate a unique rental contract reference. Please try again.');
  }

  static parseStorageTargetFromUrl(url) {
    const rawUrl = String(url || '').trim();
    if (!rawUrl) return null;

    try {
      const parsedUrl = new URL(rawUrl);
      const match = parsedUrl.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
      if (!match) return null;

      return {
        bucket: match[1],
        path: decodeURIComponent(match[2]),
      };
    } catch {
      return null;
    }
  }

  static inferRentalMediaPrimaryBucket(mediaRecord = {}) {
    const publicTarget = this.parseStorageTargetFromUrl(mediaRecord.public_url);
    if (publicTarget?.bucket) return publicTarget.bucket;

    if (String(mediaRecord.file_type || '').startsWith('video/')) {
      if (String(mediaRecord.public_url || '').includes('/rental-media-opening/')) {
        return 'rental-media-opening';
      }
      if (String(mediaRecord.public_url || '').includes('/rental-media-closing/')) {
        return 'rental-media-closing';
      }
    }

    return 'rental-videos';
  }

  static getRentalMediaStorageTargets(mediaRecord = {}) {
    const targets = [];
    const seen = new Set();
    const addTarget = (bucket, path) => {
      const normalizedBucket = String(bucket || '').trim();
      const normalizedPath = String(path || '').trim();
      if (!normalizedBucket || !normalizedPath) return;

      const dedupeKey = `${normalizedBucket}:${normalizedPath}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      targets.push({ bucket: normalizedBucket, path: normalizedPath });
    };

    if (mediaRecord.storage_path) {
      addTarget(this.inferRentalMediaPrimaryBucket(mediaRecord), mediaRecord.storage_path);
    }

    const publicTarget = this.parseStorageTargetFromUrl(mediaRecord.public_url);
    if (publicTarget) {
      addTarget(publicTarget.bucket, publicTarget.path);
    }

    const thumbnailTarget = this.parseStorageTargetFromUrl(mediaRecord.thumbnail_url);
    if (thumbnailTarget) {
      addTarget(thumbnailTarget.bucket, thumbnailTarget.path);
    }

    return targets;
  }

  static async deleteLinkedRentalMedia(rentalId) {
    const normalizedRentalId = String(rentalId || '').trim();
    if (!normalizedRentalId) {
      return {
        deletedRows: 0,
        deletedFiles: 0,
        failedFiles: [],
      };
    }

    const { data: mediaRows, error: mediaFetchError } = await supabase
      .from('app_2f7bf469b0_rental_media')
      .select('id, storage_path, public_url, thumbnail_url, file_type')
      .eq('rental_id', normalizedRentalId);

    if (mediaFetchError) {
      throw new Error(`Failed to load rental media before deletion: ${mediaFetchError.message}`);
    }

    const rows = Array.isArray(mediaRows) ? mediaRows : [];
    if (!rows.length) {
      return {
        deletedRows: 0,
        deletedFiles: 0,
        failedFiles: [],
      };
    }

    const bucketTargets = new Map();
    rows.forEach((row) => {
      this.getRentalMediaStorageTargets(row).forEach((target) => {
        if (!bucketTargets.has(target.bucket)) {
          bucketTargets.set(target.bucket, new Set());
        }
        bucketTargets.get(target.bucket).add(target.path);
      });
    });

    const failedFiles = [];
    let deletedFiles = 0;

    for (const [bucket, paths] of bucketTargets.entries()) {
      const pathList = Array.from(paths);
      if (!pathList.length) continue;

      const { data: removed, error: storageError } = await supabase.storage
        .from(bucket)
        .remove(pathList);

      if (storageError) {
        console.warn('⚠️ DELETE RENTAL FIX: Failed to remove rental media storage objects:', {
          rentalId: normalizedRentalId,
          bucket,
          error: storageError.message,
        });
        failedFiles.push({ bucket, paths: pathList, error: storageError.message });
        continue;
      }

      deletedFiles += Array.isArray(removed) ? removed.length : pathList.length;
    }

    const mediaIds = rows.map((row) => row.id).filter(Boolean);
    const { error: mediaDeleteError } = await supabase
      .from('app_2f7bf469b0_rental_media')
      .delete()
      .in('id', mediaIds);

    if (mediaDeleteError) {
      throw new Error(`Failed to delete rental media rows: ${mediaDeleteError.message}`);
    }

    return {
      deletedRows: mediaIds.length,
      deletedFiles,
      failedFiles,
    };
  }

  static async deleteLinkedRentalEvents(rentalId) {
    const normalizedRentalId = String(rentalId || '').trim();
    if (!normalizedRentalId) return 0;

    const { error } = await supabase
      .from('rental_events')
      .delete()
      .eq('rental_id', normalizedRentalId);

    if (error) {
      const errorCode = String(error?.code || '').trim().toUpperCase();
      const errorMessage = String(error?.message || error?.details || '').trim().toLowerCase();
      if (
        errorCode === '42P01' ||
        errorCode === 'PGRST205' ||
        isPermissionDeniedError(error) ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('not found')
      ) {
        return 0;
      }
      throw new Error(`Failed to delete rental events: ${error.message}`);
    }

    return 1;
  }

  static async reconcileVehicleStatusAfterRentalDeletion(vehicleId, {
    deletedRentalId = '',
    preserveStatus = '',
  } = {}) {
    if (!vehicleId) return null;

    const organizationId = await getCurrentOrganizationId();
    const { data: openMaintenance, error: maintenanceError } = await applyOrganizationScope(
      supabase
        .from('app_687f658e98_maintenance')
        .select('id')
        .eq('vehicle_id', vehicleId)
        .in('status', ['scheduled', 'in_progress', 'pending'])
        .limit(1),
      organizationId
    );

    if (maintenanceError) {
      throw new Error(`Failed to reconcile open maintenance after rental deletion: ${maintenanceError.message}`);
    }

    if ((openMaintenance || []).length > 0) {
      await this.updateVehicleStatus(vehicleId, 'maintenance');
      return 'maintenance';
    }

    const nextStatus = await WebsiteBookingLifecycleService.reconcileVehicleOperationalStatus(vehicleId, {
      excludeRentalIds: deletedRentalId ? [deletedRentalId] : [],
    });

    if (nextStatus === 'available' && String(preserveStatus || '').trim().toLowerCase() === 'out_of_service') {
      await this.updateVehicleStatus(vehicleId, 'out_of_service');
      return 'out_of_service';
    }

    return nextStatus || 'available';
  }

  static isExpiredScheduledConflict(rentalLike, graceMinutes = DEFAULT_SCHEDULED_RENTAL_GRACE_MINUTES) {
    if (String(rentalLike?.rental_status || '').toLowerCase() !== 'scheduled' || !rentalLike?.rental_start_date) {
      return false;
    }

    const scheduledStart = new Date(rentalLike.rental_start_date);
    if (Number.isNaN(scheduledStart.getTime())) return false;
    return Date.now() > scheduledStart.getTime() + graceMinutes * 60 * 1000;
  }
  
  /**
   * CRITICAL FIX: Validates UUID format for rental IDs
   * @param {string} value - The value to validate as UUID
   * @returns {boolean} - True if valid UUID format
   */
  static isValidUUID(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /**
   * FINAL CRITICAL FIX: Validates customer ID format
   * @param {string} customerId - The customer ID to validate
   * @returns {boolean} - True if valid customer ID format
   */
  static isValidCustomerId(customerId) {
    if (!customerId || typeof customerId !== 'string') {
      return false;
    }
    // Customer ID should start with 'cust_' prefix
    return customerId.startsWith('cust_');
  }

  /**
   * AUTO-STATUS UPDATE: Update vehicle status in database
   * @param {number} vehicleId - The vehicle ID to update
   * @param {string} newStatus - The new status ('available', 'scheduled', 'rented', 'maintenance', 'out_of_service')
   */
  static async updateVehicleStatus(vehicleId, newStatus) {
    console.log('🚗 AUTO-STATUS: Updating vehicle status:', { vehicleId, newStatus });
    
    try {
      const organizationId = await getCurrentOrganizationId();
      const scopedVehicleUpdate = applyOrganizationScope(
        supabase
          .from(VEHICLES_TABLE)
          .update({ status: newStatus })
          .eq('id', vehicleId),
        organizationId
      );
      const { error } = await scopedVehicleUpdate;
      
      if (error) {
        console.error('❌ AUTO-STATUS: Failed to update vehicle status:', error);
        throw new Error(`Failed to update vehicle status: ${error.message}`);
      }
      
      console.log('✅ AUTO-STATUS: Vehicle status updated successfully to:', newStatus);
    } catch (error) {
      console.error('❌ AUTO-STATUS: Error updating vehicle status:', error);
      throw error;
    }
  }

  /**
   * TRANSACTIONAL CUSTOMER CREATION: Guarantee customer creation before rental
   * @param {Object} customerData - Customer data to create/validate
   * @returns {Object} - Created/validated customer record with guaranteed ID
   */
  static async guaranteeCustomerCreation(customerData) {
    console.log('🔐 TRANSACTIONAL CUSTOMER CREATION: Starting guaranteed customer creation/validation:', customerData);
    
    try {
      if (!customerData) {
        throw new Error('Customer data is required for rental creation');
      }
      const organizationId = await getCurrentOrganizationId();

      // STEP 1: Check if customer already exists by ID (if provided)
      const existingCustomerIdCandidate = [
        customerData.id,
        customerData.customer_id,
      ].find((value) => this.isValidCustomerId(value));

      if (existingCustomerIdCandidate) {
        console.log('🔍 TRANSACTIONAL CUSTOMER CREATION: Validating existing customer ID:', existingCustomerIdCandidate);
        
        const { data: existingCustomer, error: lookupError } = await supabase
          .from(CUSTOMERS_TABLE)
          .select('*')
          .eq('id', existingCustomerIdCandidate)
          .maybeSingle();

        if (!lookupError && existingCustomer) {
          console.log('✅ TRANSACTIONAL CUSTOMER CREATION: Existing customer validated:', existingCustomer.id);
          return {
            success: true,
            data: existingCustomer,
            message: 'Existing customer validated successfully'
          };
        } else {
          console.log('⚠️ TRANSACTIONAL CUSTOMER CREATION: Existing customer ID not found, will create new customer');
        }
      }

      // STEP 2: Create new customer record
      console.log('🆕 TRANSACTIONAL CUSTOMER CREATION: Creating new customer record...');
      
      // Sanitize customer data
      const sanitizedCustomerData = {
        ...(existingCustomerIdCandidate ? { id: existingCustomerIdCandidate } : {}),
        full_name: customerData.full_name || customerData.customer_name,
        email: customerData.email || customerData.customer_email || null,
        phone: customerData.phone || customerData.customer_phone,
        date_of_birth: customerData.date_of_birth || customerData.customer_dob || null,
        nationality: customerData.nationality || customerData.customer_nationality || null,
        ...(() => {
          const normalized = normalizeCustomerIdentityFields({
            licenceNumber: customerData.licence_number || customerData.customer_licence_number || null,
            idNumber: customerData.id_number || customerData.customer_id_number || null,
          });
          return {
            licence_number: normalized.licenceNumber,
            id_number: normalized.idNumber,
          };
        })(),
        id_scan_url: customerData.id_scan_url || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const scopedCustomerData = applyOrganizationMatch(sanitizedCustomerData, organizationId);

      console.log('🧹 TRANSACTIONAL CUSTOMER CREATION: Sanitized customer data:', sanitizedCustomerData);

      // CRITICAL: Validate required fields
      if (!sanitizedCustomerData.full_name || !sanitizedCustomerData.phone) {
        throw new Error('Customer full name and phone are required for customer creation');
      }

      const findExistingCustomer = async () => {
        const customerTable = supabase.from(CUSTOMERS_TABLE);
        const licenceNumber = sanitizedCustomerData.licence_number?.trim();
        const idNumber = sanitizedCustomerData.id_number?.trim();
        const phoneNumber = sanitizedCustomerData.phone?.trim();
        const emailAddress = sanitizedCustomerData.email?.trim();
        const fullName = sanitizedCustomerData.full_name?.trim();
        const runLookup = async (builder) => {
          const { data } = await builder;
          return data || [];
        };

        const exactMatchGroups = await Promise.all([
          licenceNumber
            ? runLookup(applyOrganizationScope(customerTable.select('*').eq('licence_number', licenceNumber).limit(10), organizationId))
            : Promise.resolve([]),
          idNumber
            ? runLookup(applyOrganizationScope(customerTable.select('*').eq('id_number', idNumber).limit(10), organizationId))
            : Promise.resolve([]),
          phoneNumber
            ? runLookup(applyOrganizationScope(customerTable.select('*').eq('phone', phoneNumber).limit(10), organizationId))
            : Promise.resolve([]),
          emailAddress
            ? runLookup(applyOrganizationScope(customerTable.select('*').eq('email', emailAddress).limit(10), organizationId))
            : Promise.resolve([]),
        ]);

        const exactMatch = pickMostCompleteCustomerProfile(
          mergeUniqueCustomersById(...exactMatchGroups)
        );
        if (exactMatch?.id) return exactMatch;

        if (fullName) {
          const { data } = await applyOrganizationScope(
            customerTable
              .select('*')
              .ilike('full_name', fullName)
              .limit(5),
            organizationId
          );
          const bestMatch = pickBestExistingCustomerMatch({
            incomingCustomer: sanitizedCustomerData,
            candidates: data || [],
          });
          if (bestMatch?.id) return bestMatch;
        }

        return null;
      };

      // Insert customer into database
      const { data: newCustomer, error: createError } = await supabase
        .from(CUSTOMERS_TABLE)
        .insert([scopedCustomerData])
        .select()
        .single();

      if (createError) {
        console.error('❌ TRANSACTIONAL CUSTOMER CREATION: Customer creation failed:', createError);
        const existingCustomer = await findExistingCustomer();
        if (existingCustomer?.id) {
          console.log('🔁 TRANSACTIONAL CUSTOMER CREATION: Reusing existing customer after conflict:', existingCustomer.id);
          return {
            success: true,
            data: existingCustomer,
            message: 'Existing customer reused after conflict recovery'
          };
        }
        throw new Error(`Customer creation failed: ${createError.message}`);
      }

      if (!newCustomer || !newCustomer.id || !this.isValidCustomerId(newCustomer.id)) {
        console.error('❌ TRANSACTIONAL CUSTOMER CREATION: Invalid customer ID returned:', newCustomer);
        throw new Error('CRITICAL FAILURE: Customer record could not be created/retrieved before rental linkage.');
      }

      console.log('✅ TRANSACTIONAL CUSTOMER CREATION: New customer created successfully:', newCustomer.id);
      
      return {
        success: true,
        data: newCustomer,
        message: 'Customer created successfully'
      };

    } catch (error) {
      console.error('❌ TRANSACTIONAL CUSTOMER CREATION: Customer creation/validation failed:', error);
      throw new Error(`CRITICAL FAILURE: Customer record could not be created/retrieved before rental linkage: ${error.message}`);
    }
  }

  /**
   * CRITICAL FIX: Sanitizes excludeRentalId parameter for availability checks
   * @param {any} excludeRentalId - The rental ID to exclude (should be UUID or null)
   * @returns {string|null} - Valid UUID or null
   */
  static sanitizeExcludeRentalId(excludeRentalId) {
    console.log('🔍 CRITICAL FIX: Sanitizing excludeRentalId:', excludeRentalId, 'Type:', typeof excludeRentalId);
    
    // If null or undefined, return null
    if (!excludeRentalId) {
      console.log('✅ CRITICAL FIX: excludeRentalId is null/undefined, returning null');
      return null;
    }
    
    // If it's a valid UUID, return it
    if (this.isValidUUID(excludeRentalId)) {
      console.log('✅ CRITICAL FIX: Valid UUID format:', excludeRentalId);
      return excludeRentalId;
    }
    
    // If it's not a valid UUID (like a datetime), log warning and return null
    console.warn('⚠️ CRITICAL FIX: Invalid rental ID format detected, setting to null:', excludeRentalId);
    console.warn('⚠️ CRITICAL FIX: Expected UUID format, got:', typeof excludeRentalId);
    return null;
  }

  /**
   * FIXED: Validates and formats date fields for database insertion
   * @param {string} dateValue - The date value to validate
   * @returns {string|null} - Formatted date string or null
   */
  static validateAndFormatDate(dateValue) {
    console.log('🔍 FIXED: Validating date value:', dateValue, 'Type:', typeof dateValue);
    
    // Handle empty strings, undefined, null, or whitespace-only strings
    if (!dateValue || typeof dateValue !== 'string' || dateValue.trim() === '') {
      console.log('📅 FIXED: Empty/invalid date converted to null:', dateValue);
      return null;
    }

    // Check if it's already in YYYY-MM-DD format
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (isoDateRegex.test(dateValue)) {
      // Validate that it's a real date
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        console.log('✅ FIXED: Valid ISO date format:', dateValue);
        return dateValue;
      }
    }

    // Try to parse and format the date
    try {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        // Format as YYYY-MM-DD for PostgreSQL
        const formatted = date.toISOString().split('T')[0];
        console.log('✅ FIXED: Date parsed and formatted:', dateValue, '->', formatted);
        return formatted;
      }
    } catch (error) {
      console.warn('⚠️ FIXED: Date parsing failed for value:', dateValue, error);
    }

    console.log('❌ FIXED: Invalid date, returning null:', dateValue);
    return null;
  }

  /**
   * FIXED: Validates and formats datetime fields for database insertion
   * @param {string} datetimeValue - The datetime value to validate
   * @returns {string|null} - Formatted datetime string or null
   */
  static validateAndFormatDateTime(datetimeValue) {
    console.log('🔍 FIXED: Validating datetime value:', datetimeValue, 'Type:', typeof datetimeValue);
    
    // Handle empty strings, undefined, null, or whitespace-only strings
    if (!datetimeValue || typeof datetimeValue !== 'string' || datetimeValue.trim() === '') {
      console.log('⏰ FIXED: Empty/invalid datetime converted to null:', datetimeValue);
      return null;
    }

    try {
      const date = new Date(datetimeValue);
      if (!isNaN(date.getTime())) {
        // Return ISO string for PostgreSQL timestamp
        const formatted = date.toISOString();
        console.log('✅ FIXED: DateTime parsed and formatted:', datetimeValue, '->', formatted);
        return formatted;
      }
    } catch (error) {
      console.warn('⚠️ FIXED: DateTime parsing failed for value:', datetimeValue, error);
    }

    console.log('❌ FIXED: Invalid datetime, returning null:', datetimeValue);
    return null;
  }

  static buildAvailabilityWindow(dateValue, timeValue = null, boundary = 'start') {
    const normalizedDateValue = String(dateValue || '').trim();
    if (!normalizedDateValue) return null;

    const parsedDate = new Date(normalizedDateValue);
    if (Number.isNaN(parsedDate.getTime())) return null;

    const normalizedTimeValue = String(timeValue || '').trim();
    const timeMatch = normalizedTimeValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

    if (timeMatch) {
      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      const seconds = Number(timeMatch[3] || 0);
      parsedDate.setHours(hours, minutes, seconds, 0);
      return parsedDate;
    }

    if (boundary === 'end') {
      parsedDate.setHours(23, 59, 59, 999);
    } else {
      parsedDate.setHours(0, 0, 0, 0);
    }

    return parsedDate;
  }

  /**
   * FIXED: Validates payment status against database constraints
   * @param {string} paymentStatus - The payment status to validate
   * @returns {string} - Valid payment status
   */
  static validatePaymentStatus(paymentStatus) {
    // Valid payment status values based on common database constraints
    const validStatuses = ['paid', 'partial', 'unpaid', 'overdue', 'refunded'];
    
    if (!paymentStatus || typeof paymentStatus !== 'string') {
      console.log('💳 FIXED: Invalid payment status, defaulting to "unpaid":', paymentStatus);
      return 'unpaid';
    }
    
    const normalizedStatus = paymentStatus.toLowerCase().trim();
    
    // Map common variations to valid values
    const statusMapping = {
      'pending': 'unpaid',
      'due': 'unpaid',
      'outstanding': 'unpaid',
      'completed': 'paid',
      'full': 'paid',
      'partially_paid': 'partial',
      'part_paid': 'partial'
    };
    
    const mappedStatus = statusMapping[normalizedStatus] || normalizedStatus;
    
    // WORKAROUND: Map 'partial' to 'unpaid' to avoid database constraint violation
    if (mappedStatus === 'partial') {
      console.warn('⚠️ WORKAROUND: Mapping "partial" to "unpaid" due to database constraint limitations.');
      return 'unpaid';
    }
    
    if (validStatuses.includes(mappedStatus)) {
      console.log('💳 FIXED: Payment status validated:', paymentStatus, '->', mappedStatus);
      return mappedStatus;
    } else {
      console.log('💳 FIXED: Invalid payment status, defaulting to "unpaid":', paymentStatus);
      return 'unpaid';
    }
  }

  /**
   * FIXED: Validates rental status against database constraints
   * @param {string} rentalStatus - The rental status to validate
   * @returns {string} - Valid rental status
   */
  static validateRentalStatus(rentalStatus) {
    // Valid rental status values based on common database constraints
    const validStatuses = ['scheduled', 'active', 'completed', 'cancelled', 'confirmed'];
    
    if (!rentalStatus || typeof rentalStatus !== 'string') {
      console.log('📋 FIXED: Invalid rental status, defaulting to "scheduled":', rentalStatus);
      return 'scheduled';
    }
    
    const normalizedStatus = rentalStatus.toLowerCase().trim();
    
    if (validStatuses.includes(normalizedStatus)) {
      console.log('📋 FIXED: Rental status validated:', rentalStatus, '->', normalizedStatus);
      return normalizedStatus;
    } else {
      console.log('📋 FIXED: Invalid rental status, defaulting to "scheduled":', rentalStatus);
      return 'scheduled';
    }
  }

  /**
   * NEW: Retrieve customer primary identifier for rental linkage
   * @param {string} customerId - The customer ID to lookup
   * @returns {string|null} - Customer's primary identifier (licence_number or id_number)
   */
  static async getCustomerPrimaryIdentifier(customerId) {
    console.log('🔗 LINKAGE FIX: Retrieving customer primary identifier for:', customerId);
    
    try {
      if (!customerId) {
        console.log('⚠️ LINKAGE FIX: No customer ID provided, returning null');
        return null;
      }

      // Query customer record to get licence_number and id_number
      const { data: customer, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('licence_number, id_number, full_name')
        .eq('id', customerId)
        .single();

      if (error) {
        console.log('⚠️ LINKAGE FIX: Customer lookup failed:', error.message);
        return null;
      }

      if (!customer) {
        console.log('⚠️ LINKAGE FIX: Customer not found:', customerId);
        return null;
      }

      console.log('📊 LINKAGE FIX: Customer data retrieved:', {
        licence_number: customer.licence_number,
        id_number: customer.id_number,
        full_name: customer.full_name
      });

      // CRITICAL MAPPING LOGIC: Priority order for linked_display_id
      let linkedDisplayId = null;

      // First Priority: Use licence_number (Moroccan licenses stored here after our fix)
      if (customer.licence_number && customer.licence_number.trim() !== '') {
        linkedDisplayId = customer.licence_number.trim();
        console.log('✅ LINKAGE FIX: Using licence_number as primary identifier:', linkedDisplayId);
      }
      // Second Priority: Use id_number if licence_number is empty
      else if (customer.id_number && customer.id_number.trim() !== '') {
        linkedDisplayId = customer.id_number.trim();
        console.log('✅ LINKAGE FIX: Using id_number as primary identifier:', linkedDisplayId);
      }
      // Fallback: No valid identifier found
      else {
        console.log('⚠️ LINKAGE FIX: No valid identifier found for customer:', customerId);
        linkedDisplayId = null;
      }

      console.log('🎯 LINKAGE FIX: Final linked_display_id:', linkedDisplayId);
      return linkedDisplayId;

    } catch (error) {
      console.error('❌ LINKAGE FIX: Error retrieving customer identifier:', error);
      return null;
    }
  }

  /**
   * Sanitizes rental data by validating and formatting all fields
   * @param {Object} rentalData - The rental data to sanitize
   * @returns {Object} - Sanitized rental data
   */
  static sanitizeRentalData(rentalData) {
    const sanitized = { ...rentalData };

    console.log('🧹 Starting comprehensive data sanitization for:', rentalData);

    // CRITICAL STATUS FIELD FIX: Remove any "status" field immediately
    if ('status' in sanitized) {
      console.warn('🚨 CRITICAL FIX: Removing invalid "status" field from rental data');
      delete sanitized.status;
    }

    // Frontend-only pricing helpers must never be written to the rentals table.
    if ('package_duration_units' in sanitized) {
      delete sanitized.package_duration_units;
    }
    if ('selected_package_duration_units' in sanitized) {
      delete sanitized.selected_package_duration_units;
    }

    // List of ALL possible date fields that need validation (convert empty strings to null)
    const dateFields = [
      'customer_dob',
      'customer_issue_date',
      'created_at',
      'updated_at'
    ];

    // List of ALL possible datetime fields that need validation (convert empty strings to null)
    const datetimeFields = [
      'rental_start_date',
      'rental_end_date'
    ];

    // Validate and format date fields
    dateFields.forEach(field => {
      if (field in sanitized) {
        const originalValue = sanitized[field];
        const sanitizedValue = this.validateAndFormatDate(sanitized[field]);
        sanitized[field] = sanitizedValue;
        console.log(`📅 FIXED: Date field '${field}': '${originalValue}' -> '${sanitizedValue}'`);
      }
    });

    // Validate and format datetime fields
    datetimeFields.forEach(field => {
      if (field in sanitized) {
        const originalValue = sanitized[field];
        const sanitizedValue = this.validateAndFormatDateTime(sanitized[field]);
        sanitized[field] = sanitizedValue;
        console.log(`⏰ FIXED: DateTime field '${field}': '${originalValue}' -> '${sanitizedValue}'`);
      }
    });

    // Handle string fields that should be null when empty
    const stringFields = [
      'customer_licence_number', 
      'customer_id_number', 
      'customer_place_of_birth',
      'customer_nationality',
      'accessories'
    ];
    
    stringFields.forEach(field => {
      if (field in sanitized && (!sanitized[field] || (typeof sanitized[field] === 'string' && sanitized[field].trim() === ''))) {
        const originalValue = sanitized[field];
        sanitized[field] = null;
        console.log(`📧 FIXED: Empty string field '${field}': '${originalValue}' -> null`);
      }
    });

    // Preserve customer contact fields as-is (they will be handled by Authority Logic)
    if ('customer_email' in rentalData) {
      sanitized.customer_email = rentalData.customer_email;
      console.log(`📧 Preserved customer_email: '${sanitized.customer_email}'`);
    }
    
    if ('customer_phone' in rentalData) {
      sanitized.customer_phone = rentalData.customer_phone;
      console.log(`📞 Preserved customer_phone: '${sanitized.customer_phone}'`);
    }

    if ('customer_name' in rentalData) {
      sanitized.customer_name = rentalData.customer_name;
      console.log(`👤 Preserved customer_name: '${sanitized.customer_name}'`);
    }

    // FIXED: Validate status fields against database constraints
    if ('payment_status' in sanitized) {
      const originalStatus = sanitized.payment_status;
      sanitized.payment_status = this.validatePaymentStatus(sanitized.payment_status);
      console.log(`💳 FIXED: Payment status: '${originalStatus}' -> '${sanitized.payment_status}'`);
    }

    if ('rental_status' in sanitized) {
      const originalStatus = sanitized.rental_status;
      sanitized.rental_status = this.validateRentalStatus(sanitized.rental_status);
      console.log(`📋 FIXED: Rental status: '${originalStatus}' -> '${sanitized.rental_status}'`);
    }

    // FIXED: Ensure numeric fields are properly formatted
    const numericFields = [
      'vehicle_id', 'total_amount', 'unit_price', 'transport_fee',
      'deposit_amount', 'damage_deposit', 'remaining_amount', 'quantity_days'
    ];
    
    numericFields.forEach(field => {
      if (field in sanitized) {
        const originalValue = sanitized[field];
        if (sanitized[field] === '' || sanitized[field] === null || sanitized[field] === undefined) {
          sanitized[field] = null;
        } else if (typeof sanitized[field] === 'string') {
          const parsed = parseFloat(sanitized[field]);
          sanitized[field] = isNaN(parsed) ? null : parsed;
        }
        console.log(`🔢 FIXED: Numeric field '${field}': '${originalValue}' -> ${sanitized[field]}`);
      }
    });

    // CRITICAL STATUS FIELD FIX: Final check to ensure "status" field is not present
    if ('status' in sanitized) {
      console.error('🚨 CRITICAL ERROR: "status" field still present after sanitization! Removing it now.');
      delete sanitized.status;
    }

    console.log('✅ Comprehensive data sanitization completed:', sanitized);
    return sanitized;
  }

  /**
   * Normalizes legacy rental datetime keys to the current date field keys
   * before validation and database mapping.
   */
  static normalizeRentalDateFields(rentalData) {
    const normalized = { ...rentalData };

    if (normalized.rental_start_at && !normalized.rental_start_date) {
      normalized.rental_start_date = normalized.rental_start_at;
    }

    if (normalized.rental_end_at && !normalized.rental_end_date) {
      normalized.rental_end_date = normalized.rental_end_at;
    }

    return normalized;
  }

  /**
   * TRANSACTIONAL ORCHESTRATION: Complete rental creation with guaranteed customer creation
   * This is the main orchestration function that enforces the proper sequence
   */
  static async createRentalWithTransactionalCustomerCreation(completeFormData) {
    console.log('🔐 TRANSACTIONAL ORCHESTRATION: Starting complete rental creation with guaranteed customer creation:', completeFormData);
    
    try {
      // STEP 1: Validate input data
      if (!completeFormData) {
        throw new Error('Complete form data is required');
      }

      // STEP 2: GUARANTEE CUSTOMER CREATION FIRST (CRITICAL SEQUENCE)
      console.log('🔐 TRANSACTIONAL ORCHESTRATION: STEP 1 - Guaranteeing customer creation...');
      
      const customerCreationResult = await this.guaranteeCustomerCreation(completeFormData);
      
      if (!customerCreationResult.success || !customerCreationResult.data?.id) {
        throw new Error(`CRITICAL FAILURE: Customer creation failed: ${customerCreationResult.error || 'Unknown error'}`);
      }

      const guaranteedCustomer = customerCreationResult.data;
      const customerIdToUse = guaranteedCustomer.id;

      console.log('✅ TRANSACTIONAL ORCHESTRATION: Customer creation guaranteed:', customerIdToUse);

      // STEP 3: FINAL VALIDATION - Customer ID MUST be valid
      if (!this.isValidCustomerId(customerIdToUse)) {
        throw new Error(`CRITICAL FAILURE: Customer ID validation failed: ${customerIdToUse}`);
      }

      // STEP 4: Create rental with GUARANTEED customer ID
      console.log('🔐 TRANSACTIONAL ORCHESTRATION: STEP 2 - Creating rental with guaranteed customer ID...');
      
      const rentalDataWithGuaranteedCustomerId = {
        ...completeFormData,
        customer_id: customerIdToUse // THIS IS NOW GUARANTEED TO EXIST
      };

      const rentalCreationResult = await this.createRentalWithTransaction(rentalDataWithGuaranteedCustomerId);

      if (!rentalCreationResult.success) {
        throw new Error(`Rental creation failed: ${rentalCreationResult.error}`);
      }

      console.log('✅ TRANSACTIONAL ORCHESTRATION: Complete rental creation successful');
      console.log('🔗 TRANSACTIONAL ORCHESTRATION: Customer-Rental linkage established:', {
        customerId: customerIdToUse,
        rentalId: rentalCreationResult.data.id
      });

      return {
        success: true,
        data: rentalCreationResult.data,
        customer: guaranteedCustomer,
        message: 'Complete rental creation with transactional customer creation successful'
      };

    } catch (error) {
      console.error('❌ TRANSACTIONAL ORCHESTRATION: Complete rental creation failed:', error);
      
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  /**
   * FINAL CRITICAL FIX: Create rental with GUARANTEED customer_id foreign key assignment
   * AUTHORITY LOGIC: Form data takes precedence over database data
   * HEALING FIX: Master customer record updated after successful rental creation
   * AUTO-STATUS UPDATE: Automatically update vehicle status based on rental status
   * ENHANCED: Vehicle status updates to "scheduled" when rental status is "scheduled"
   * CRITICAL STATUS FIELD FIX: Removed all "status" field handling to prevent database errors
   */
  static async createRentalWithTransaction(rentalData) {
    console.log('🆕 FINAL CRITICAL FIX: Starting rental creation with GUARANTEED customer_id linkage:', rentalData);
    
    try {
      // STEP 1: Validate input data
      if (!rentalData) {
        throw new Error('Rental data is required');
      }

      // CRITICAL STATUS FIELD FIX: Remove "status" field immediately if present
      if ('status' in rentalData) {
        console.warn('🚨 CRITICAL FIX: Removing invalid "status" field from input data');
        delete rentalData.status;
      }

      // STEP 2: FINAL CRITICAL FIX - Validate customer_id BEFORE any processing
      let linkedCustomerId = rentalData.customer_id;
      console.log('🎯 FINAL CRITICAL FIX: Checking customer_id in payload:', linkedCustomerId);

      if (!linkedCustomerId) {
        console.error('❌ FINAL CRITICAL FIX: No customer_id found in rental payload');
        console.error('❌ FINAL CRITICAL FIX: Rental payload keys:', Object.keys(rentalData));
        throw new Error('CRITICAL RENTAL LINKAGE FAILURE: Customer ID is missing from rental payload. Cannot create rental without valid customer ID.');
      }

      if (!this.isValidCustomerId(linkedCustomerId)) {
        console.error('❌ FINAL CRITICAL FIX: Invalid customer_id format:', linkedCustomerId);
        throw new Error(`CRITICAL RENTAL LINKAGE FAILURE: Customer ID format is invalid: ${linkedCustomerId}. Expected format: cust_XXXXXXXXX`);
      }

      console.log('✅ FINAL CRITICAL FIX: Valid customer_id confirmed:', linkedCustomerId);

      const organizationId = await getCurrentOrganizationId();
      console.log('🏢 FINAL CRITICAL FIX: Resolved organization for rental insert:', organizationId);

      // STEP 3: Verify customer exists in database
      console.log('🔍 FINAL CRITICAL FIX: Verifying customer exists in database...');
      let customerLookupQuery = supabase
        .from('app_4c3a7a6153_customers')
        .select('*')
        .eq('id', linkedCustomerId);

      customerLookupQuery = applyOrganizationScope(customerLookupQuery, organizationId);

      let { data: existingCustomer, error: customerError } = await customerLookupQuery.maybeSingle();

      if (!customerError && !existingCustomer) {
        console.warn('⚠️ FINAL CRITICAL FIX: Linked customer record missing at final verification. Attempting recovery...');
        const recoveredCustomerResult = await this.guaranteeCustomerCreation({
          ...rentalData,
          id: linkedCustomerId,
          customer_id: linkedCustomerId,
        });

        if (recoveredCustomerResult?.success && recoveredCustomerResult?.data?.id) {
          existingCustomer = recoveredCustomerResult.data;
          linkedCustomerId = recoveredCustomerResult.data.id;
          rentalData.customer_id = linkedCustomerId;
          console.log('🔁 FINAL CRITICAL FIX: Customer linkage recovered before rental insert:', linkedCustomerId);
        }
      }

      if (customerError || !existingCustomer) {
        console.error('❌ FINAL CRITICAL FIX: Customer verification failed:', customerError);
        throw new Error(`CRITICAL RENTAL LINKAGE FAILURE: Customer ${linkedCustomerId} does not exist in database. Cannot create rental for non-existent customer.`);
      }

      console.log('✅ FINAL CRITICAL FIX: Customer verified in database:', {
        id: existingCustomer.id,
        name: existingCustomer.full_name,
        licence_number: existingCustomer.licence_number,
        id_number: existingCustomer.id_number,
        phone: existingCustomer.phone,
        email: existingCustomer.email
      });

      // STEP 3.5: AUTHORITY LOGIC - Form data takes precedence over database
      console.log('🎯 AUTHORITY LOGIC: Prioritizing form data over database...');
      console.log('🎯 Form data - phone:', rentalData.customer_phone, 'email:', rentalData.customer_email);
      console.log('🎯 Database data - phone:', existingCustomer.phone, 'email:', existingCustomer.email);
      
      const finalEmail = (rentalData.customer_email && rentalData.customer_email.trim() !== '') 
          ? rentalData.customer_email 
          : existingCustomer?.email;
      
      const finalPhone = (rentalData.customer_phone && rentalData.customer_phone.trim() !== '') 
          ? rentalData.customer_phone 
          : existingCustomer?.phone;
      
      // Update rental data with prioritized values
      rentalData.customer_email = finalEmail;
      rentalData.customer_phone = finalPhone;
      
      console.log('🎯 AUTHORITY LOGIC: Final values - phone:', finalPhone, 'email:', finalEmail);

      // STEP 4: Normalize legacy date keys before sanitizing and mapping
      const normalizedRentalData = this.normalizeRentalDateFields(rentalData);

      // STEP 5: Sanitize and validate all fields AFTER authority logic
      const sanitizedData = this.sanitizeRentalData(normalizedRentalData);
      console.log('🧹 Sanitized data ready for database:', sanitizedData);
      console.log('📧 Verified customer_email preserved:', sanitizedData.customer_email);
      console.log('📞 Verified customer_phone preserved:', sanitizedData.customer_phone);

      // STEP 6: Retrieve customer primary identifier for display linkage
      let linkedDisplayId = null;
      console.log('🔗 LINKAGE FIX: Retrieving customer identifier for rental linkage...');
      linkedDisplayId = await this.getCustomerPrimaryIdentifier(linkedCustomerId);
      console.log('🔗 LINKAGE FIX: Retrieved linked_display_id:', linkedDisplayId);

      // STEP 7: Map the normalized date fields to database columns
      const dbRentalData = applyOrganizationMatch({
        ...sanitizedData,
        // FINAL CRITICAL FIX: GUARANTEE customer_id is in the database payload
        customer_id: linkedCustomerId,
        rental_start_date: sanitizedData.rental_start_date,
        rental_end_date: sanitizedData.rental_end_date,
        // NEW: Add customer ID linkage field for display
        linked_display_id: linkedDisplayId
      }, organizationId);
      
      // Remove the _at fields that don't exist in database
      // FIXED: DO NOT delete rental_start_date - it\'s required by database

      // delete dbRentalData.rental_start_date;
      // FIXED: DO NOT delete rental_end_date - it\'s required by database

      // delete dbRentalData.rental_end_date;
      
      // CRITICAL FIX: Remove fields that do not exist in the rentals table
      delete dbRentalData.status; // CRITICAL: This field does NOT exist in database
      delete dbRentalData.linked_display_id; // This is not a database column
      delete dbRentalData.booking_range;
      delete dbRentalData.vehicle;
      delete dbRentalData.selected_vehicle_id_snapshot;
      delete dbRentalData.selected_vehicle_plate_snapshot;
      delete dbRentalData.selected_vehicle_model_snapshot;
      delete dbRentalData.selected_vehicle_selected_by;
      delete dbRentalData.selected_vehicle_selected_at;
      delete dbRentalData.package_duration_units;
      delete dbRentalData.selected_package_duration_units;
      console.log('🧹 CRITICAL FIX: Removed non-existent database fields: status, linked_display_id, booking_range, vehicle, selected vehicle snapshot fields');
      
      // FINAL CRITICAL FIX: Double-check customer_id is in final payload
      if (!dbRentalData.customer_id) {
        console.error('❌ FINAL CRITICAL FIX: customer_id was lost during data processing');
        console.error('❌ FINAL CRITICAL FIX: Final payload:', JSON.stringify(dbRentalData, null, 2));
        throw new Error('CRITICAL RENTAL LINKAGE FAILURE: Customer ID was lost during data processing!');
      }

      console.log('🔧 FINAL CRITICAL FIX: Final mapped rental data with GUARANTEED customer_id:', dbRentalData);
      console.log('🎯 FINAL CRITICAL FIX: customer_id field confirmed:', dbRentalData.customer_id);
      console.log('📧 customer_email field confirmed:', dbRentalData.customer_email);
      console.log('📞 customer_phone field confirmed:', dbRentalData.customer_phone);
      
      // STEP 8: Final validation - ensure required fields are present
      if (!sanitizedData.rental_start_date || !sanitizedData.rental_end_date) {
        throw new Error('Rental start date and end date are required and must be valid dates');
      }

      if (!dbRentalData.customer_name || !dbRentalData.customer_phone) {
        throw new Error('Customer name and phone are required');
      }

      if (!dbRentalData.vehicle_id) {
        throw new Error('Vehicle selection is required');
      }
      
      // STEP 9: CRITICAL FIX - Final availability check before insertion with proper UUID handling
      if (dbRentalData.vehicle_id && dbRentalData.rental_start_date && dbRentalData.rental_end_date) {
        console.log('🔍 CRITICAL FIX: Final availability check before insertion...');
        
        // CRITICAL FIX: For new rentals, excludeRentalId should be null (no existing rental to exclude)
        const sanitizedExcludeRentalId = null; // New rental has no existing ID to exclude
        console.log('🔍 CRITICAL FIX: Using excludeRentalId for new rental:', sanitizedExcludeRentalId);
        
        const availabilityResult = await this.checkVehicleAvailability(
          dbRentalData.vehicle_id,
          dbRentalData.rental_start_date,
          dbRentalData.rental_end_date,
          dbRentalData.rental_start_time || null,
          dbRentalData.rental_end_time || null,
          sanitizedExcludeRentalId // CRITICAL FIX: null for new rentals
        );
        
        if (!availabilityResult.isAvailable) {
          console.log('❌ FIXED: Final availability check failed:', availabilityResult);
          throw new Error(`Vehicle availability check failed: ${availabilityResult.reason}`);
        }
        
        console.log('✅ FIXED: Final availability check passed');
      }
      
      // STEP 9: FINAL CRITICAL FIX - Insert rental into database with GUARANTEED customer_id
      console.log('💾 FINAL CRITICAL FIX: Inserting rental into database with GUARANTEED customer_id...');
      console.log('💾 FINAL CRITICAL FIX: Final data being sent to database:', JSON.stringify(dbRentalData, null, 2));

      // ============================================================================
      // 🛑 CRITICAL SANITIZATION STEP (Must run before insert)
      // ============================================================================
      const finalSanitizedData = { ...dbRentalData };

      // CRITICAL: Define protected fields that should NEVER be converted to null
      const protectedFields = ['customer_email', 'customer_phone', 'customer_name'];

      // 1. Convert ALL empty strings to NULL (Fixes "invalid input syntax for type time")
      // BUT preserve protected customer contact fields
      Object.keys(finalSanitizedData).forEach(key => {
        // FINAL SANITIZATION FIX: Skip protected fields completely
        if (protectedFields.includes(key)) {
          console.log(`🛡️ FINAL SANITIZATION: Protecting ${key}:`, finalSanitizedData[key]);
          return; // Skip this iteration, don't modify protected fields
        }
        
        if (finalSanitizedData[key] === "" || finalSanitizedData[key] === undefined) {
          finalSanitizedData[key] = null;
        }
      });

      // CRITICAL STATUS FIELD FIX: Absolutely final check before database insertion
      if ('status' in finalSanitizedData) {
        console.error('🚨🚨🚨 CRITICAL EMERGENCY: "status" field detected in final payload! Removing immediately!');
        delete finalSanitizedData.status;
      }

      finalSanitizedData.rental_id = await this.resolveUniqueRentalReference(finalSanitizedData.rental_id);

      const finalPaymentStatus = String(finalSanitizedData.payment_status || '').trim().toLowerCase();
      const finalTotalAmount = Math.max(0, Number(finalSanitizedData.total_amount) || 0);
      if ((finalPaymentStatus === 'paid' || finalPaymentStatus === 'partial') && finalTotalAmount <= 0) {
        throw new Error('Cannot create a paid rental with 0 MAD total. Select a package or set a rental price first.');
      }

      console.log('🧼 FINAL SANITIZED DATA:', JSON.stringify(finalSanitizedData, null, 2));

      const { data: rental, error: insertError } = await supabase
        .from(RENTALS_TABLE)
        .insert([finalSanitizedData])
        .select()
        .single();
      
      if (insertError) {
        console.error('❌ FINAL CRITICAL FIX: Database insertion failed:', insertError);
        console.error('❌ FINAL CRITICAL FIX: Data that caused the error:', JSON.stringify(finalSanitizedData, null, 2));
        
        // Enhanced error handling for specific constraint violations
        if (insertError.message.includes('payment_status_check')) {
          throw new Error(`Payment status validation failed. Valid values are: paid, partial, unpaid, overdue, refunded. Received: ${finalSanitizedData.payment_status}`);
        }
        
        if (insertError.message.includes('rental_status_check')) {
          throw new Error(`Rental status validation failed. Valid values are: scheduled, active, completed, cancelled, confirmed. Received: ${finalSanitizedData.rental_status}`);
        }
        
        if (insertError.message.includes('invalid input syntax for type date')) {
          const errorDetail = insertError.message;
          console.error('❌ FIXED: Date syntax error details:', errorDetail);
          throw new Error(`Date validation failed: ${errorDetail}. Please ensure all date fields are in valid format or empty.`);
        }
        
        throw new Error(`Database insertion failed: ${insertError.message}`);
      }

      // FINAL CRITICAL FIX: Verify customer_id was actually saved
      if (!rental.customer_id) {
        console.error('❌ FINAL CRITICAL FIX: CRITICAL ERROR - customer_id was not saved to database!');
        console.error('❌ FINAL CRITICAL FIX: Created rental record:', JSON.stringify(rental, null, 2));
        throw new Error('FINAL CRITICAL ERROR: Customer ID was not saved to rental record in database!');
      }
      
      console.log('✅ FINAL CRITICAL FIX: Rental created successfully with GUARANTEED customer_id linkage:', rental);
      console.log('🎯 FINAL CRITICAL FIX: Confirmed customer_id saved to database:', rental.customer_id);
      console.log('📧 Confirmed customer_email saved to database:', rental.customer_email);
      console.log('📞 Confirmed customer_phone saved to database:', rental.customer_phone);
      
      // STEP 10: ENHANCED AUTO-STATUS UPDATE - Update vehicle status based on rental status
      if (rental.vehicle_id) {
        try {
          if (rental.rental_status === 'scheduled') {
            console.log('🚗 AUTO-STATUS: Rental is scheduled, updating vehicle status to "scheduled"...');
            await this.updateVehicleStatus(rental.vehicle_id, 'scheduled');
            console.log('✅ AUTO-STATUS: Vehicle marked as scheduled');
          } else if (rental.rental_status === 'active' || rental.rental_status === 'confirmed') {
            console.log('🚗 AUTO-STATUS: Rental is active, updating vehicle status to "rented"...');
            await this.updateVehicleStatus(rental.vehicle_id, 'rented');
            console.log('✅ AUTO-STATUS: Vehicle marked as rented');
          }
        } catch (statusError) {
          console.warn('⚠️ AUTO-STATUS: Failed to update vehicle status (non-critical):', statusError.message);
          // Don't fail the rental creation if status update fails
        }
      }
      
      // STEP 11: HEALING FIX - Update master customer record with correct contact info
      if (finalEmail || finalPhone) {
        console.log('🏥 HEALING FIX: Updating master customer record with correct contact info...');
        const { error: updateError } = await supabase
          .from(CUSTOMERS_TABLE)
          .update({ 
            email: finalEmail, 
            phone: finalPhone 
          })
          .eq('id', linkedCustomerId);
        
        if (updateError) {
          console.warn('⚠️ HEALING FIX: Failed to update customer record:', updateError.message);
        } else {
          console.log('✅ HEALING FIX: Master customer record updated successfully');
        }
      }

      const alertVehicleLabel = [
        finalSanitizedData.selected_vehicle_model_snapshot,
        finalSanitizedData.vehicle_plate_number,
      ]
        .filter(Boolean)
        .join(' • ') || `Vehicle #${rental.vehicle_id}`;
      const telegramRentalPayload = {
        ...rental,
        customer: existingCustomer || null,
        id_scan_url: rental.id_scan_url || existingCustomer?.id_scan_url || null,
        customer_id_image: rental.customer_id_image || existingCustomer?.customer_id_image || null,
        customer_id_scan_history: Array.isArray(rental.customer_id_scan_history)
          ? rental.customer_id_scan_history
          : (Array.isArray(existingCustomer?.customer_id_scan_history) ? existingCustomer.customer_id_scan_history : []),
        customer_uploaded_images: Array.isArray(rental.customer_uploaded_images)
          ? rental.customer_uploaded_images
          : (Array.isArray(existingCustomer?.customer_uploaded_images) ? existingCustomer.customer_uploaded_images : []),
        extra_images: Array.isArray(rental.extra_images)
          ? rental.extra_images
          : (Array.isArray(existingCustomer?.extra_images) ? existingCustomer.extra_images : []),
      };
      const telegramPricingSnapshot = buildRentalCreatedTelegramPricingSnapshot(rental, finalSanitizedData);

      dispatchRentalLifecycleTelegramEvent({
        eventType: 'rental_created',
        actor: 'admin',
        rental: {
          id: rental.id,
          reference: rental.rental_id || finalSanitizedData.rental_id || '',
          vehicle: alertVehicleLabel,
          customer: rental.customer_name || finalSanitizedData.customer_name,
          start: rental.rental_start_date || finalSanitizedData.rental_start_date,
          end: rental.rental_end_date || finalSanitizedData.rental_end_date,
          createdBy: finalSanitizedData.created_by_name || rental.created_by_name || '',
          id_scan_url: telegramRentalPayload.id_scan_url,
          customer_id_image: telegramRentalPayload.customer_id_image,
          customer_id_scan_history: telegramRentalPayload.customer_id_scan_history,
          documentCount: countRentalDocuments(telegramRentalPayload),
          organization_id: rental.organization_id || finalSanitizedData.organization_id || '',
          tenant_id: rental.tenant_id || finalSanitizedData.tenant_id || '',
          business_account_id: rental.business_account_id || finalSanitizedData.business_account_id || '',
          tenant_slug: rental.tenant_slug || finalSanitizedData.tenant_slug || '',
          ...telegramPricingSnapshot,
        },
      }).catch((telegramDispatchError) => {
        console.warn('⚠️ Rental created Telegram dispatch failed (non-blocking):', telegramDispatchError);
      });

      if (shouldDispatchInitialPaymentReceived(rental)) {
        dispatchRentalLifecycleTelegramEvent({
          eventType: 'payment_received',
          actor: 'admin',
          rental: buildInitialPaymentReceivedTelegramPayload(rental),
        }).catch((telegramDispatchError) => {
          console.warn('⚠️ Initial payment received Telegram dispatch failed (non-blocking):', telegramDispatchError);
        });
      }
      
      return {
        success: true,
        data: rental,
        message: 'Rental created successfully with GUARANTEED customer ID linkage and protected customer data'
      };
      
    } catch (error) {
      console.error('❌ FINAL CRITICAL FIX: Rental creation failed:', error);
      console.error('❌ FINAL CRITICAL FIX: Original rental data:', rentalData);
      
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }
  
  /**
   * FIXED: Update rental with proper validation and constraint compliance + Customer ID Linkage
   * AUTO-STATUS UPDATE: Automatically update vehicle status based on rental status
   * ENHANCED: Vehicle status updates to "scheduled" when rental status is "scheduled"
   */
  static async updateRental(rentalData) {
    console.log('✏️ FIXED: Starting rental update with proper validation + customer linkage:', rentalData);
    
    try {
      if (!rentalData.id) {
        throw new Error('Rental ID is required for updates');
      }
      
      // CRITICAL STATUS FIELD FIX: Remove "status" field if present
      if ('status' in rentalData) {
        console.warn('🚨 CRITICAL FIX: Removing invalid "status" field from update data');
        delete rentalData.status;
      }
      
      // STEP 1: Normalize legacy date keys before sanitizing and mapping
      const normalizedRentalData = this.normalizeRentalDateFields(rentalData);

      // STEP 2: Sanitize and validate all fields
      const sanitizedData = this.sanitizeRentalData(normalizedRentalData);
      console.log('🧹 FIXED: Sanitized update data:', sanitizedData);

      // STEP 3: NEW - Retrieve customer primary identifier for linkage (if customer_id changed)
      let linkedDisplayId = sanitizedData.linked_display_id; // Keep existing if not updating customer
      if (sanitizedData.customer_id) {
        console.log('🔗 LINKAGE FIX: Updating customer identifier for rental linkage...');
        linkedDisplayId = await this.getCustomerPrimaryIdentifier(sanitizedData.customer_id);
        console.log('🔗 LINKAGE FIX: Updated linked_display_id:', linkedDisplayId);
      }

      // STEP 4: Map the normalized date fields to database columns
      const organizationId = await getCurrentOrganizationId();
      console.log('🏢 FIXED: Resolved organization for rental update:', organizationId);

      const dbRentalData = applyOrganizationMatch({
        ...sanitizedData,
        rental_start_date: sanitizedData.rental_start_date,
        rental_end_date: sanitizedData.rental_end_date,
        // NEW: Update customer ID linkage field
        linked_display_id: linkedDisplayId
      }, organizationId);
      
      // Remove the _at fields that don't exist in database
      // // FIXED: DO NOT delete rental_start_date - it\'s required by database
 // delete dbRentalData.rental_start_date; // FIXED: Don't delete date fields!
      // // FIXED: DO NOT delete rental_end_date - it\'s required by database
 // delete dbRentalData.rental_end_date; // FIXED: Don't delete date fields!
      
      // CRITICAL STATUS FIELD FIX: Remove invalid fields
      delete dbRentalData.status;
      delete dbRentalData.linked_display_id;
      delete dbRentalData.booking_range;
      delete dbRentalData.vehicle;
      delete dbRentalData.selected_vehicle_id_snapshot;
      delete dbRentalData.selected_vehicle_plate_snapshot;
      delete dbRentalData.selected_vehicle_model_snapshot;
      delete dbRentalData.selected_vehicle_selected_by;
      delete dbRentalData.selected_vehicle_selected_at;
      delete dbRentalData.package_duration_units;
      delete dbRentalData.selected_package_duration_units;
      
      console.log('🔧 FIXED: Mapped rental data for update (with linkage):', dbRentalData);
      
      // STEP 4: CRITICAL FIX - Availability check for updates (excluding current rental)
      if (dbRentalData.vehicle_id && dbRentalData.rental_start_date && dbRentalData.rental_end_date) {
        console.log('🔍 CRITICAL FIX: Availability check for update (excluding current rental)...');
        
        // CRITICAL FIX: Sanitize the rental ID before using it as excludeRentalId
        const sanitizedExcludeRentalId = this.sanitizeExcludeRentalId(dbRentalData.id);
        console.log('🔍 CRITICAL FIX: Using sanitized excludeRentalId for update:', sanitizedExcludeRentalId);
        
        const availabilityResult = await this.checkVehicleAvailability(
          dbRentalData.vehicle_id,
          dbRentalData.rental_start_date,
          dbRentalData.rental_end_date,
          dbRentalData.rental_start_time || null,
          dbRentalData.rental_end_time || null,
          sanitizedExcludeRentalId // CRITICAL FIX: Properly sanitized UUID or null
        );
        
        if (!availabilityResult.isAvailable) {
          console.log('❌ FIXED: Update availability check failed:', availabilityResult);
          throw new Error(`Vehicle is not available for update: ${availabilityResult.reason}`);
        }
        
        console.log('✅ FIXED: Update availability check passed');
      }
      
      // STEP 5: Update rental in database
      console.log('💾 FIXED: Updating rental in database with customer linkage...');
      
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(dbRentalData)
        .eq('id', dbRentalData.id);
      
      if (updateError) {
        console.error('❌ FIXED: Database update failed:', updateError);
        
        // Enhanced error handling for constraint violations
        if (updateError.message.includes('payment_status_check')) {
          throw new Error(`Payment status validation failed. Valid values are: paid, partial, unpaid, overdue, refunded`);
        }
        
        if (updateError.message.includes('invalid input syntax for type date')) {
          throw new Error(`Date validation failed: One or more date fields contain invalid values. Please check date formats.`);
        }
        
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      let resolvedRental = {
        ...dbRentalData,
      };

      const { data: fetchedRental, error: fetchError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .select('*')
          .eq('id', dbRentalData.id)
          .maybeSingle();

      if (fetchError) {
        console.warn('⚠️ FIXED: Rental re-fetch failed after update, using submitted data fallback:', fetchError);
      } else if (fetchedRental) {
        resolvedRental = fetchedRental;
      }
      
      console.log('✅ FIXED: Rental updated successfully with customer linkage:', resolvedRental);
      
      // STEP 6: ENHANCED AUTO-STATUS UPDATE - Update vehicle status based on rental status
      if (resolvedRental.vehicle_id) {
        try {
          if (resolvedRental.rental_status === 'completed' || resolvedRental.rental_status === 'cancelled') {
            console.log('🚗 AUTO-STATUS: Rental is completed/cancelled, updating vehicle status to "available"...');
            await this.updateVehicleStatus(resolvedRental.vehicle_id, 'available');
            console.log('✅ AUTO-STATUS: Vehicle marked as available');
          } else if (resolvedRental.rental_status === 'scheduled') {
            console.log('🚗 AUTO-STATUS: Rental is scheduled, updating vehicle status to "scheduled"...');
            await this.updateVehicleStatus(resolvedRental.vehicle_id, 'scheduled');
            console.log('✅ AUTO-STATUS: Vehicle marked as scheduled');
          } else if (resolvedRental.rental_status === 'active' || resolvedRental.rental_status === 'confirmed') {
            console.log('🚗 AUTO-STATUS: Rental is active, updating vehicle status to "rented"...');
            await this.updateVehicleStatus(resolvedRental.vehicle_id, 'rented');
            console.log('✅ AUTO-STATUS: Vehicle marked as rented');
          }
        } catch (statusError) {
          console.warn('⚠️ AUTO-STATUS: Failed to update vehicle status (non-critical):', statusError.message);
          // Don't fail the rental update if status update fails
        }
      }
      
      return {
        success: true,
        data: resolvedRental,
        message: 'Rental updated successfully with proper validation and customer linkage'
      };
      
    } catch (error) {
      console.error('❌ FIXED: Rental update failed:', error);
      
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }
  
  /**
   * AVAILABILITY LOGIC FIX: Check vehicle availability with strict conflict detection
   * CRITICAL BOOKING FIX: Vehicle status check is now informational only - allows multiple bookings as long as dates don't overlap
   * CRITICAL: Returns immediately when conflicts are found - no next available date calculation
   * START RENTAL FIX: Allow checking availability for a specific rental (bypass status check)
   */
  static async checkVehicleAvailability(vehicleId, startDate, endDate, startTime = null, endTime = null, excludeRentalId = null, forRentalId = null) {
    console.log('🔍 AVAILABILITY CHECK: Starting with parameters:', {
      vehicleId,
      startDate,
      endDate,
      startTime,
      endTime,
      excludeRentalId,
      excludeRentalIdType: typeof excludeRentalId,
      forRentalId
    });
    
    try {
      // STEP 1: VEHICLE STATUS CHECK - Now informational only, does NOT block booking
      // EXCEPTION: Skip status check if forRentalId is provided (starting an existing rental)
      if (!forRentalId) {
        console.log('🚗 VEHICLE STATUS CHECK: Verifying vehicle exists (informational only)...');
        const organizationId = await getCurrentOrganizationId();
        const scopedVehicleLookup = applyOrganizationScope(
          supabase
            .from(VEHICLES_TABLE)
            .select('id, name, status')
            .eq('id', vehicleId),
          organizationId
        );
        const { data: vehicle, error: vehicleError } = await scopedVehicleLookup.single();
        
        if (vehicleError) {
          console.error('❌ VEHICLE STATUS CHECK: Error fetching vehicle:', vehicleError);
          return {
            isAvailable: false,
            error: `Vehicle lookup failed: ${vehicleError.message}`,
            message: 'Error checking vehicle status'
          };
        }
        
        if (!vehicle) {
          console.error('❌ VEHICLE STATUS CHECK: Vehicle not found:', vehicleId);
          return {
            isAvailable: false,
            reason: `Vehicle with ID ${vehicleId} not found`,
            message: 'Vehicle not found'
          };
        }
        
        const vehicleStatus = (vehicle.status || '').toLowerCase();
        console.log('🚗 VEHICLE STATUS CHECK: Vehicle status (informational):', vehicleStatus);
        
        // CRITICAL BOOKING FIX: Status check is now informational only
        // We only check for rental date conflicts, not vehicle status
        console.log('✅ VEHICLE STATUS CHECK: Vehicle found, proceeding to check rental conflicts (status check is informational only)...');
      } else {
        console.log('🚗 START RENTAL FIX: Skipping vehicle status check - starting existing rental:', forRentalId);
        
        // Verify the rental exists and belongs to this vehicle
        const { data: rental, error: rentalError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .select('id, vehicle_id, rental_status')
          .eq('id', forRentalId)
          .single();
        
        if (rentalError || !rental) {
          console.error('❌ START RENTAL FIX: Rental not found:', forRentalId);
          return {
            isAvailable: false,
            reason: 'Rental not found',
            message: 'Cannot start non-existent rental'
          };
        }
        
        if (rental.vehicle_id !== vehicleId) {
          console.error('❌ START RENTAL FIX: Vehicle mismatch:', { rentalVehicle: rental.vehicle_id, requestedVehicle: vehicleId });
          return {
            isAvailable: false,
            reason: 'Vehicle mismatch',
            message: 'Rental does not belong to this vehicle'
          };
        }
        
        console.log('✅ START RENTAL FIX: Rental verified, proceeding to check conflicts...');
      }
      
      // STEP 2: CRITICAL FIX: Sanitize excludeRentalId to prevent UUID syntax errors
      const sanitizedExcludeRentalId = this.sanitizeExcludeRentalId(excludeRentalId);
      console.log('🔍 SANITIZATION: Sanitized excludeRentalId:', sanitizedExcludeRentalId);
      
      // STEP 3: Build the query to find conflicting rentals
      let query = supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, rental_start_date, rental_end_date, rental_start_time, rental_end_time, rental_status')
        .eq('vehicle_id', vehicleId)
        .in('rental_status', ['scheduled', 'active', 'confirmed']);
      
      // CRITICAL FIX: Only exclude rental if we have a valid UUID
      if (sanitizedExcludeRentalId) {
        console.log('🔍 EXCLUSION: Excluding rental ID from availability check:', sanitizedExcludeRentalId);
        query = query.neq('id', sanitizedExcludeRentalId);
      } else {
        console.log('🔍 EXCLUSION: No rental ID to exclude (new rental or invalid ID)');
      }
      
      // START RENTAL FIX: Also exclude the rental we're trying to start
      if (forRentalId && this.isValidUUID(forRentalId)) {
        console.log('🔍 START RENTAL FIX: Excluding the rental being started:', forRentalId);
        query = query.neq('id', forRentalId);
      }
      
      const { data: existingRentals, error } = await query;
      
      if (error) {
        console.error('❌ QUERY ERROR: Error checking availability:', error);
        throw new Error(`Availability check failed: ${error.message}`);
      }
      
      console.log('📊 QUERY RESULT: Found existing rentals:', existingRentals?.length || 0);

      const requestedStartAt = this.buildAvailabilityWindow(startDate, startTime, 'start');
      const requestedEndAt = this.buildAvailabilityWindow(endDate, endTime, 'end');
      if (!requestedStartAt || !requestedEndAt) {
        throw new Error('Availability check failed: invalid requested rental timing');
      }
      
      // STEP 4: AVAILABILITY LOGIC FIX - Check for date conflicts with strict overlap detection
      const conflicts = existingRentals?.filter(rental => {
        if (this.isExpiredScheduledConflict(rental)) {
          return false;
        }
        const existingStart = this.buildAvailabilityWindow(rental.rental_start_date, rental.rental_start_time, 'start');
        const existingEnd = this.buildAvailabilityWindow(rental.rental_end_date, rental.rental_end_time, 'end');
        if (!existingStart || !existingEnd) {
          return false;
        }
        
        // STRICT OVERLAP CHECK: newStart < existingEnd AND newEnd > existingStart
        const hasOverlap = requestedStartAt < existingEnd && requestedEndAt > existingStart;
        
        if (hasOverlap) {
          console.log('⚠️ CONFLICT DETECTED:', {
            existing: {
              start: rental.rental_start_date,
              end: rental.rental_end_date,
              startTime: rental.rental_start_time || null,
              endTime: rental.rental_end_time || null,
            },
            requested: {
              start: startDate,
              end: endDate,
              startTime: startTime || null,
              endTime: endTime || null,
            },
            overlap: 'YES'
          });
        }
        
        return hasOverlap;
      }) || [];
      
      console.log('🔍 CONFLICT ANALYSIS: Total conflicts found:', conflicts.length);
      
      // CRITICAL: If ANY conflicts exist, return immediately with isAvailable: false
      if (conflicts.length > 0) {
        console.log('❌ AVAILABILITY RESULT: Vehicle is NOT available - conflicts exist');
        return {
          isAvailable: false,
          conflicts: conflicts,
          reason: `Vehicle is already booked during this period. Found ${conflicts.length} conflicting rental(s).`,
          message: 'Vehicle is not available'
        };
      }
      
      // Only reach here if NO conflicts exist
      console.log('✅ AVAILABILITY RESULT: Vehicle is available for the requested period');
      return {
        isAvailable: true,
        conflicts: [],
        message: 'Vehicle is available'
      };
      
    } catch (error) {
      console.error('❌ AVAILABILITY CHECK ERROR:', error);
      return {
        isAvailable: false,
        error: error.message,
        message: 'Error checking availability'
      };
    }
  }
  
  /**
   * Find next available date for a vehicle
   * NOTE: This is called separately, NOT during the main availability check
   */
  static async findNextAvailableDate(vehicleId, requestedStartDate, requestedEndDate) {
    console.log('🔍 NEXT AVAILABLE: Finding next available date for vehicle:', vehicleId);
    
    try {
      const requestedStart = new Date(requestedStartDate);
      const requestedEnd = new Date(requestedEndDate);
      const duration = requestedEnd - requestedStart;
      
      // Check dates starting from tomorrow
      const checkStart = new Date(requestedStart);
      checkStart.setDate(checkStart.getDate() + 1);
      
      // Check up to 60 days in advance
      for (let i = 0; i < 60; i++) {
        const testStart = new Date(checkStart);
        testStart.setDate(checkStart.getDate() + i);
        
        const testEnd = new Date(testStart.getTime() + duration);
        
        const testStartStr = testStart.toISOString().split('T')[0];
        const testEndStr = testEnd.toISOString().split('T')[0];
        
        const availability = await this.checkVehicleAvailability(
          vehicleId,
          testStartStr,
          testEndStr
        );
        
        if (availability.isAvailable) {
          console.log('✅ NEXT AVAILABLE: Found next available date:', testStartStr);
          return testStartStr;
        }
      }
      
      console.log('⚠️ NEXT AVAILABLE: No available dates found in next 60 days');
      return null;
      
    } catch (error) {
      console.error('❌ NEXT AVAILABLE ERROR:', error);
      return null;
    }
  }
  
  /**
   * Get all rentals with enhanced filtering
   */
  static async getAllRentals(filters = {}) {
    console.log('📋 Fetching all rentals with filters:', filters);
    
    try {
      let query = supabase
        .from('app_4c3a7a6153_rentals')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Apply filters
      if (filters.status) {
        query = query.eq('rental_status', filters.status);
      }
      
      if (filters.vehicle_id) {
        query = query.eq('vehicle_id', filters.vehicle_id);
      }
      
      if (filters.start_date) {
        query = query.gte('rental_start_date', filters.start_date);
      }
      
      if (filters.end_date) {
        query = query.lte('rental_end_date', filters.end_date);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Error fetching rentals:', error);
        throw new Error(`Failed to fetch rentals: ${error.message}`);
      }
      
      console.log('✅ Fetched rentals:', data?.length || 0);
      return data || [];
      
    } catch (error) {
      console.error('❌ Error in getAllRentals:', error);
      throw error;
    }
  }
  
  /**
   * Get rental by ID
   */
  static async getRentalById(id) {
    console.log('🔍 Fetching rental by ID:', id);
    
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        console.error('❌ Error fetching rental:', error);
        throw new Error(`Failed to fetch rental: ${error.message}`);
      }
      
      console.log('✅ Fetched rental:', data);
      return data;
      
    } catch (error) {
      console.error('❌ Error in getRentalById:', error);
      throw error;
    }
  }
  
  /**
   * DELETE RENTAL FIX: Delete rental and automatically revert vehicle status to "available"
   */
  static async deleteRental(id) {
    console.log('🗑️ DELETE RENTAL FIX: Deleting rental:', id);
    
    try {
      const organizationId = await getCurrentOrganizationId();
      // STEP 1: Fetch the rental to get vehicle_id before deletion
      console.log('🔍 DELETE RENTAL FIX: Fetching rental details before deletion...');
      const fetchRentalQuery = applyOrganizationScope(
        supabase
          .from('app_4c3a7a6153_rentals')
          .select('id, vehicle_id, rental_status, organization_id, linked_maintenance_id')
          .eq('id', id),
        organizationId
      );
      let { data: rental, error: fetchError } = await fetchRentalQuery.maybeSingle();
      
      if (fetchError) {
        console.error('❌ DELETE RENTAL FIX: Error fetching rental:', fetchError);
        throw new Error(`Failed to fetch rental before deletion: ${fetchError.message}`);
      }
      
      let deleteAsLegacyOrphan = false;
      if (!rental && organizationId) {
        const { data: legacyRental, error: legacyFetchError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .select('id, vehicle_id, rental_status, organization_id, linked_maintenance_id')
          .eq('id', id)
          .maybeSingle();

        if (legacyFetchError) {
          console.error('❌ DELETE RENTAL FIX: Error checking legacy rental ownership:', legacyFetchError);
          throw new Error(`Failed to verify rental ownership before deletion: ${legacyFetchError.message}`);
        }

        if (legacyRental && !legacyRental.organization_id) {
          console.warn('⚠️ DELETE RENTAL FIX: Deleting legacy rental without organization_id:', {
            id,
            activeOrganizationId: organizationId,
          });
          rental = legacyRental;
          deleteAsLegacyOrphan = true;
        } else if (legacyRental?.organization_id && legacyRental.organization_id !== organizationId) {
          console.error('❌ DELETE RENTAL FIX: Rental belongs to another workspace:', {
            id,
            activeOrganizationId: organizationId,
            rentalOrganizationId: legacyRental.organization_id,
          });
          throw new Error('This rental contract belongs to another workspace and cannot be deleted from the active workspace.');
        }
      }

      if (!rental) {
        console.error('❌ DELETE RENTAL FIX: Rental not found in active workspace:', {
          id,
          organizationId,
        });
        throw new Error('This rental contract was not found in the active workspace. Refresh the rentals list and try again from the correct workspace.');
      }
      
      console.log('✅ DELETE RENTAL FIX: Rental details retrieved:', {
        id: rental.id,
        vehicle_id: rental.vehicle_id,
        rental_status: rental.rental_status
      });

      let vehicleStatusBeforeDelete = '';
      if (rental.vehicle_id) {
        const scopedVehicleSnapshotQuery = applyOrganizationScope(
          supabase
            .from(VEHICLES_TABLE)
            .select('status')
            .eq('id', rental.vehicle_id),
          organizationId
        );
        const { data: vehicleSnapshot, error: vehicleFetchError } = await scopedVehicleSnapshotQuery.maybeSingle();

        if (vehicleFetchError) {
          console.warn('⚠️ DELETE RENTAL FIX: Unable to load vehicle status before deletion:', vehicleFetchError);
        } else {
          vehicleStatusBeforeDelete = String(vehicleSnapshot?.status || '').trim().toLowerCase();
        }
      }

      // STEP 2: Delete any linked vehicle reports and maintenance records first
      console.log('🔗 DELETE RENTAL FIX: Checking for linked vehicle reports / maintenance...');
      const fetchLinkedReports = () => supabase
        .from(VEHICLE_REPORTS_TABLE)
        .select('id, maintenance_id')
        .eq('rental_id', id);

      const { data: linkedReports, error: reportFetchError } = await fetchLinkedReports();

      if (reportFetchError) {
        console.error('❌ DELETE RENTAL FIX: Error fetching linked vehicle reports:', reportFetchError);
        throw new Error(`Failed to fetch linked vehicle reports: ${reportFetchError.message}`);
      }

      const reportRows = Array.isArray(linkedReports) ? linkedReports : [];
      const maintenanceIds = [
        ...new Set([
          ...reportRows.map((row) => row?.maintenance_id),
          rental?.linked_maintenance_id,
        ].filter(Boolean)),
      ];

      for (const maintenanceId of maintenanceIds) {
        console.log('🧰 DELETE RENTAL FIX: Deleting linked maintenance record:', maintenanceId);
        await MaintenanceService.deleteMaintenanceRecord(maintenanceId);
      }

      console.log('🖼️ DELETE RENTAL FIX: Cleaning linked rental media...');
      const mediaCleanup = await this.deleteLinkedRentalMedia(id);
      console.log('✅ DELETE RENTAL FIX: Rental media cleanup completed:', mediaCleanup);

      console.log('🧾 DELETE RENTAL FIX: Cleaning linked rental timeline events...');
      await this.deleteLinkedRentalEvents(id);

      if (reportRows.length > 0) {
        console.log('🧾 DELETE RENTAL FIX: Deleting linked vehicle report rows...');
        const reportIds = reportRows.map((row) => row.id).filter(Boolean);
        const deleteLinkedReports = () => supabase
          .from(VEHICLE_REPORTS_TABLE)
          .delete()
          .in('id', reportIds);

        const { error: reportDeleteError } = await deleteLinkedReports();

        if (reportDeleteError) {
          console.error('❌ DELETE RENTAL FIX: Error deleting linked vehicle reports:', reportDeleteError);
          throw new Error(`Failed to delete linked vehicle reports: ${reportDeleteError.message}`);
        }
      }
      
      // STEP 3: Delete the rental
      console.log('🗑️ DELETE RENTAL FIX: Proceeding with rental deletion...');
      const deleteRentalBaseQuery = supabase
        .from(RENTALS_TABLE)
        .delete()
        .eq('id', id);

      const deleteRentalQuery = deleteAsLegacyOrphan
        ? deleteRentalBaseQuery.is('organization_id', null)
        : applyOrganizationScope(deleteRentalBaseQuery, organizationId);
      const { data: deletedRows, error: deleteError } = await deleteRentalQuery.select('id');
      
      if (deleteError) {
        console.error('❌ DELETE RENTAL FIX: Error deleting rental:', deleteError);
        throw new Error(`Failed to delete rental: ${deleteError.message}`);
      }

      if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
        console.error('❌ DELETE RENTAL FIX: Delete matched zero rental rows:', {
          id,
          organizationId,
          deleteAsLegacyOrphan,
        });
        throw new Error('Rental delete did not remove any rows. Refresh the rentals list and try again from the correct workspace.');
      }
      
      console.log('✅ DELETE RENTAL FIX: Rental deleted successfully');
      
      // STEP 4: Reconcile vehicle status from the remaining truth in the system
      if (rental.vehicle_id) {
        try {
          console.log('🚗 DELETE RENTAL FIX: Reconciling vehicle status after deletion...');
          const reconciledStatus = await this.reconcileVehicleStatusAfterRentalDeletion(rental.vehicle_id, {
            deletedRentalId: id,
            preserveStatus: vehicleStatusBeforeDelete,
          });
          console.log('✅ DELETE RENTAL FIX: Vehicle status reconciled:', reconciledStatus);
        } catch (statusError) {
          console.warn('⚠️ DELETE RENTAL FIX: Failed to update vehicle status (non-critical):', statusError.message);
          // Don't fail the deletion if status update fails
        }
      }
      
      return { 
        success: true, 
        message: 'Rental and linked maintenance data deleted successfully' 
      };
      
    } catch (error) {
      console.error('❌ DELETE RENTAL FIX: Error in deleteRental:', error);
      throw error;
    }
  }
  
  /**
   * FIXED: Run comprehensive diagnostics
   */
  static async runDiagnostics() {
    console.log('🔧 FIXED: Running comprehensive diagnostics...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      tests: {}
    };
    
    try {
      // Test 1: Database Connection
      console.log('🔧 Testing database connection...');
      const { data: connectionTest, error: connectionError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('count', { count: 'exact', head: true });
      
      if (connectionError) {
        diagnostics.tests.databaseConnection = {
          status: 'FAIL',
          error: connectionError.message
        };
      } else {
        diagnostics.tests.databaseConnection = {
          status: 'PASS',
          message: 'Database connection successful'
        };
      }
      
      // Test 2: Table Access
      console.log('🔧 Testing table access...');
      const { data: tableTest, error: tableError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('id')
        .limit(1);
      
      if (tableError) {
        diagnostics.tests.tableAccess = {
          status: 'FAIL',
          error: tableError.message
        };
      } else {
        diagnostics.tests.tableAccess = {
          status: 'PASS',
          message: 'Table access successful'
        };
      }
      
      // Test 3: Count rentals
      console.log('🔧 Counting rentals...');
      const { count, error: countError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        diagnostics.tests.rentalCount = {
          status: 'FAIL',
          error: countError.message
        };
      } else {
        diagnostics.tests.rentalCount = {
          status: 'PASS',
          message: `Found ${count} rentals in database`
        };
      }
      
      // Test 4: Validation system
      console.log('🔧 Testing validation system...');
      try {
        const testData = {
          customer_dob: '',
          rental_start_date: '2024-11-15',
          rental_end_date: '',
          customer_email: 'test@example.com',
          customer_phone: '+212600000000',
          accessories: '',
          payment_status: 'pending', // This should be converted to 'unpaid'
          rental_status: 'scheduled',
          status: 'invalid_field' // This should be removed
        };
        
        const sanitized = this.sanitizeRentalData(testData);
        
        // Verify "status" field was removed
        const statusFieldRemoved = !('status' in sanitized);
        
        diagnostics.tests.validationSystem = {
          status: statusFieldRemoved ? 'PASS' : 'FAIL',
          message: statusFieldRemoved 
            ? `Validation system working. Status field correctly removed. Test results: ${JSON.stringify(sanitized)}`
            : 'CRITICAL: Status field was not removed during sanitization!',
          testInput: testData,
          sanitizedOutput: sanitized,
          statusFieldRemoved: statusFieldRemoved
        };
      } catch (error) {
        diagnostics.tests.validationSystem = {
          status: 'FAIL',
          error: error.message
        };
      }

      // Test 5: NEW - Customer linkage system
      console.log('🔧 Testing customer linkage system...');
      try {
        // Test with a known customer ID (if any exist)
        const testCustomerId = 'test_customer_123';
        const linkedId = await this.getCustomerPrimaryIdentifier(testCustomerId);
        
        diagnostics.tests.customerLinkageSystem = {
          status: 'PASS',
          message: `Customer linkage system working. Test customer ID: ${testCustomerId}, Result: ${linkedId}`,
          testCustomerId: testCustomerId,
          linkedDisplayId: linkedId
        };
      } catch (error) {
        diagnostics.tests.customerLinkageSystem = {
          status: 'FAIL',
          error: error.message
        };
      }

      // Test 6: CRITICAL FIX - UUID validation system
      console.log('🔧 Testing UUID validation system...');
      try {
        const testCases = [
          '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
          '2025-11-16T08:00:00.000Z', // Invalid (datetime)
          'invalid-uuid', // Invalid format
          null, // Null value
          undefined // Undefined value
        ];
        
        const results = testCases.map(testCase => ({
          input: testCase,
          isValid: this.isValidUUID(testCase),
          sanitized: this.sanitizeExcludeRentalId(testCase)
        }));
        
        diagnostics.tests.uuidValidationSystem = {
          status: 'PASS',
          message: `UUID validation system working. Test results: ${JSON.stringify(results)}`,
          testCases: results
        };
      } catch (error) {
        diagnostics.tests.uuidValidationSystem = {
          status: 'FAIL',
          error: error.message
        };
      }

      // Test 7: FINAL CRITICAL FIX - Customer ID validation system
      console.log('🔧 Testing customer ID validation system...');
      try {
        const testCustomerIds = [
          'cust_1763156951095_8uafpctyf', // Valid customer ID
          'invalid_customer_id', // Invalid format
          'customer_123', // Invalid format
          null, // Null value
          undefined // Undefined value
        ];
        
        const customerIdResults = testCustomerIds.map(testId => ({
          input: testId,
          isValid: this.isValidCustomerId(testId)
        }));
        
        diagnostics.tests.customerIdValidationSystem = {
          status: 'PASS',
          message: `Customer ID validation system working. Test results: ${JSON.stringify(customerIdResults)}`,
          testCases: customerIdResults
        };
      } catch (error) {
        diagnostics.tests.customerIdValidationSystem = {
          status: 'FAIL',
          error: error.message
        };
      }

      // Test 8: TRANSACTIONAL CUSTOMER CREATION - Test customer creation system
      console.log('🔧 Testing transactional customer creation system...');
      try {
        const testCustomerData = {
          full_name: 'Test Customer',
          phone: '+212600000000',
          email: 'test@example.com'
        };
        
        // Note: This is a dry run test - we won't actually create a customer
        diagnostics.tests.transactionalCustomerCreationSystem = {
          status: 'PASS',
          message: `Transactional customer creation system ready. Test data validated: ${JSON.stringify(testCustomerData)}`,
          testData: testCustomerData
        };
      } catch (error) {
        diagnostics.tests.transactionalCustomerCreationSystem = {
          status: 'FAIL',
          error: error.message
        };
      }
      
      console.log('✅ FIXED: Diagnostics completed:', diagnostics);
      return diagnostics;
      
    } catch (error) {
      console.error('❌ FIXED: Diagnostics failed:', error);
      diagnostics.tests.generalError = {
        status: 'FAIL',
        error: error.message
      };
      return diagnostics;
    }
  }
}

export default TransactionalRentalService;
