/**
 * Google Gemini Vision OCR Service with Advanced MGX Schema
 * Replaces GPT-4o completely with Google Gemini Vision API
 * Implements comprehensive document extraction with MRZ support
 * ENHANCED: Added comprehensive debugging and raw data logging
 * SECURITY FIX: API key now handled by backend proxy
 * TOKEN LIMIT FIX: Increased maxOutputTokens and optimized prompt to prevent truncation
 * PROXY FIX: All API calls now go through /api/gemini-proxy
 * REQUEST FORMAT FIX: Added detailed request payload logging
 */

import { supabase } from '../../lib/supabase.js';
import { buildApiUrl, GEMINI_PROXY_PATH } from '../apiUrl.js';
import unifiedCustomerService from '../UnifiedCustomerService';

const GEMINI_PROXY_URL = buildApiUrl(GEMINI_PROXY_PATH);

class GeminiVisionOCR {
  constructor() {
    // API key is now handled by backend proxy
  }

  /**
   * List available models to find the correct one for vision processing
   */
  async listAvailableModels() {
    try {
      console.log('🔍 Listing available Google Gemini models via proxy...');
      
      const requestPayload = {
        action: 'listModels'
      };
      
      console.log('📤 Calling Gemini proxy with:', {
        endpoint: GEMINI_PROXY_URL,
        method: 'POST',
        payload: requestPayload,
        payloadStringified: JSON.stringify(requestPayload)
      });
      
      const response = await fetch(GEMINI_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ListModels API Error:', errorText);
        throw new Error(`ListModels API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Available models:', JSON.stringify(result, null, 2));
      
      const visionModels = result.models?.filter(model => 
        model.supportedGenerationMethods?.includes('generateContent') && (model.name.includes('gemini') || model.name.includes('vision'))
      ) || [];
      
      console.log('Vision-capable models:', visionModels.map(m => m.name));
      
      return visionModels;
      
    } catch (error) {
      console.error('Error listing models:', error);
      throw error;
    }
  }

  /**
   * Process ID document using Google Gemini Vision API with MGX Schema
   */
  async processIdDocument(imageFile, customerId = null) {
    try {
      console.log('🔍 Starting Google Gemini Vision OCR processing...');
      console.log('📋 Input parameters:', { 
        imageFileName: imageFile?.name, 
        imageSize: imageFile?.size, 
        customerId 
      });
      
      const { base64Image, mimeType } = await this.convertToBase64(imageFile);
      
      console.log('🤖 Calling Gemini Vision API for data extraction...');
      const extractedData = await this.callGeminiVisionAPI(base64Image, mimeType);
      
      console.log('🔍 === RAW EXTRACTED DATA FROM GEMINI VISION ===');
      console.log('📊 Complete extracted object:', JSON.stringify(extractedData, null, 2));
      console.log('📊 Extracted data keys:', Object.keys(extractedData));
      console.log('📊 Non-null fields:', Object.entries(extractedData).filter(([key, value]) => value !== null && value !== ''));
      console.log('===============================================');
      
      let imageUrl = null;
      if (customerId) {
        console.log('📤 Uploading image to Supabase Storage...');
        imageUrl = await this.uploadImage(imageFile, customerId);
        console.log('✅ Image uploaded to:', imageUrl);
      }
      
      if (customerId) {
        console.log('💾 Saving extracted data to database...');
        console.log('💾 Data being saved:', extractedData);
        
        const saveResult = await unifiedCustomerService.processOCRData(extractedData, customerId);
        
        console.log('💾 Save result:', saveResult);
        
        if (!saveResult.success) {
          console.error('❌ Database save failed:', saveResult.error);
          throw new Error(saveResult.error);
        } else {
          console.log('✅ Data saved successfully to customer ID:', saveResult.customerId);
          
          console.log('🔍 Verifying saved data by fetching from database...');
          const verifyResult = await unifiedCustomerService.getCustomer(saveResult.customerId);
          
          if (verifyResult.success) {
            console.log('✅ VERIFIED SAVED CUSTOMER DATA:', JSON.stringify(verifyResult.data, null, 2));
          } else {
            console.warn('⚠️ Could not verify saved data:', verifyResult.error);
          }
        }
      }
      
      console.log('✅ Google Gemini Vision OCR completed successfully');
      
      return {
        success: true,
        data: extractedData,
        customerId: customerId,
        imageUrl: imageUrl,
        message: 'Successfully populated customer data from scanned ID.',
        debug: {
          extractedFields: Object.keys(extractedData),
          nonNullFields: Object.entries(extractedData).filter(([key, value]) => value !== null && value !== '').map(([key]) => key),
          totalFields: Object.keys(extractedData).length,
          populatedFields: Object.entries(extractedData).filter(([key, value]) => value !== null && value !== '').length
        }
      };
      
    } catch (error) {
      console.error('❌ Google Gemini Vision OCR error:', error);
      
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      if (error.message.includes('404') && error.message.includes('not found')) {
        console.log('🔄 Model not found, attempting to list available models...');
        try {
          const availableModels = await this.listAvailableModels();
          if (availableModels.length > 0) {
            const suggestedModel = availableModels[0];
            console.log(`💡 Suggested model: ${suggestedModel.name}`);
            return {
              success: false,
              error: `Model not found. Available models: ${availableModels.map(m => m.name).join(', ')}. Please update the model name in the code.`,
              data: null,
              suggestedModels: availableModels
            };
          }
        } catch (listError) {
          console.error('Failed to list models:', listError);
        }
      }
      
      return {
        success: false,
        error: error.message || 'Failed to process ID document',
        data: null
      };
    }
  }

  /**
   * Convert image file to base64 with proper MIME type detection
   */
  async convertToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        
        let mimeType = file.type;
        if (!mimeType || mimeType === '') {
          const fileName = file.name.toLowerCase();
          if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
            mimeType = 'image/jpeg';
          } else if (fileName.endsWith('.png')) {
            mimeType = 'image/png';
          } else if (fileName.endsWith('.webp')) {
            mimeType = 'image/webp';
          } else {
            mimeType = 'image/jpeg';
          }
        }
        
        console.log(`📷 Image converted: ${file.name}, MIME: ${mimeType}, Size: ${base64.length} chars`);
        resolve({ base64Image: base64, mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * TOKEN LIMIT FIX: Call Google Gemini Vision API with optimized prompt and increased token limit
   * PROXY FIX: Now uses /api/gemini-proxy endpoint
   * REQUEST FORMAT FIX: Added detailed request payload logging
   */
  async callGeminiVisionAPI(base64Image, mimeType) {
    // OPTIMIZED PROMPT: More concise, direct instructions to reduce thinking tokens
    const mgxPrompt = `Extract identity document data. Output ONLY the JSON object below with extracted values. Use null for missing fields. No preamble, no explanation, just JSON.

{"document_type":null,"country":null,"full_name":null,"raw_name":null,"given_name":null,"family_name":null,"first_name":null,"last_name":null,"middle_name":null,"document_number":null,"nationality":null,"date_of_birth":null,"gender":null,"expiry_date":null,"issue_date":null,"place_of_birth":null,"issuing_authority":null,"mrz":null,"confidence_estimate":null,"email":null,"phone":null,"address":null,"city":null,"postal_code":null}

Rules: Dates as YYYY-MM-DD. Confidence 0.0-1.0. Prefer Latin text in full_name, original in raw_name.`;

    const requestBody = {
      action: 'generateContent',
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: mgxPrompt }, { inlineData: { mimeType: mimeType, data: base64Image } }] }],
      generationConfig: { 
        temperature: 0.1, 
        topK: 1, 
        topP: 1, 
        maxOutputTokens: 8192  // TOKEN LIMIT FIX: Increased from 4096 to 8192
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };

    console.log('=== GEMINI API REQUEST ===');
    console.log('Using proxy endpoint:', GEMINI_PROXY_URL);
    console.log('MIME Type:', mimeType);
    console.log('Prompt Length:', mgxPrompt.length);
    console.log('Image Data Length:', base64Image.length);
    console.log('Max Output Tokens:', requestBody.generationConfig.maxOutputTokens);
    console.log('========================');
    
    console.log('📤 Calling Gemini proxy with:', {
      endpoint: '/api/gemini-proxy',
      resolvedEndpoint: GEMINI_PROXY_URL,
      method: 'POST',
      action: requestBody.action,
      model: requestBody.model,
      contentsLength: requestBody.contents.length,
      contentsStructure: requestBody.contents.map(c => ({
        partsCount: c.parts.length,
        partTypes: c.parts.map(p => Object.keys(p))
      })),
      hasGenerationConfig: !!requestBody.generationConfig,
      generationConfig: requestBody.generationConfig,
      hasSafetySettings: !!requestBody.safetySettings,
      safetySettingsCount: requestBody.safetySettings?.length,
      fullPayloadKeys: Object.keys(requestBody),
      requestBodySample: {
        action: requestBody.action,
        model: requestBody.model,
        contentsPreview: 'Contents with text prompt and base64 image data',
        generationConfig: requestBody.generationConfig
      }
    });
    
    try {
      const response = await fetch(GEMINI_PROXY_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const rawResponseText = await response.text();
      
      console.log('=== RAW GEMINI API RESPONSE ===');
      console.log('Status:', response.status);
      console.log('Status Text:', response.statusText);
      console.log('Headers:', Object.fromEntries(response.headers.entries()));
      console.log('Content-Type:', response.headers.get('content-type'));
      console.log('Raw Response Text:', rawResponseText);
      console.log('================================');

      if (!rawResponseText || rawResponseText.trim() === '') throw new Error('Empty response from Gemini API');
      if (rawResponseText.trim().startsWith('<')) throw new Error('Received HTML error page instead of JSON response');
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText} - ${rawResponseText}`);

      let responseData;
      try {
        responseData = JSON.parse(rawResponseText);
      } catch (parseError) {
        throw new Error(`Invalid JSON response from Gemini API: ${parseError.message}`);
      }

      if (responseData.error) throw new Error(`Gemini API Error: ${responseData.error.message || 'Unknown API error'}`);
      if (responseData.promptFeedback?.blockReason) throw new Error(`Content blocked by safety filters: ${responseData.promptFeedback.blockReason}`);
      if (!responseData.candidates || responseData.candidates.length === 0) throw new Error('No candidates returned from Google Gemini Vision API');

      const candidate = responseData.candidates[0];
      
      // TOKEN LIMIT FIX: Check for truncation and warn user
      if (candidate.finishReason === 'MAX_TOKENS') {
        console.warn('⚠️ TOKEN LIMIT WARNING: Response was truncated due to MAX_TOKENS limit');
        console.warn('⚠️ This may result in incomplete JSON. Attempting to parse anyway...');
      }
      
      let content = candidate.content?.parts?.[0]?.text;
      if (!content) throw new Error('No content received from Google Gemini Vision API');

      console.log('📝 Raw Gemini content response:', content);

      try {
        // TOKEN LIMIT FIX: Enhanced JSON extraction with fallback for truncated responses
        let jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
          // FALLBACK: Try to find incomplete JSON and attempt to close it
          const incompleteMatch = content.match(/\{[\s\S]*/);
          if (incompleteMatch) {
            console.warn('⚠️ TRUNCATION DETECTED: Attempting to repair incomplete JSON...');
            let incompleteJson = incompleteMatch[0];
            
            // Count open braces and try to close them
            const openBraces = (incompleteJson.match(/\{/g) || []).length;
            const closeBraces = (incompleteJson.match(/\}/g) || []).length;
            const missingBraces = openBraces - closeBraces;
            
            if (missingBraces > 0) {
              // Remove trailing comma if present
              incompleteJson = incompleteJson.replace(/,\s*$/, '');
              // Add missing closing braces
              incompleteJson += '}'.repeat(missingBraces);
              console.log('🔧 Repaired JSON:', incompleteJson);
              jsonMatch = [incompleteJson];
            }
          }
          
          if (!jsonMatch) {
            throw new Error('No JSON found in Gemini response content. Response may be truncated or invalid.');
          }
        }
        
        const extractedData = JSON.parse(jsonMatch[0]);
        const cleanedData = this.cleanAndValidateExtractedData(extractedData);
        
        console.log('✅ Successfully processed and cleaned extracted data:', cleanedData);
        
        // TOKEN LIMIT FIX: Warn if data seems incomplete
        const nonNullFields = Object.values(cleanedData).filter(v => v !== null && v !== '').length;
        if (nonNullFields < 3) {
          console.warn('⚠️ WARNING: Very few fields extracted. This may indicate truncation or poor image quality.');
        }
        
        return cleanedData;
        
      } catch (contentParseError) {
        console.error('❌ JSON Parse Error:', contentParseError.message);
        console.error('❌ Problematic content:', content);
        throw new Error(`Invalid JSON in response content: ${contentParseError.message}. This may be due to response truncation. Try using a clearer image or contact support.`);
      }

    } catch (fetchError) {
      console.error('❌ Fetch Error:', fetchError);
      throw fetchError;
    }
  }

  /**
   * Clean and validate extracted data
   */
  cleanAndValidateExtractedData(rawData) {
    const cleaned = { ...rawData };
    
    if (!cleaned.full_name) {
      const nameParts = [cleaned.first_name, cleaned.middle_name, cleaned.last_name].filter(Boolean);
      if (nameParts.length > 0) {
        cleaned.full_name = nameParts.join(' ');
      } else if (cleaned.given_name || cleaned.family_name) {
        cleaned.full_name = [cleaned.given_name, cleaned.family_name].filter(Boolean).join(' ');
      } else if (cleaned.raw_name) {
        cleaned.full_name = cleaned.raw_name;
      }
    }
    
    ['date_of_birth', 'issue_date', 'expiry_date'].forEach(field => {
      if (cleaned[field] && !this.isValidDate(cleaned[field])) {
        cleaned[field] = null;
      }
    });
    
    return cleaned;
  }

  /**
   * Upload image to Supabase Storage
   */
  async uploadImage(imageFile, customerId) {
    try {
      const fileName = `idscan_${Date.now()}.jpg`;
      const filePath = `${customerId}/${fileName}`;

      const { error } = await supabase.storage
        .from('id_scans')
        .upload(filePath, imageFile, { cacheControl: '3600', upsert: true });

      if (error) throw new Error(`Failed to upload image: ${error.message}`);

      const { data: urlData } = supabase.storage.from('id_scans').getPublicUrl(filePath);
      return urlData.publicUrl;
      
    } catch (error) {
      console.error('Image upload error:', error);
      throw error;
    }
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  isValidDate(dateString) {
    if (!dateString) return true;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;
    const date = new Date(dateString);
    return !isNaN(date) && date.toISOString().slice(0, 10) === dateString;
  }
}

// Export singleton instance
export const geminiVisionOCR = new GeminiVisionOCR();
export default geminiVisionOCR;
