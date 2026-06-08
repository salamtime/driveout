import { supabase } from '../lib/supabase.js';
import { geminiVisionOCR } from './ocr/optimizedGeminiVisionOcr.js';
import { buildApiUrl, GEMINI_PROXY_PATH } from './apiUrl.js';
import { buildTenantScopedStoragePath, uploadFile } from '../utils/storageUpload.js';
import { optimizeFileForUpload } from '../utils/storageUpload.js';
import {
  mergeUniqueCustomersById,
  normalizeCustomerIdentityFields,
  pickBestExistingCustomerMatch,
  pickExactIdentityCustomerMatch,
  pickMostCompleteCustomerProfile,
} from '../utils/customerIdentity.js';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  getCurrentOrganizationId,
  requireCurrentOrganizationId,
  scopeTenantOwnedQuery,
  shouldScopeSharedTenantData,
  verifyTenantOwnedRows,
} from './OrganizationService.js';

const CUSTOMER_TABLE = 'app_4c3a7a6153_customers';
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const roundMs = (value) => Math.max(0, Math.round(Number(value) || 0));
const CUSTOMER_ORG_COLUMN_CACHE_KEY = `${CUSTOMER_TABLE}:supportsOrganizationColumn`;
let customerTableSupportsOrganizationColumn = (() => {
  try {
    if (typeof window === 'undefined') return true;
    const cached = window.localStorage.getItem(CUSTOMER_ORG_COLUMN_CACHE_KEY);
    if (cached === 'false') return false;
  } catch (_error) {
    // Ignore browser storage access errors.
  }
  return true;
})();

const isMissingOrganizationColumnError = (error) =>
  error?.code === '42703' && String(error?.message || '').includes('organization_id');

const markCustomerTableWithoutOrganizationColumn = () => {
  customerTableSupportsOrganizationColumn = false;
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CUSTOMER_ORG_COLUMN_CACHE_KEY, 'false');
  } catch (_error) {
    // Ignore browser storage access errors.
  }
};

const runCustomerReadQuery = async (buildQuery, organizationId) => {
  if (shouldScopeSharedTenantData()) {
    if (!organizationId) {
      throw new Error('Workspace organization context is required to load customers.');
    }

    if (customerTableSupportsOrganizationColumn === false) {
      throw new Error('Customer workspace isolation is not installed yet. Apply the organization isolation migration before loading shared tenant customers.');
    }

    let query = await scopeTenantOwnedQuery(buildQuery(), CUSTOMER_TABLE, {
      organizationId,
      message: 'Workspace organization context is required to load customers.',
    });

    const result = await query;

    if (organizationId && isMissingOrganizationColumnError(result.error)) {
      throw new Error('Customer workspace isolation is not installed yet. Apply the organization isolation migration before loading shared tenant customers.');
    }

    await verifyTenantOwnedRows(result.data || [], CUSTOMER_TABLE, {
      organizationId,
      message: 'Customer query returned rows outside the active workspace.',
    });

    return result;
  }

  if (!organizationId || customerTableSupportsOrganizationColumn === false) {
    return buildQuery();
  }

  const scopedResult = await applyOrganizationScope(buildQuery(), organizationId);

  if (organizationId && isMissingOrganizationColumnError(scopedResult.error)) {
    markCustomerTableWithoutOrganizationColumn();
    console.warn('Customer table has no organization_id column; retrying customer read without organization filter.');
    return buildQuery();
  }

  return scopedResult;
};

const runCustomerLookupQuery = async (buildQuery, organizationId) => {
  const { data, error } = await runCustomerReadQuery(buildQuery, organizationId);
  if (error) throw error;
  return data || [];
};

const stripOrganizationField = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return payload;
  const { organization_id: _organizationId, ...rest } = payload;
  return rest;
};

const buildCustomerLookupCandidate = (source = {}) => {
  const normalizedIdentity = normalizeCustomerIdentityFields({
    licenceNumber:
      source.licence_number ||
      source.customer_licence_number ||
      source.license_number ||
      '',
    idNumber:
      source.id_number ||
      source.customer_id_number ||
      source.idNumber ||
      source.document_number ||
      '',
  });

  return {
    full_name: String(source.full_name || source.customer_name || source.fullName || source.name || source.raw_name || '').trim(),
    phone: String(source.phone || source.customer_phone || '').trim(),
    email: String(source.email || source.customer_email || '').trim(),
    licence_number: normalizedIdentity.licenceNumber || '',
    id_number: normalizedIdentity.idNumber || '',
    date_of_birth: String(source.date_of_birth || source.customer_dob || source.dateOfBirth || '').trim() || null,
    nationality: String(source.nationality || source.customer_nationality || '').trim() || '',
  };
};

const extractMinimumIdentitySnapshot = (payload = {}) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const fullName = String(
    source.fullName ||
    source.full_name ||
    source.customer_name ||
    source.name ||
    source.raw_name ||
    [source.first_name, source.middle_name, source.last_name].filter(Boolean).join(' ') ||
    [source.given_name, source.family_name].filter(Boolean).join(' ') ||
    ''
  ).trim();
  const documentNumber = String(
    source.document_number ||
    source.documentNumber ||
    source.idNumber ||
    source.id_number ||
    source.licence_number ||
    source.license_number ||
    source.customer_id_number ||
    source.customer_licence_number ||
    ''
  ).trim();

  return { fullName, documentNumber };
};

/**
 * EnhancedUnifiedCustomerService - Complete customer management with ID scanning integration
 * 
 * FEATURES:
 * - OCR-based customer data extraction from ID scans
 * - Automatic customer creation/update with image storage
 * - Enhanced data validation and sanitization
 * - Comprehensive error handling and logging
 * - SHIELDING STRATEGY: Manual input always takes priority over OCR data
 * - CRITICAL FIX: Phone number and email mapping protection
 * - FORM AUTO-POPULATION FIX: Returns extractedData in correct format for form population
 */
class EnhancedUnifiedCustomerService {
  constructor() {
    this.ocrProxyWarmPromise = null;
    this.ocrProxyWarmAt = 0;
    this.geminiProxyUrl = buildApiUrl(GEMINI_PROXY_PATH);
  }

  normalizeOcrIdentityPayload(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const derivedFullName =
      [
        source.first_name || source.firstName || source.given_name || source.givenName || '',
        source.middle_name || source.middleName || '',
        source.last_name || source.lastName || source.family_name || source.familyName || '',
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ');
    const fullName =
      source.fullName ||
      source.full_name ||
      source.customer_name ||
      source.name ||
      derivedFullName ||
      source.raw_name ||
      '';
    const dateOfBirth =
      source.dateOfBirth ||
      source.date_of_birth ||
      source.customer_dob ||
      '';
    const nationality =
      source.nationality ||
      source.customer_nationality ||
      source.country ||
      '';
    const email =
      source.email ||
      source.customer_email ||
      '';
    const phone =
      source.phone ||
      source.customer_phone ||
      '';
    const normalizedIdentity = normalizeCustomerIdentityFields({
      licenceNumber:
        source.licence_number ||
        source.license_number ||
        source.documentNumber ||
        source.document_number ||
        source.idNumber ||
        source.id_number,
      idNumber:
        source.idNumber ||
        source.documentNumber ||
        source.id_number ||
        source.document_number ||
        source.licence_number ||
        source.license_number,
    });
    const canonicalDocumentNumber =
      normalizedIdentity.licenceNumber ||
      normalizedIdentity.idNumber ||
      source.documentNumber ||
      source.document_number ||
      source.idNumber ||
      source.id_number ||
      source.licence_number ||
      source.license_number ||
      '';

    return {
      ...source,
      fullName: fullName || null,
      full_name: fullName || null,
      customer_name: fullName || '',
      dateOfBirth: dateOfBirth || null,
      date_of_birth: dateOfBirth || null,
      customer_dob: dateOfBirth || '',
      nationality: nationality || null,
      customer_nationality: nationality || '',
      email: email || null,
      customer_email: email || '',
      phone: phone || null,
      customer_phone: phone || '',
      idNumber: canonicalDocumentNumber || null,
      id_number: canonicalDocumentNumber || null,
      customer_id_number: canonicalDocumentNumber || '',
      licence_number: canonicalDocumentNumber || null,
      customer_licence_number: canonicalDocumentNumber || '',
      document_number: canonicalDocumentNumber || null,
    };
  }

  hasMinimumOcrIdentity(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const normalized = this.normalizeOcrIdentityPayload(source);
    const fullName = String(
      normalized.fullName ||
      normalized.full_name ||
      source.fullName ||
      source.full_name ||
      source.customer_name ||
      source.name ||
      source.raw_name ||
      [source.first_name, source.middle_name, source.last_name].filter(Boolean).join(' ') ||
      [source.given_name, source.family_name].filter(Boolean).join(' ')
    ).trim();
    const documentNumber = String(
      normalized.document_number ||
      normalized.idNumber ||
      normalized.id_number ||
      normalized.licence_number ||
      source.documentNumber ||
      source.document_number ||
      source.idNumber ||
      source.id_number ||
      source.licence_number ||
      source.license_number ||
      ''
    ).trim();

    return Boolean(fullName && documentNumber);
  }

  buildDirectOcrPrompt(mode = 'fast') {
    if (mode === 'fast') {
      return `Extract only the minimum rental check-in fields from this ID document. Return ONLY valid JSON, with double-quoted keys and string values, and null for missing values. Do not include explanations, markdown, or code fences.
{
  "fullName": "full name",
  "dateOfBirth": "date of birth (YYYY-MM-DD)",
  "idNumber": "ID or license number",
  "nationality": "nationality"
}`;
    }

    return `Extract all text and information from this ID document. Return a JSON object with these fields:
{
  "fullName": "full name",
  "dateOfBirth": "date of birth (YYYY-MM-DD)",
  "idNumber": "ID/license number",
  "address": "full address",
  "expiryDate": "expiry date (YYYY-MM-DD)",
  "issueDate": "issue date (YYYY-MM-DD)",
  "nationality": "nationality",
  "gender": "gender",
  "rawText": "all extracted text"
}`;
  }

  convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async requestDirectGeminiOCR(file, prompt, mode = 'fast') {
    const requestStartedAt = nowMs();
    const base64StartedAt = nowMs();
    const base64Image = await this.convertFileToBase64(file);
    const base64CompletedAt = nowMs();
    const mimeType = file?.type || 'image/jpeg';

    const parseJsonFromText = (rawText = '') => {
      const text = String(rawText || '').trim();
      if (!text) return {};

      const fencedMatch =
        text.match(/```json\s*([\s\S]*?)\s*```/i) ||
        text.match(/```\s*([\s\S]*?)\s*```/i);
      const candidateText = fencedMatch?.[1] || text;

      const directCandidates = [
        candidateText,
        ...(candidateText.match(/\{[\s\S]*\}/g) || []),
      ];

      for (const candidate of directCandidates) {
        try {
          return JSON.parse(candidate);
        } catch (_error) {
          // Continue to repair attempts below.
        }

        try {
          const repaired = candidate
            .replace(/^[^{]*/, '')
            .replace(/[^}]*$/, '')
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']');
          return JSON.parse(repaired);
        } catch (_error) {
          // Continue searching.
        }
      }

      return { rawText: text };
    };

    let ocrData = {};
    let ocrUnavailable = false;
    let ocrErrorMessage = null;

    try {
      const isFastMode = mode === 'fast';
      const proxyStartedAt = nowMs();
      const geminiResponse = await fetch(this.geminiProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateContent',
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: isFastMode ? 2048 : 2048,
            temperature: 0,
            topK: 1,
            topP: 1,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        })
      });
      const proxyCompletedAt = nowMs();

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        const normalizedErrorText = String(errorText || '').toLowerCase();
        if (
          (geminiResponse.status === 403 &&
            (normalizedErrorText.includes('reported as leaked') ||
              normalizedErrorText.includes('permission_denied') ||
              normalizedErrorText.includes('api key'))) ||
          (geminiResponse.status === 400 &&
            (normalizedErrorText.includes('api key expired') ||
              normalizedErrorText.includes('api_key_invalid') ||
              normalizedErrorText.includes('please renew the api key')))
        ) {
          throw new Error('OCR is unavailable right now because the Gemini API key must be replaced or renewed by an admin.');
        }

        throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
      }

      const parseStartedAt = nowMs();
      const geminiResult = await geminiResponse.json();
      const ocrText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '';

      ocrData = parseJsonFromText(ocrText);
      const parseCompletedAt = nowMs();

      console.log('⏱️ [OCR SERVICE] Gemini request timings', {
        mode,
        fileType: mimeType,
        fileSizeMb: Number(((file?.size || 0) / 1024 / 1024).toFixed(2)),
        base64PayloadMb: Number((base64Image.length / 1024 / 1024).toFixed(2)),
        base64Ms: roundMs(base64CompletedAt - base64StartedAt),
        proxyMs: roundMs(proxyCompletedAt - proxyStartedAt),
        parseMs: roundMs(parseCompletedAt - parseStartedAt),
        totalMs: roundMs(parseCompletedAt - requestStartedAt),
      });
    } catch (ocrError) {
      ocrUnavailable = true;
      ocrErrorMessage = ocrError.message || 'OCR unavailable';
      console.warn('⏱️ [OCR SERVICE] Gemini request failed after timing', {
        mode,
        fileType: mimeType,
        fileSizeMb: Number(((file?.size || 0) / 1024 / 1024).toFixed(2)),
        base64PayloadMb: Number((base64Image.length / 1024 / 1024).toFixed(2)),
        base64Ms: roundMs(base64CompletedAt - base64StartedAt),
        totalMs: roundMs(nowMs() - requestStartedAt),
        error: ocrErrorMessage,
      });
    }

    return {
      ocrData,
      ocrUnavailable,
      ocrErrorMessage,
      timings: {
        base64Ms: roundMs(base64CompletedAt - base64StartedAt),
        totalMs: roundMs(nowMs() - requestStartedAt),
      },
    };
  }

  async prewarmOcrProxy() {
    const warmTtlMs = 60 * 1000;
    if (this.ocrProxyWarmPromise) {
      return this.ocrProxyWarmPromise;
    }

    if (Date.now() - this.ocrProxyWarmAt < warmTtlMs) {
      return true;
    }

    this.ocrProxyWarmPromise = fetch(this.geminiProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'listModels',
      }),
    })
      .then(() => {
        this.ocrProxyWarmAt = Date.now();
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.ocrProxyWarmPromise = null;
      });

    return this.ocrProxyWarmPromise;
  }

  uploadOcrSourceImage(file, scanId, folder) {
    const safeFileName = `${scanId || Date.now()}_${String(file.name || 'document.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    return uploadFile(file, {
      bucket: 'rental-documents',
      pathPrefix: folder,
      fileName: safeFileName,
      optimizationProfile: 'document',
    });
  }

  async prepareOcrFile(file) {
    const optimized = await optimizeFileForUpload(file, {
      bucket: 'rental-documents',
      optimizationProfile: 'document',
    });

    return optimized?.file || file;
  }

  async uploadPreparedOcrSourceImage(file, scanId, folder, organizationId = null) {
    const cleanName = String(file?.name || 'document.webp').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = buildTenantScopedStoragePath({
      organizationId,
      pathPrefix: folder,
      fileName: `${scanId || Date.now()}_${cleanName}`,
    });

    const { data, error } = await supabase.storage
      .from('rental-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file?.type || 'application/octet-stream',
      });

    if (error) {
      return {
        success: false,
        error: error.message || 'Upload failed',
      };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('rental-documents').getPublicUrl(data.path);

    return {
      success: true,
      url: publicUrl,
      path: data.path,
      optimized: true,
    };
  }

  async runSharedOcrPipeline(file, scanId, options = {}) {
    const {
      folder = 'customers_ocr',
      successMessage = 'OCR completed successfully',
      unavailableMessage = 'Image uploaded successfully. OCR unavailable, continue manually.',
      logPrefix = '[OCR]',
      includePublicUrl = false,
      ocrMode = 'fast',
    } = options;

    const prompt = this.buildDirectOcrPrompt(ocrMode);
    const pipelineStartedAt = nowMs();
    const organizationIdPromise = getCurrentOrganizationId().catch(() => null);
    const preparedFile = await this.prepareOcrFile(file);
    const preparedAt = nowMs();
    let uploadMs = 0;
    let ocrMs = 0;
    let fallbackMs = 0;
    const [uploadResult, ocrResult] = await Promise.all([
      (async () => {
        const uploadStartedAt = nowMs();
        const organizationId = await organizationIdPromise;
        const result = await this.uploadPreparedOcrSourceImage(preparedFile, scanId, folder, organizationId);
        uploadMs = roundMs(nowMs() - uploadStartedAt);
        return result;
      })(),
      (async () => {
        const ocrStartedAt = nowMs();
        const result = await this.requestDirectGeminiOCR(preparedFile, prompt, ocrMode);
        ocrMs = roundMs(nowMs() - ocrStartedAt);
        return result;
      })(),
    ]);
    const completedAt = nowMs();

    if (!uploadResult.success) {
      console.error('❌ [UPLOAD] Failed:', uploadResult.error);
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }
    const publicUrl = uploadResult.url;
    let { ocrData, ocrUnavailable, ocrErrorMessage } = ocrResult;
    let normalizedOcrData = this.normalizeOcrIdentityPayload(ocrData);
    const rawFastIdentity = extractMinimumIdentitySnapshot(ocrData);
    const normalizedFastIdentity = extractMinimumIdentitySnapshot(normalizedOcrData);
    const fastIdentityReady =
      Boolean(rawFastIdentity.fullName && rawFastIdentity.documentNumber) ||
      Boolean(normalizedFastIdentity.fullName && normalizedFastIdentity.documentNumber);

    if (!ocrUnavailable && ocrMode === 'fast' && !fastIdentityReady) {
      console.warn('⚠️ [OCR PIPELINE] Fast OCR returned no usable identity. Falling back to full OCR.', {
        rawFastIdentity,
        normalizedFastIdentity,
      });
      try {
        const fallbackStartedAt = nowMs();
        const fallbackResult = await geminiVisionOCR.processIdDocument(preparedFile);
        fallbackMs = roundMs(nowMs() - fallbackStartedAt);
        if (fallbackResult?.success && fallbackResult?.data) {
          normalizedOcrData = this.normalizeOcrIdentityPayload(fallbackResult.data);
          ocrData = normalizedOcrData;
          console.log('✅ [OCR PIPELINE] Full OCR fallback recovered usable identity:', {
            fullName: normalizedOcrData.fullName,
            documentNumber: normalizedOcrData.document_number,
            fallbackMs,
          });
        }
      } catch (fallbackError) {
        console.warn('⚠️ [OCR PIPELINE] Full OCR fallback failed:', fallbackError?.message || fallbackError);
      }
    }

    if (!this.hasMinimumOcrIdentity(normalizedOcrData) && ocrData?.rawText) {
      normalizedOcrData = this.normalizeOcrIdentityPayload(ocrData);
    }

    console.log('⚡ [OCR PIPELINE] timings', {
      mode: ocrMode,
      prepareMs: roundMs(preparedAt - pipelineStartedAt),
      uploadMs,
      ocrMs,
      base64Ms: ocrResult.timings?.base64Ms || 0,
      fallbackMs,
      totalMs: roundMs(completedAt - pipelineStartedAt),
      overlapMsSaved: Math.max(0, roundMs(completedAt - preparedAt)),
    });

    return {
      success: true,
      data: normalizedOcrData,
      extractedData: normalizedOcrData,
      imageUrl: publicUrl,
      ...(includePublicUrl ? { publicUrl } : {}),
      storagePath: uploadResult.path,
      scanId,
      ocrUnavailable,
      ocrError: ocrErrorMessage,
      timings: {
        mode: ocrMode,
        prepareMs: roundMs(preparedAt - pipelineStartedAt),
        uploadMs,
        ocrMs,
        base64Ms: ocrResult.timings?.base64Ms || 0,
        fallbackMs,
        pipelineMs: roundMs(completedAt - pipelineStartedAt),
      },
      message: ocrUnavailable ? unavailableMessage : successMessage,
    };
  }

  async uploadDocumentOnly(file, options = {}) {
    try {
      if (!file) {
        throw new Error('Image file is required');
      }

      const folder = String(options.folder || 'manual_id_uploads').replace(/[^a-zA-Z0-9/_-]/g, '_');
      const prefix = String(options.prefix || `doc_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFileName = String(file.name || 'document.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const uploadResult = await uploadFile(file, {
        bucket: 'rental-documents',
        pathPrefix: folder,
        fileName: `${prefix}_${Date.now()}_${safeFileName}`,
        optimizationProfile: 'document',
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      return {
        success: true,
        storagePath: uploadResult.path,
        publicUrl: uploadResult.url,
        imageUrl: uploadResult.url,
        fileName: file.name,
      };
    } catch (error) {
      console.error('❌ uploadDocumentOnly failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to save image',
      };
    }
  }

  /**
   * SHIELDING STRATEGY: Save customer with intelligent merge that protects manual input
   * Manual input is the "Master", OCR data is the "Assistant"
   */
  static async saveCustomer(customerData, scanResult = null, isSecondDriver = false) {
    // ABSOLUTE BLOCK FOR SECOND DRIVERS - FIRST LINE OF DEFENSE
    if (isSecondDriver === true) {
      console.log("🚫 [ABSOLUTE BLOCK] SECOND DRIVER detected in saveCustomer - NO DATABASE WRITE");
      return {
        success: true,
        message: "Blocked - second driver should not create customer record",
        blocked: true,
        isSecondDriver: true
      };
    }

    console.log('🆕 SHIELDING STRATEGY: Starting customer save with protected manual input:', {
      customerData,
      scanResult
    });
    
    try {
      const organizationId = await getCurrentOrganizationId();
      // Step 1: Validate input data
      if (!customerData) {
        throw new Error('Customer data is required');
      }

      // Step 2: Extract and validate id_scan_url
      let idScanUrl = null;
      
      if (scanResult?.file_public_url) {
        idScanUrl = scanResult.file_public_url;
        console.log('✅ Using scanResult.file_public_url for id_scan_url:', idScanUrl);
      } else if (customerData.id_scan_url) {
        idScanUrl = customerData.id_scan_url;
        console.log('✅ Using customerData.id_scan_url:', idScanUrl);
      } else {
        console.log('⚠️ No id_scan_url provided, will be set to null');
      }

      // Step 3: Fetch existing customer data if updating
      let existingCustomer = null;
      if (customerData.id) {
        console.log('🔍 SHIELDING: Fetching existing customer data for merge:', customerData.id);
        const { data: existing, error: fetchError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('*')
          .eq('id', customerData.id)
          .maybeSingle();
        
        if (!fetchError && existing) {
          existingCustomer = existing;
          console.log('✅ SHIELDING: Found existing customer data:', existingCustomer);
        }
      }

      // Step 4: Sanitize customer data
      const sanitizedCustomerData = this.sanitizeCustomerData(customerData);
      console.log('🧹 SHIELDING: Sanitized customer data:', sanitizedCustomerData);
      const normalizedIdentity = normalizeCustomerIdentityFields({
        licenceNumber: sanitizedCustomerData.customer_licence_number || sanitizedCustomerData.licence_number || existingCustomer?.licence_number,
        idNumber: sanitizedCustomerData.customer_id_number || sanitizedCustomerData.id_number || existingCustomer?.id_number,
      });

      // Step 5: SHIELDING STRATEGY - Build final customer data with intelligent merge
      // Priority: Manual Input > Existing Data > OCR Data
      const finalCustomerData = {
        // Start with existing data as base (if available)
        ...(existingCustomer || {}),
        
        // Layer OCR data on top (only fills empty fields)
        full_name: sanitizedCustomerData.customer_name || sanitizedCustomerData.full_name || existingCustomer?.full_name,
        date_of_birth: sanitizedCustomerData.customer_dob || sanitizedCustomerData.date_of_birth || existingCustomer?.date_of_birth || null,
        nationality: sanitizedCustomerData.customer_nationality || sanitizedCustomerData.nationality || existingCustomer?.nationality || null,
        licence_number: normalizedIdentity.licenceNumber,
        id_number: normalizedIdentity.idNumber,
        place_of_birth: sanitizedCustomerData.customer_place_of_birth || sanitizedCustomerData.place_of_birth || existingCustomer?.place_of_birth || null,
        issue_date: sanitizedCustomerData.customer_issue_date || sanitizedCustomerData.issue_date || existingCustomer?.issue_date || null,
        
        // CRITICAL SHIELDING: Protect email and phone - only update if explicitly provided and not empty
        email: customerData.hasOwnProperty('customer_email') && sanitizedCustomerData.customer_email !== null
          ? sanitizedCustomerData.customer_email
          : (customerData.hasOwnProperty('email') && sanitizedCustomerData.email !== null
            ? sanitizedCustomerData.email
            : existingCustomer?.email),
        
        phone: customerData.hasOwnProperty('customer_phone') && sanitizedCustomerData.customer_phone !== null
          ? sanitizedCustomerData.customer_phone
          : (customerData.hasOwnProperty('phone') && sanitizedCustomerData.phone !== null
            ? sanitizedCustomerData.phone
            : existingCustomer?.phone),
        
        // Image URL
        id_scan_url: idScanUrl || existingCustomer?.id_scan_url,
        
        // Metadata
        created_at: existingCustomer?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const scopedFinalCustomerData = customerTableSupportsOrganizationColumn !== false
        ? {
            ...applyOrganizationMatch({}, organizationId),
            ...finalCustomerData,
          }
        : stripOrganizationField(finalCustomerData);

      console.log('🎯 SHIELDING: Final customer data with protected manual input:', scopedFinalCustomerData);
      console.log('🖼️ SHIELDING: id_scan_url field value:', scopedFinalCustomerData.id_scan_url);
      console.log('📞 SHIELDING: phone field value:', scopedFinalCustomerData.phone);
      console.log('📧 SHIELDING: email field value:', scopedFinalCustomerData.email);

      // Step 6: Validate required fields
      if (!scopedFinalCustomerData.full_name) {
        throw new Error('Customer full name is required');
      }

      // Step 7: DUPLICATE PREVENTION & CUSTOMER LOOKUP
      if (scopedFinalCustomerData.full_name) {
        const duplicateLookupCandidate = buildCustomerLookupCandidate(scopedFinalCustomerData);
        console.log('🔍 DUPLICATE CHECK: Checking for customer with identity:', {
          name: duplicateLookupCandidate.full_name,
          licence: duplicateLookupCandidate.licence_number,
          idNumber: duplicateLookupCandidate.id_number,
          phone: duplicateLookupCandidate.phone,
          email: duplicateLookupCandidate.email,
          dateOfBirth: duplicateLookupCandidate.date_of_birth,
          nationality: duplicateLookupCandidate.nationality,
        });

        const duplicateCandidates = await this.findMatchingCustomers(duplicateLookupCandidate);
        const duplicateCustomer =
          pickExactIdentityCustomerMatch({
            incomingCustomer: duplicateLookupCandidate,
            candidates: duplicateCandidates,
          }) ||
          pickBestExistingCustomerMatch({
            incomingCustomer: duplicateLookupCandidate,
            candidates: duplicateCandidates,
          }) ||
          pickMostCompleteCustomerProfile(duplicateCandidates);

        if (duplicateCustomer && (duplicateCustomer.id !== customerData.id || !existingCustomer)) {
          console.log('✅ DUPLICATE CHECK: Customer already exists. Updating existing profile:', duplicateCustomer.id);

          // Merge with existing customer, preserving saved contact details unless the
          // incoming payload explicitly contains a real replacement value.
          const updatePayload = {
            ...duplicateCustomer,
            ...scopedFinalCustomerData,
            id: duplicateCustomer.id, // Keep original ID
            email: scopedFinalCustomerData.email ?? duplicateCustomer.email ?? null,
            phone: scopedFinalCustomerData.phone ?? duplicateCustomer.phone ?? null,
            updated_at: new Date().toISOString()
          };
          
          console.log('🛡️ SHIELDING: Merged update payload:', updatePayload);

          const { data: updatedCustomer, error: updateError } = await supabase
            .from('app_4c3a7a6153_customers')
            .update(updatePayload)
            .eq('id', duplicateCustomer.id)
            .select()
            .single();

          if (updateError) {
            console.error('❌ DUPLICATE CHECK: Failed to update existing customer record:', updateError);
            throw new Error(`Failed to update existing customer: ${updateError.message}`);
          }

          return {
            success: true,
            data: updatedCustomer,
            isExisting: true,
            message: 'Customer already exists. Rental will be added to their existing profile.'
          };
        }
      }

      // Step 8: Create or update customer
      const customerToUpsert = {
        id: customerData.id,
        ...scopedFinalCustomerData,
      };

      if (!customerToUpsert.id) {
        console.error('❌ CRITICAL ERROR: Attempting to upsert a customer without a valid ID.');
        throw new Error('Customer creation failed because no ID was provided.');
      }

      console.log('💾 SHIELDING: Upserting customer with protected data:', customerToUpsert);

      const { data: upsertedCustomerData, error: upsertError } = await supabase
        .from('app_4c3a7a6153_customers')
        .upsert(customerToUpsert, { onConflict: 'id' })
        .select();

      if (upsertError) {
        if (upsertError.code === '23505') {
          // Unique constraint on a field other than id (e.g. licence_number, id_number).
          // Recover: find the conflicting row and update it instead.
          console.warn('⚠️ Upsert hit unique constraint — attempting conflict recovery.', upsertError);

          const conflictLookupCandidate = buildCustomerLookupCandidate(customerToUpsert);
          const conflictingCandidates = await this.findMatchingCustomers(conflictLookupCandidate);
          const conflictingRecord =
            pickExactIdentityCustomerMatch({
              incomingCustomer: conflictLookupCandidate,
              candidates: conflictingCandidates,
            }) ||
            pickBestExistingCustomerMatch({
              incomingCustomer: conflictLookupCandidate,
              candidates: conflictingCandidates,
            }) ||
            pickMostCompleteCustomerProfile(conflictingCandidates) ||
            null;

          if (conflictingRecord) {
            console.log('🔁 Conflict recovery: updating existing record', conflictingRecord.id);
            const { data: recovered, error: recoverError } = await supabase
              .from('app_4c3a7a6153_customers')
              .update({ ...customerToUpsert, id: conflictingRecord.id, updated_at: new Date().toISOString() })
              .eq('id', conflictingRecord.id)
              .select()
              .single();

            if (recoverError) {
              console.error('❌ Conflict recovery update failed:', recoverError);
              throw new Error(`Customer save failed: ${recoverError.message}`);
            }

            return {
              success: true,
              data: recovered,
              isExisting: true,
              message: 'Customer already exists. Rental will be added to their existing profile.'
            };
          }

          console.error('❌ Customer upsert failed due to unique constraint and recovery found no match.', upsertError);
          throw new Error('Failed to save customer data due to a conflict. A record with similar unique information may already exist.');
        }
        console.error('❌ Customer upsert failed:', upsertError);
        throw new Error(`Customer save failed: ${upsertError.message}`);
      }
      
      if (!upsertedCustomerData || upsertedCustomerData.length === 0) {
        console.error('❌ CRITICAL: Upsert operation returned no data.');
        throw new Error('Failed to save or retrieve customer data after operation.');
      }

      const customerResult = upsertedCustomerData[0];
      console.log('✅ SHIELDING: Customer created/updated successfully:', customerResult.id);

      // Step 9: FINAL VERIFICATION
      if (idScanUrl && !customerResult.id_scan_url) {
        console.error('❌ SHIELDING: CRITICAL ERROR - id_scan_url was not saved to database!');
        throw new Error('CRITICAL ERROR: id_scan_url was not saved to customer record in database!');
      }

      console.log('✅ SHIELDING: Customer save completed successfully with protected manual input');
      
      return {
        success: true,
        data: customerResult,
        message: 'Customer saved successfully with protected manual input'
      };

    } catch (error) {
      console.error('❌ SHIELDING: Customer save failed:', error);
      
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  /**
   * FORM AUTO-POPULATION: Process Sequential Image Upload with Complete ID Scanning Workflow
   * This function returns extractedData in the correct format for form auto-population
   * DOES NOT OVERWRITE MANUAL INPUT - only provides data for the modal to merge intelligently
   */
  static async processSequentialImageUpload(imageFile, customerId, rentalId = null, scanType = 'document', isSecondDriver = false) {
    
    console.log("🔍 [DEBUG] processSequentialImageUpload CALL STACK:", new Error().stack);
    console.log("🔍 Called with parameters:", { 
      customerId, 
      rentalId, 
      scanType, 
      isSecondDriver,
      fileExists: !!imageFile,
      fileName: imageFile?.name 
    });
    
    // 🚨🚨🚨 NUCLEAR BLOCK FOR SECOND DRIVERS
    if (isSecondDriver === true) {
      console.log("🚨🚨🚨 [NUCLEAR BLOCK] processSequentialImageUpload called with isSecondDriver=true!");
      console.log("🚨 This should NOT happen for second drivers!");
      console.log("🚨 BLOCKING and returning error instead of processing");
      
      return {
        success: false,
        error: "SECOND DRIVER NUCLEAR BLOCK: processSequentialImageUpload should NOT be called for second drivers",
        message: "Critical error: Modal calling wrong method. Should call processSecondDriverID() instead.",
        isSecondDriver: true,
        blocked: true
      };
    }
    
    console.log(`🔍 [SERVICE DEBUG] processSequentialImageUpload called`);
    console.log(`🔍 isSecondDriver: ${isSecondDriver}`);
    console.log(`🔍 customerId: ${customerId}`);
    try {
      console.log('🔄 FORM AUTO-POPULATION: Processing sequential image upload for customer:', customerId);
      console.log('📁 Image file:', imageFile?.name);
      console.log('🆔 Rental ID:', rentalId);
      console.log('📋 Scan type:', scanType);
      
      // Step 1: Validate inputs
      if (!imageFile) {
        throw new Error('Image file is required');
      }
      
      if (!customerId) {
        throw new Error('Customer ID is required');
      }
      
      // Step 2: Generate unique file path with timestamp
      const timestamp = Date.now();
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      const fileName = `idscan_${timestamp}.${fileExtension}`;
      const filePath = `${customerId}/${fileName}`;

      console.log('📤 FORM AUTO-POPULATION: Uploading image to storage bucket...');
      console.log('📁 File path:', filePath);

      // Step 3: Upload image to storage
      const uploadResult = await uploadFile(imageFile, {
        bucket: 'id_scans',
        pathPrefix: String(customerId),
        fileName,
        optimizationProfile: 'document',
      });

      if (!uploadResult.success) {
        console.error('❌ FORM AUTO-POPULATION: Image upload failed:', uploadResult.error);
        throw new Error(`Failed to upload image: ${uploadResult.error}`);
      }

      console.log('✅ FORM AUTO-POPULATION: Image uploaded successfully:', uploadResult.path);

      // Step 4: Get public URL
      const publicUrl = uploadResult.url;

      console.log('🖼️ FORM AUTO-POPULATION: Generated public URL:', publicUrl);

      // Step 5: Process image with ACTUAL OCR
      console.log('🔍 FORM AUTO-POPULATION: Starting ACTUAL OCR processing...');
      
      let ocrResult;
      try {
        ocrResult = await geminiVisionOCR.processIdDocument(imageFile, customerId);
        console.log('✅ FORM AUTO-POPULATION: OCR processing completed:', ocrResult.success);
        console.log('📦 FORM AUTO-POPULATION: OCR extracted data:', JSON.stringify(ocrResult.data, null, 2));
      } catch (ocrError) {
        console.error('❌ FORM AUTO-POPULATION: OCR processing failed:', ocrError);
        ocrResult = {
          success: false,
          error: ocrError.message,
          data: {}
        };
      }

      // Step 6: Prepare data for form auto-population (WITHOUT saving to database yet)
      let shouldPopulateForm = false;
      let responseMessage = '';
      let extractedData = {}; // CRITICAL: This is what the form expects for auto-population

      if (ocrResult.success && ocrResult.data) {
        console.log('🔍 FORM AUTO-POPULATION: Processing OCR data for form population...');
        console.log('📦 FORM AUTO-POPULATION: OCR extracted data:', JSON.stringify(ocrResult.data, null, 2));
        
        // Map OCR data to form field names
        extractedData = {
          customer_name: ocrResult.data.full_name || '',
          customer_email: ocrResult.data.email || '',
          customer_phone: ocrResult.data.phone || '',
          customer_dob: ocrResult.data.date_of_birth || '',
          customer_nationality: ocrResult.data.nationality || '',
          customer_licence_number: ocrResult.data.licence_number || '',
          customer_id_number: ocrResult.data.id_number || '',
          customer_place_of_birth: ocrResult.data.place_of_birth || '',
          customer_issue_date: ocrResult.data.issue_date || '',
          document_number: ocrResult.data.licence_number || ocrResult.data.id_number || '',
          id_scan_url: publicUrl
        };

        console.log('🎯 FORM AUTO-POPULATION: Mapped extractedData for form:', JSON.stringify(extractedData, null, 2));
        
        // SECOND DRIVER CHECK: Skip customer saving for second drivers
        if (isSecondDriver) {
      console.log('👥 SECOND DRIVER MODE: Skipping customer save completely - NO database write');
      console.log('👥 SECOND DRIVER MODE: Returning OCR data only for form population');
      shouldPopulateForm = true;
      responseMessage = '✅ Second driver ID scanned successfully! Data extracted (not saved to customers table).';
      // CRITICAL: Do NOT call saveCustomer at all for second drivers
    } else {
          // Save customer data with OCR results and image URL (PRIMARY DRIVER ONLY)
          console.log('👤 PRIMARY DRIVER MODE: Proceeding with customer save to database');
          const customerDataWithScan = {
            id: customerId,
            ...ocrResult.data,
            id_scan_url: publicUrl,
          };

          const scanResult = {
            file_public_url: publicUrl,
            file_path: uploadResult.path,
            success: true
          };

          console.log('💾 FORM AUTO-POPULATION: Saving customer with OCR data and image URL...');
          const customerSaveResult = await this.saveCustomer(customerDataWithScan, scanResult);

          if (customerSaveResult.success) {
            shouldPopulateForm = true;
            responseMessage = customerSaveResult.isExisting 
              ? `✅ ${customerSaveResult.message}`
              : `✅ ID scan processed successfully! New customer created. Form populated with ${Object.keys(extractedData).filter(key => extractedData[key]).length} fields.`;
            console.log('✅ FORM AUTO-POPULATION: Customer save/update completed successfully.');
          } else {
            shouldPopulateForm = false;
            responseMessage = `❌ ID scan failed: ${customerSaveResult.error}`;
            console.error('❌ FORM AUTO-POPULATION: Customer save failed:', customerSaveResult.error);
          }
        }
      } else {
        // OCR failed, but still save the image URL to customer record if possible
        console.log('⚠️ FORM AUTO-POPULATION: OCR failed, attempting to save image URL only...');
        
        try {
          const { data: existingCustomer } = await supabase
            .from('app_4c3a7a6153_customers')
            .select('*')
            .eq('id', customerId)
            .single();

          if (existingCustomer) {
            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_customers')
              .update({ 
                id_scan_url: publicUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', customerId);

            if (!updateError) {
              console.log('✅ FORM AUTO-POPULATION: Image URL saved to existing customer record');
            }
          }
        } catch (error) {
          console.log('⚠️ FORM AUTO-POPULATION: Could not update customer with image URL:', error.message);
        }

        shouldPopulateForm = false;
        responseMessage = 'Image uploaded but OCR processing failed. Please enter customer details manually.';
      }

      console.log('✅ FORM AUTO-POPULATION: Sequential image upload process completed');
      
      // CRITICAL: Return the correct format with extractedData for form auto-population
      const result = {
        success: true,
        publicUrl: publicUrl,
        filePath: filePath,
        ocrResult: ocrResult,
        shouldPopulateForm: shouldPopulateForm,
        extractedData: extractedData, // CRITICAL: This is what enables form auto-population
        message: responseMessage,
        // Additional fields for compatibility
        scanId: `scan_${timestamp}`,
        scanNumber: 1,
        updateResult: {
          success: true,
          shouldPopulateForm: shouldPopulateForm,
          shouldMarkComplete: true
        }
      };

      console.log('🎯 FORM AUTO-POPULATION: Final result with extractedData:', JSON.stringify(result, null, 2));
      return result;

    } catch (error) {
      console.error('❌ FORM AUTO-POPULATION: Sequential image upload failed:', error);
      return {
        success: false,
        error: error.message,
        shouldPopulateForm: false,
        extractedData: {}, // Empty object for failed cases
        message: 'Failed to process image upload'
      };
    }
  }

  /**
   * Enhanced customer data sanitization
   */
  static sanitizeCustomerData(customerData) {
    const sanitized = { ...customerData };

    console.log('🧹 Sanitizing customer data:', customerData);

    // Handle date fields
    const dateFields = ['date_of_birth', 'customer_dob', 'issue_date', 'customer_issue_date'];
    dateFields.forEach(field => {
      if (field in sanitized) {
        const originalValue = sanitized[field];
        if (!originalValue || (typeof originalValue === 'string' && originalValue.trim() === '')) {
          sanitized[field] = null;
        } else {
          // Try to format date
          try {
            const date = new Date(originalValue);
            if (!isNaN(date.getTime())) {
              sanitized[field] = date.toISOString().split('T')[0]; // YYYY-MM-DD format
            } else {
              sanitized[field] = null;
            }
          } catch (error) {
            sanitized[field] = null;
          }
        }
        console.log(`📅 Date field '${field}': '${originalValue}' -> '${sanitized[field]}'`);
      }
    });

    // Handle string fields that should be null when empty
    const stringFields = [
      'email', 'customer_email',
      'phone', 'customer_phone',
      'nationality', 'customer_nationality',
      'licence_number', 'customer_licence_number',
      'id_number', 'customer_id_number',
      'place_of_birth', 'customer_place_of_birth'
    ];
    
    stringFields.forEach(field => {
      if (field in sanitized && (!sanitized[field] || (typeof sanitized[field] === 'string' && sanitized[field].trim() === ''))) {
        const originalValue = sanitized[field];
        sanitized[field] = null;
        console.log(`📧 String field '${field}': '${originalValue}' -> null`);
      }
    });

    console.log('✅ Customer data sanitization completed:', sanitized);
    return sanitized;
  }

  /**
   * Get customer by ID
   */
  static async getCustomerById(customerId) {
    console.log('🔍 Fetching customer by ID:', customerId);
    
    try {
      const organizationId = await getCurrentOrganizationId();
      const buildQuery = () => supabase
          .from(CUSTOMER_TABLE)
          .select('*')
          .eq('id', customerId)
          .maybeSingle();

      const { data, error } = await runCustomerReadQuery(buildQuery, organizationId);
      
      if (error) {
        console.error('❌ Error fetching customer:', error);
        throw new Error(`Failed to fetch customer: ${error.message}`);
      }

      if (!data) {
        console.warn('⚠️ Customer not found for ID:', customerId);
        return { success: false, error: 'Customer not found' };
      }

      await verifyTenantOwnedRows(data, CUSTOMER_TABLE, {
        organizationId,
        message: 'Customer lookup returned data outside the active workspace.',
      });
      
      console.log('✅ Fetched customer:', data);
      return { success: true, data };
      
    } catch (error) {
      console.error('❌ Error in getCustomerById:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all customers with filtering
   */
  static async getAllCustomers(filters = {}) {
    console.log('📋 Fetching all customers with filters:', filters);
    
    try {
      const organizationId = await getCurrentOrganizationId();
      const buildQuery = () => {
        let query = supabase
          .from(CUSTOMER_TABLE)
          .select('*')
          .order('created_at', { ascending: false });
      
        // Apply filters
        if (filters.search) {
          query = query.or(`full_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
        }
      
        if (filters.nationality) {
          query = query.eq('nationality', filters.nationality);
        }

        return query;
      };

      const { data, error } = await runCustomerReadQuery(buildQuery, organizationId);
      
      if (error) {
        console.error('❌ Error fetching customers:', error);
        throw new Error(`Failed to fetch customers: ${error.message}`);
      }

      await verifyTenantOwnedRows(data || [], CUSTOMER_TABLE, {
        organizationId,
        message: 'Customer list returned rows outside the active workspace.',
      });
      
      console.log('✅ Fetched customers:', data?.length || 0);
      return data || [];
      
    } catch (error) {
      console.error('❌ Error in getAllCustomers:', error);
      throw error;
    }
  }

  /**
   * Delete customer
   */
  static async deleteCustomer(customerId) {
    console.log('🗑️ Deleting customer:', customerId);
    
    try {
      const organizationId = await requireCurrentOrganizationId();
      let query = supabase
        .from(CUSTOMER_TABLE)
        .delete()
        .eq('id', customerId);

      if (organizationId && customerTableSupportsOrganizationColumn !== false) {
        query = query.eq('organization_id', organizationId);
      }

      let { error } = await query;

      if (organizationId && isMissingOrganizationColumnError(error)) {
        markCustomerTableWithoutOrganizationColumn();
        console.warn('Customer table has no organization_id column; retrying delete without organization filter.');
        ({ error } = await supabase
          .from(CUSTOMER_TABLE)
          .delete()
          .eq('id', customerId));
      }
      
      if (error) {
        console.error('❌ Error deleting customer:', error);
        throw new Error(`Failed to delete customer: ${error.message}`);
      }
      
      console.log('✅ Customer deleted successfully');
      return { success: true, message: 'Customer deleted successfully' };
      
    } catch (error) {
      console.error('❌ Error in deleteCustomer:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk delete customers by their IDs.
   */
  static async deleteCustomers(customerIds) {
    if (!customerIds || customerIds.length === 0) {
      return { success: true, message: 'No customers selected for deletion.' };
    }
    try {
      const organizationId = await requireCurrentOrganizationId();
      let query = supabase
        .from(CUSTOMER_TABLE)
        .delete()
        .in('id', customerIds);

      if (organizationId && customerTableSupportsOrganizationColumn !== false) {
        query = query.eq('organization_id', organizationId);
      }

      let { data, error } = await query;

      if (organizationId && isMissingOrganizationColumnError(error)) {
        markCustomerTableWithoutOrganizationColumn();
        console.warn('Customer table has no organization_id column; retrying bulk delete without organization filter.');
        ({ data, error } = await supabase
          .from(CUSTOMER_TABLE)
          .delete()
          .in('id', customerIds));
      }

      if (error) {
        console.error('Error during bulk customer deletion:', error);
        throw new Error(`Bulk deletion failed: ${error.message}`);
      }
      
      return { success: true, message: `${customerIds.length} customers deleted successfully.` };
    } catch (error) {
      console.error('Error in deleteCustomers:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search customers by various criteria
   */
  static async searchCustomers(searchTerm) {
    console.log('🔍 Searching customers with term:', searchTerm);
    
    try {
      const organizationId = await getCurrentOrganizationId();
      const buildQuery = () => supabase
          .from(CUSTOMER_TABLE)
          .select('*')
          .or(`full_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,licence_number.ilike.%${searchTerm}%,id_number.ilike.%${searchTerm}%`)
          .order('created_at', { ascending: false })
          .limit(20);

      const { data, error } = await runCustomerReadQuery(buildQuery, organizationId);
      
      if (error) {
        console.error('❌ Error searching customers:', error);
        throw new Error(`Failed to search customers: ${error.message}`);
      }

      await verifyTenantOwnedRows(data || [], CUSTOMER_TABLE, {
        organizationId,
        message: 'Customer search returned rows outside the active workspace.',
      });
      
      console.log('✅ Found customers:', data?.length || 0);
      return data || [];
      
    } catch (error) {
      console.error('❌ Error in searchCustomers:', error);
      throw error;
    }
  }

  /**
   * Get customer by licence number
   */
  static async getCustomerByLicenceNumber(licenceNumber) {
    console.log('🔍 Fetching customer by licence number:', licenceNumber);
    
    try {
      const organizationId = await getCurrentOrganizationId();
      const buildQuery = () => supabase
        .from(CUSTOMER_TABLE)
        .select('*')
        .eq('licence_number', licenceNumber)
        .single();

      const { data, error } = await runCustomerReadQuery(buildQuery, organizationId);
      
      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('❌ Error fetching customer by licence:', error);
        throw new Error(`Failed to fetch customer by licence: ${error.message}`);
      }

      await verifyTenantOwnedRows(data, CUSTOMER_TABLE, {
        organizationId,
        message: 'Customer lookup returned data outside the active workspace.',
      });
      
      console.log('✅ Found customer by licence:', data);
      return data;
      
    } catch (error) {
      console.error('❌ Error in getCustomerByLicenceNumber:', error);
      throw error;
    }
  }

  /**
   * Get customer by ID number
   */
  static async getCustomerByIdNumber(idNumber) {
    console.log('🔍 Fetching customer by ID number:', idNumber);
    
    try {
      const organizationId = await getCurrentOrganizationId();
      const buildQuery = () => supabase
        .from(CUSTOMER_TABLE)
        .select('*')
        .eq('id_number', idNumber)
        .single();

      const { data, error } = await runCustomerReadQuery(buildQuery, organizationId);
      
      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('❌ Error fetching customer by ID number:', error);
        throw new Error(`Failed to fetch customer by ID number: ${error.message}`);
      }

      await verifyTenantOwnedRows(data, CUSTOMER_TABLE, {
        organizationId,
        message: 'Customer lookup returned data outside the active workspace.',
      });
      
      console.log('✅ Found customer by ID number:', data);
      return data;
      
    } catch (error) {
      console.error('❌ Error in getCustomerByIdNumber:', error);
      throw error;
    }
  }

  /**
   * CRITICAL DEBUG: Get specific customer for debugging
   */
  static async debugCustomerRecord(customerId) {
    console.log('🔍 DEBUG: Fetching customer record for debugging:', customerId);
    
    try {
      const organizationId = await getCurrentOrganizationId();
      const buildQuery = () => supabase
        .from(CUSTOMER_TABLE)
        .select('*')
        .eq('id', customerId)
        .single();

      const { data, error } = await runCustomerReadQuery(buildQuery, organizationId);
      
      if (error) {
        console.error('❌ DEBUG: Error fetching customer:', error);
        return { success: false, error: error.message };
      }

      await verifyTenantOwnedRows(data, CUSTOMER_TABLE, {
        organizationId,
        message: 'Customer debug lookup returned data outside the active workspace.',
      });
      
      console.log('🔍 DEBUG: Customer record details:');
      console.log('  - ID:', data.id);
      console.log('  - Full Name:', data.full_name);
      console.log('  - Phone:', data.phone);
      console.log('  - Email:', data.email);
      console.log('  - ID Number:', data.id_number);
      console.log('  - License Number:', data.licence_number);
      console.log('  - ID Scan URL:', data.id_scan_url);
      console.log('  - Created:', data.created_at);
      console.log('  - Updated:', data.updated_at);
      console.log('🔍 DEBUG: Complete record:', JSON.stringify(data, null, 2));
      
      return { success: true, data };
      
    } catch (error) {
      console.error('❌ DEBUG: Error in debugCustomerRecord:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run diagnostics on customer service
   */
  static async runDiagnostics() {
    console.log('🔧 Running customer service diagnostics...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      tests: {}
    };
    
    try {
      // Test 1: Database Connection
      console.log('🔧 Testing customer database connection...');
      const { data: connectionTest, error: connectionError } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('count', { count: 'exact', head: true });
      
      if (connectionError) {
        diagnostics.tests.databaseConnection = {
          status: 'FAIL',
          error: connectionError.message
        };
      } else {
        diagnostics.tests.databaseConnection = {
          status: 'PASS',
          message: 'Customer database connection successful'
        };
      }
      
      // Test 2: Table Access
      console.log('🔧 Testing customer table access...');
      const { data: tableTest, error: tableError } = await supabase
        .from('app_4c3a7a6153_customers')
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
          message: 'Customer table access successful'
        };
      }
      
      // Test 3: Count customers
      console.log('🔧 Counting customers...');
      const { count, error: countError } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        diagnostics.tests.customerCount = {
          status: 'FAIL',
          error: countError.message
        };
      } else {
        diagnostics.tests.customerCount = {
          status: 'PASS',
          message: `Found ${count} customers in database`
        };
      }

      // Test 4: Test id_scan_url field presence
      console.log('🔧 Testing id_scan_url field presence...');
      try {
        const { data: sampleCustomer, error: sampleError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('id, id_scan_url, phone')
          .limit(1)
          .single();
        
        if (sampleError && sampleError.code !== 'PGRST116') {
          diagnostics.tests.idScanUrlField = {
            status: 'FAIL',
            error: sampleError.message
          };
        } else {
          diagnostics.tests.idScanUrlField = {
            status: 'PASS',
            message: 'id_scan_url and phone fields accessible in customer table',
            sampleData: sampleCustomer
          };
        }
      } catch (error) {
        diagnostics.tests.idScanUrlField = {
          status: 'FAIL',
          error: error.message
        };
      }

      // Test 5: Test processSequentialImageUpload function availability
      console.log('🔧 Testing processSequentialImageUpload function availability...');
      try {
        const functionExists = typeof this.processSequentialImageUpload === 'function';
        
        diagnostics.tests.processSequentialImageUploadFunction = {
          status: functionExists ? 'PASS' : 'FAIL',
          message: functionExists ? 'processSequentialImageUpload function is available with form auto-population support' : 'processSequentialImageUpload function is missing',
          functionExists: functionExists
        };
      } catch (error) {
        diagnostics.tests.processSequentialImageUploadFunction = {
          status: 'FAIL',
          error: error.message
        };
      }
      
      console.log('✅ Customer service diagnostics completed:', diagnostics);
      return diagnostics;
      
    } catch (error) {
      console.error('❌ Customer service diagnostics failed:', error);
      diagnostics.tests.generalError = {
        status: 'FAIL',
        error: error.message
      };
      return diagnostics;
    }
  }

  /**
   * Check if a customer has any rental history.
   */
  static async checkCustomerRentalHistory(customerId) {
    if (!customerId) {
      return { success: false, error: 'Customer ID is required.', hasHistory: false };
    }
    try {
      const organizationId = await getCurrentOrganizationId();
      let query = supabase
        .from('app_4c3a7a6153_rentals')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customerId);
      query = await scopeTenantOwnedQuery(query, 'app_4c3a7a6153_rentals', {
        organizationId,
        message: 'Workspace organization context is required to load customer rental history.',
      });
      const { count, error } = await query;

      if (error) {
        console.error('Error checking rental history:', error);
        throw new Error(`Failed to check rental history: ${error.message}`);
      }
      
      return { success: true, hasHistory: count > 0 };
    } catch (error) {
      console.error('Error in checkCustomerRentalHistory:', error);
      return { success: false, error: error.message, hasHistory: false };
    }
  }

  /**
   * Fetch rental history for a specific customer.
   */
  static async getCustomerRentalHistory(customerId) {
    try {
      const organizationId = await getCurrentOrganizationId();
      // 1. Fetch rentals with a 'soft' join
      const { data, error } = await applyOrganizationScope(
        supabase
          .from(`app_4c3a7a6153_rentals`)
          .select(`
            *,
            vehicle:saharax_0u4w4d_vehicles(name, plate_number)
          `)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false }),
        organizationId
      );

      if (error) throw error;
      await verifyTenantOwnedRows(data || [], 'app_4c3a7a6153_rentals', {
        organizationId,
        message: 'Customer rental history returned rows outside the active workspace.',
      });

      // 2. Data Normalization (The Safety Net)
      const safeData = data.map(rental => {
        return {
          ...rental,
          // If vehicle join fails, use the text already saved in the rental row
          display_name: rental.vehicle?.name || rental.vehicle_plate_number || `Vehicle #${rental.vehicle_id}`,
          // Map the correct money column (total_amount) to a standard property
          display_amount: rental.total_amount || rental.subtotal_mad || 0,
          // Ensure status is readable
          display_status: rental.rental_status || rental.status || 'pending'
        };
      });

      return { success: true, data: safeData };
    } catch (err) {
      console.error('Rental History Error:', err);
      return { success: false, error: err.message };
    }
  }

  static async getLatestRentalByCustomerId(customerId) {
    if (!customerId) return null;

    const organizationId = await getCurrentOrganizationId();
    const { data, error } = await applyOrganizationScope(
      supabase
        .from('app_4c3a7a6153_rentals')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      organizationId
    );

    if (error) {
      throw new Error(`Failed to fetch customer rental context: ${error.message}`);
    }

    await verifyTenantOwnedRows(data || null, 'app_4c3a7a6153_rentals', {
      organizationId,
      message: 'Customer rental context returned data outside the active workspace.',
    });

    return data || null;
  }

  static async findMatchingCustomers(criteria = {}) {
    const organizationId = await getCurrentOrganizationId();
    const fullName = String(criteria.full_name || criteria.fullName || '').trim();
    const phone = String(criteria.phone || '').trim();
    const email = String(criteria.email || '').trim();
    const normalizedIdentity = normalizeCustomerIdentityFields({
      licenceNumber: criteria.licence_number || criteria.licenceNumber,
      idNumber: criteria.id_number || criteria.idNumber,
    });

    const customerTable = CUSTOMER_TABLE;
    const identityCandidates = Array.from(
      new Set(
        [
          normalizedIdentity.idNumber,
          normalizedIdentity.licenceNumber,
        ].map((value) => String(value || '').trim()).filter(Boolean)
      )
    );

    const exactMatchGroups = await Promise.all([
      ...identityCandidates.map((identityValue) =>
        runCustomerLookupQuery(
          () => supabase.from(customerTable).select('*').eq('id_number', identityValue).limit(10),
          organizationId
        )
      ),
      ...identityCandidates.map((identityValue) =>
        runCustomerLookupQuery(
          () => supabase.from(customerTable).select('*').eq('licence_number', identityValue).limit(10),
          organizationId
        )
      ),
      phone
        ? runCustomerLookupQuery(
          () => supabase.from(customerTable).select('*').eq('phone', phone).limit(10),
          organizationId
        )
        : Promise.resolve([]),
      email
        ? runCustomerLookupQuery(
          () => supabase.from(customerTable).select('*').eq('email', email).limit(10),
          organizationId
        )
        : Promise.resolve([]),
    ]);

    const exactMatches = mergeUniqueCustomersById(...exactMatchGroups);
    if (exactMatches.length > 0) {
      await verifyTenantOwnedRows(exactMatches, CUSTOMER_TABLE, {
        organizationId,
        message: 'Customer identity matching returned rows outside the active workspace.',
      });
      return exactMatches;
    }

    if (!fullName) return [];

    const { data, error } = await runCustomerReadQuery(
      () => supabase
        .from(customerTable)
        .select('*')
        .ilike('full_name', fullName)
        .limit(5),
      organizationId
    );

    if (error) throw error;
    await verifyTenantOwnedRows(data || [], CUSTOMER_TABLE, {
      organizationId,
      message: 'Customer identity matching returned rows outside the active workspace.',
    });
    return data || [];
  }

  static async updateCustomerById(customerId, updates = {}, select = '*') {
    const organizationId = await requireCurrentOrganizationId();
    const scopedPayload = customerTableSupportsOrganizationColumn !== false
      ? {
          ...applyOrganizationMatch({}, organizationId),
          ...updates,
        }
      : stripOrganizationField(updates);

    let query = supabase
      .from(CUSTOMER_TABLE)
      .update(scopedPayload)
      .eq('id', customerId);

    if (organizationId && customerTableSupportsOrganizationColumn !== false) {
      query = query.eq('organization_id', organizationId);
    }

    query = query.select(select).maybeSingle();

    let { data, error } = await query;

    if (organizationId && isMissingOrganizationColumnError(error)) {
      markCustomerTableWithoutOrganizationColumn();
      console.warn('Customer table has no organization_id column; retrying update without organization filter.');
      ({ data, error } = await supabase
        .from(CUSTOMER_TABLE)
        .update(stripOrganizationField(updates))
        .eq('id', customerId)
        .select(select)
        .maybeSingle());
    }

    if (error) {
      throw new Error(`Failed to update customer: ${error.message}`);
    }

    return data || null;
  }


  /**
   * 🆕 SEPARATE PIPELINE: Process second driver ID (NO customer creation)
   * This is the public API method that modals should call
   */
  // Primary driver/customer OCR processing (saves to customers table)

  async processCustomerID(file, options = {}) {
    try {
      const scanId = `sd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const result = await this.processCustomerOCR(file, scanId, options);
      return result;
      
    } catch (error) {
      console.error('❌ [PRIMARY DRIVER API] Error:', error);
      return {
        success: false,
        error: error.message || 'Primary customer OCR processing failed',
        details: error
      };
    }
  }

  async processCustomerOCR(file, scanId = null, options = {}) {
    try {
      const result = await this.runSharedOcrPipeline(file, scanId, {
        folder: 'customers_ocr',
        successMessage: 'Primary customer OCR completed - NO customer record created',
        unavailableMessage: 'Primary customer image uploaded successfully. OCR unavailable, continue manually.',
        logPrefix: '[PRIMARY DRIVER OCR]',
        ocrMode: options.ocrMode || 'fast',
      });
      
      return result;

    } catch (error) {
      console.error('❌ [PRIMARY DRIVER OCR] Error:', error);
      return {
        success: false,
        error: error.message || 'Primary customer OCR processing failed',
        details: error
      };
    }
  }
  async processSecondDriverID(file, options = {}) {
    try {
      const scanId = `sd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const result = await this.processSecondDriverOCR(file, scanId, options);
      return result;
      
    } catch (error) {
      console.error('❌ [SECOND DRIVER API] Error:', error);
      return {
        success: false,
        error: error.message || 'Second driver OCR processing failed',
        details: error
      };
    }
  }

  /**
   * 🆕 SEPARATE PIPELINE: Core OCR processing for second drivers
   * This method NEVER touches the customers table
   */
  async processSecondDriverOCR(file, scanId = null, options = {}) {
    try {
      const result = await this.runSharedOcrPipeline(file, scanId, {
        folder: 'second_drivers_ocr',
        successMessage: 'Second driver OCR completed - NO customer record created',
        unavailableMessage: 'Second driver image uploaded successfully. OCR unavailable, continue manually.',
        logPrefix: '[SECOND DRIVER OCR]',
        includePublicUrl: true,
        ocrMode: options.ocrMode || 'fast',
      });
      
      return result;

    } catch (error) {
      console.error('❌ [SECOND DRIVER OCR] Error:', error);
      return {
        success: false,
        error: error.message || 'Second driver OCR processing failed',
        details: error
      };
    }
  }

}



  /**
   * 🎯 SECOND DRIVER OCR PIPELINE - COMPLETELY SEPARATE FROM CUSTOMERS
   * This method ONLY does OCR, NEVER creates customers
   * Used exclusively for second drivers
   */
  // Export singleton instance (not the class)
const enhancedUnifiedCustomerServiceInstance = new EnhancedUnifiedCustomerService();
Object.assign(enhancedUnifiedCustomerServiceInstance, {
  saveCustomer: (...args) => EnhancedUnifiedCustomerService.saveCustomer(...args),
  processSequentialImageUpload: (...args) => EnhancedUnifiedCustomerService.processSequentialImageUpload(...args),
  getCustomerById: (...args) => EnhancedUnifiedCustomerService.getCustomerById(...args),
  getAllCustomers: (...args) => EnhancedUnifiedCustomerService.getAllCustomers(...args),
  deleteCustomer: (...args) => EnhancedUnifiedCustomerService.deleteCustomer(...args),
  deleteCustomers: (...args) => EnhancedUnifiedCustomerService.deleteCustomers(...args),
  searchCustomers: (...args) => EnhancedUnifiedCustomerService.searchCustomers(...args),
  getCustomerByLicenceNumber: (...args) => EnhancedUnifiedCustomerService.getCustomerByLicenceNumber(...args),
  getCustomerByIdNumber: (...args) => EnhancedUnifiedCustomerService.getCustomerByIdNumber(...args),
  checkCustomerRentalHistory: (...args) => EnhancedUnifiedCustomerService.checkCustomerRentalHistory(...args),
  getCustomerRentalHistory: (...args) => EnhancedUnifiedCustomerService.getCustomerRentalHistory(...args),
  getLatestRentalByCustomerId: (...args) => EnhancedUnifiedCustomerService.getLatestRentalByCustomerId(...args),
  findMatchingCustomers: (...args) => EnhancedUnifiedCustomerService.findMatchingCustomers(...args),
  updateCustomerById: (...args) => EnhancedUnifiedCustomerService.updateCustomerById(...args),
});
export default enhancedUnifiedCustomerServiceInstance;

export const saveCustomer = (...args) => EnhancedUnifiedCustomerService.saveCustomer(...args);
export const processSequentialImageUpload = (...args) => EnhancedUnifiedCustomerService.processSequentialImageUpload(...args);
export const getCustomerById = (...args) => EnhancedUnifiedCustomerService.getCustomerById(...args);
export const getAllCustomers = (...args) => EnhancedUnifiedCustomerService.getAllCustomers(...args);
export const deleteCustomer = (...args) => EnhancedUnifiedCustomerService.deleteCustomer(...args);
export const deleteCustomers = (...args) => EnhancedUnifiedCustomerService.deleteCustomers(...args);
export const searchCustomers = (...args) => EnhancedUnifiedCustomerService.searchCustomers(...args);
export const getCustomerByLicenceNumber = (...args) => EnhancedUnifiedCustomerService.getCustomerByLicenceNumber(...args);
export const getCustomerByIdNumber = (...args) => EnhancedUnifiedCustomerService.getCustomerByIdNumber(...args);
export const debugCustomerRecord = (...args) => EnhancedUnifiedCustomerService.debugCustomerRecord(...args);
export const runDiagnostics = (...args) => EnhancedUnifiedCustomerService.runDiagnostics(...args);
export const checkCustomerRentalHistory = (...args) => EnhancedUnifiedCustomerService.checkCustomerRentalHistory(...args);
export const getCustomerRentalHistory = (...args) => EnhancedUnifiedCustomerService.getCustomerRentalHistory(...args);
export const getLatestRentalByCustomerId = (...args) => EnhancedUnifiedCustomerService.getLatestRentalByCustomerId(...args);
export const findMatchingCustomers = (...args) => EnhancedUnifiedCustomerService.findMatchingCustomers(...args);
export const updateCustomerById = (...args) => EnhancedUnifiedCustomerService.updateCustomerById(...args);
