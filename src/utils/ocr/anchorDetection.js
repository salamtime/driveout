/**
 * Anchor-based zoning system for Morocco driving license OCR
 * Fixed to handle undefined OCR data and prevent errors
 */

import workerPool from '../../services/ocr/workerPool.js';

/**
 * Detect text anchors in the document
 * @param {File} imageFile - Input image file
 * @param {Object} template - Document template configuration
 * @returns {Promise<Object>} - Detected anchors with bounding boxes
 */
export const detectAnchors = async (imageFile, template) => {
  console.log('🎯 Starting anchor detection...');
  
  try {
    // Create a downscaled version for fast anchor detection
    const downscaledImage = await createDownscaledImage(imageFile, 0.5);
    
    // Get a worker for OCR
    const workerData = await workerPool.getWorker();
    
    try {
      // Run OCR on downscaled image to find anchors (without progress callback)
      console.log('🔍 Running OCR for anchor detection...');
      const result = await workerData.worker.recognize(downscaledImage);
      
      const { data } = result;
      console.log('📄 Anchor detection OCR completed');
      
      // Parse anchors from OCR data with proper error handling
      const anchors = parseAnchorsFromOCR(data, template);
      
      console.log('🎯 Detected anchors:', Object.keys(anchors));
      return anchors;
      
    } finally {
      // Always release the worker
      workerPool.releaseWorker(workerData);
    }
    
  } catch (error) {
    console.error('❌ Anchor detection failed:', error);
    return {};
  }
};

/**
 * Create a downscaled version of the image for faster processing
 * @param {File} imageFile - Input image file
 * @param {number} scale - Scale factor (0.5 = 50% size)
 * @returns {Promise<File>} - Downscaled image file
 */
const createDownscaledImage = async (imageFile, scale = 0.5) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      try {
        const newWidth = Math.floor(img.width * scale);
        const newHeight = Math.floor(img.height * scale);
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Use high-quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        canvas.toBlob((blob) => {
          const scaledFile = new File([blob], 'downscaled_' + imageFile.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(scaledFile);
        }, 'image/jpeg', 0.8);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image for downscaling'));
    img.src = URL.createObjectURL(imageFile);
  });
};

/**
 * Parse anchors from OCR data with proper error handling
 * @param {Object} ocrData - Tesseract OCR result data
 * @param {Object} template - Document template configuration
 * @returns {Object} - Detected anchors with positions
 */
const parseAnchorsFromOCR = (ocrData, template) => {
  const anchors = {};
  
  console.log('🔍 Parsing anchors from OCR data...');
  
  // Add comprehensive null/undefined checks
  if (!ocrData) {
    console.warn('⚠️ OCR data is null or undefined');
    return anchors;
  }
  
  if (!template || !template.anchors) {
    console.warn('⚠️ Template or anchors configuration missing');
    return anchors;
  }
  
  // Extract words and lines with fallback
  const words = ocrData.words || [];
  const lines = ocrData.lines || [];
  
  // Ensure they are arrays
  if (!Array.isArray(words)) {
    console.warn('⚠️ OCR words is not an array:', typeof words);
    return anchors;
  }
  
  if (!Array.isArray(lines)) {
    console.warn('⚠️ OCR lines is not an array:', typeof lines);
    return anchors;
  }
  
  console.log(`📊 Found ${words.length} words and ${lines.length} lines`);
  
  // If no words or lines found, return empty anchors
  if (words.length === 0 && lines.length === 0) {
    console.warn('⚠️ No words or lines found in OCR data');
    return anchors;
  }
  
  // Iterate through template anchors
  Object.entries(template.anchors).forEach(([anchorKey, anchorConfig]) => {
    if (!anchorConfig || !anchorConfig.keywords) {
      console.warn(`⚠️ Invalid anchor config for ${anchorKey}`);
      return;
    }
    
    const { keywords } = anchorConfig;
    
    if (!Array.isArray(keywords)) {
      console.warn(`⚠️ Keywords for ${anchorKey} is not an array`);
      return;
    }
    
    // Search for anchor keywords in OCR words
    for (const word of words) {
      if (!word || typeof word.confidence !== 'number' || word.confidence < 60) {
        continue; // Skip invalid or low-confidence words
      }
      
      const wordText = (word.text || '').trim();
      if (!wordText) continue;
      
      // Check if word matches any of the anchor keywords
      const matchedKeyword = keywords.find(keyword => {
        if (!keyword) return false;
        return wordText.includes(keyword) || 
               keyword.includes(wordText) ||
               fuzzyMatch(wordText, keyword, 0.8);
      });
      
      if (matchedKeyword) {
        console.log(`🎯 Found anchor "${anchorKey}": "${wordText}" (keyword: "${matchedKeyword}")`);
        
        // Ensure bbox exists and has required properties
        const bbox = word.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
        
        anchors[anchorKey] = {
          text: wordText,
          keyword: matchedKeyword,
          bbox: bbox,
          confidence: word.confidence,
          position: {
            x: bbox.x0 || 0,
            y: bbox.y0 || 0,
            width: (bbox.x1 || 0) - (bbox.x0 || 0),
            height: (bbox.y1 || 0) - (bbox.y0 || 0)
          }
        };
        break; // Found this anchor, move to next
      }
    }
    
    // If not found in words, try to find in lines (for multi-word anchors)
    if (!anchors[anchorKey]) {
      for (const line of lines) {
        if (!line || typeof line.confidence !== 'number' || line.confidence < 50) {
          continue;
        }
        
        const lineText = (line.text || '').trim();
        if (!lineText) continue;
        
        const matchedKeyword = keywords.find(keyword => {
          if (!keyword) return false;
          return lineText.includes(keyword) || 
                 fuzzyMatch(lineText, keyword, 0.7);
        });
        
        if (matchedKeyword) {
          console.log(`🎯 Found anchor "${anchorKey}" in line: "${lineText}" (keyword: "${matchedKeyword}")`);
          
          // Ensure bbox exists and has required properties
          const bbox = line.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
          
          anchors[anchorKey] = {
            text: lineText,
            keyword: matchedKeyword,
            bbox: bbox,
            confidence: line.confidence,
            position: {
              x: bbox.x0 || 0,
              y: bbox.y0 || 0,
              width: (bbox.x1 || 0) - (bbox.x0 || 0),
              height: (bbox.y1 || 0) - (bbox.y0 || 0)
            }
          };
          break;
        }
      }
    }
  });
  
  return anchors;
};

/**
 * Fuzzy string matching for anchor detection
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {boolean} - Whether strings match within threshold
 */
const fuzzyMatch = (str1, str2, threshold = 0.8) => {
  if (!str1 || !str2) return false;
  
  const s1 = str1.toLowerCase().replace(/[^\w]/g, '');
  const s2 = str2.toLowerCase().replace(/[^\w]/g, '');
  
  if (s1 === s2) return true;
  
  // Calculate Levenshtein distance
  const matrix = [];
  const len1 = s1.length;
  const len2 = s2.length;
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  const similarity = 1 - (distance / maxLen);
  
  return similarity >= threshold;
};

/**
 * Generate ROIs (Regions of Interest) based on detected anchors
 * @param {Object} anchors - Detected anchors
 * @param {Object} template - Document template configuration
 * @param {number} imageWidth - Original image width
 * @param {number} imageHeight - Original image height
 * @param {number} scaleFactor - Scale factor used for anchor detection
 * @returns {Object} - ROIs for each field
 */
export const generateROIs = (anchors, template, imageWidth, imageHeight, scaleFactor = 0.5) => {
  console.log('📐 Generating ROIs from anchors...');
  
  const rois = {};
  
  if (!template || !template.fields) {
    console.warn('⚠️ Template or fields missing for ROI generation');
    return rois;
  }
  
  Object.entries(template.fields).forEach(([fieldKey, fieldConfig]) => {
    if (!fieldConfig.anchor_refs || fieldConfig.anchor_refs.length === 0) {
      return; // Skip fields without anchor references
    }
    
    // Find the primary anchor for this field
    const primaryAnchorKey = fieldConfig.anchor_refs[0];
    const anchor = anchors[primaryAnchorKey];
    
    if (!anchor) {
      console.warn(`⚠️ Anchor "${primaryAnchorKey}" not found for field "${fieldKey}"`);
      return;
    }
    
    // Calculate ROI based on anchor position and field offset
    const offset = fieldConfig.roi_offset || { x: 0, y: 0, width: 100, height: 30 };
    
    // Scale coordinates back to original image size
    const anchorX = (anchor.position.x || 0) / scaleFactor;
    const anchorY = (anchor.position.y || 0) / scaleFactor;
    const anchorWidth = (anchor.position.width || 0) / scaleFactor;
    const anchorHeight = (anchor.position.height || 0) / scaleFactor;
    
    // Calculate ROI coordinates
    const roiX = Math.max(0, anchorX + (offset.x || 0));
    const roiY = Math.max(0, anchorY + (offset.y || 0));
    const roiWidth = Math.min(offset.width || 100, imageWidth - roiX);
    const roiHeight = Math.min(offset.height || 30, imageHeight - roiY);
    
    rois[fieldKey] = {
      x: Math.round(roiX),
      y: Math.round(roiY),
      width: Math.round(roiWidth),
      height: Math.round(roiHeight),
      anchor: primaryAnchorKey,
      anchorPosition: {
        x: Math.round(anchorX),
        y: Math.round(anchorY),
        width: Math.round(anchorWidth),
        height: Math.round(anchorHeight)
      }
    };
    
    console.log(`📐 ROI for "${fieldKey}": ${rois[fieldKey].x},${rois[fieldKey].y} ${rois[fieldKey].width}x${rois[fieldKey].height}`);
  });
  
  return rois;
};

/**
 * Crop image to specific ROI
 * @param {File} imageFile - Original image file
 * @param {Object} roi - Region of Interest coordinates
 * @returns {Promise<File>} - Cropped image file
 */
export const cropImageToROI = async (imageFile, roi) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      try {
        canvas.width = roi.width;
        canvas.height = roi.height;
        
        // Draw the cropped region
        ctx.drawImage(
          img,
          roi.x, roi.y, roi.width, roi.height,  // Source rectangle
          0, 0, roi.width, roi.height           // Destination rectangle
        );
        
        canvas.toBlob((blob) => {
          const croppedFile = new File([blob], `roi_${imageFile.name}`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(croppedFile);
        }, 'image/jpeg', 0.9);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = URL.createObjectURL(imageFile);
  });
};

/**
 * Validate anchor detection quality
 * @param {Object} anchors - Detected anchors
 * @param {Object} template - Document template configuration
 * @returns {Object} - Validation results
 */
export const validateAnchorDetection = (anchors, template) => {
  if (!template || !template.anchors) {
    return {
      quality: 0,
      detected: [],
      missing: [],
      isValid: false
    };
  }
  
  const requiredAnchors = Object.keys(template.anchors);
  const detectedAnchors = Object.keys(anchors);
  
  const missing = requiredAnchors.filter(anchor => !detectedAnchors.includes(anchor));
  const detected = requiredAnchors.filter(anchor => detectedAnchors.includes(anchor));
  
  const quality = requiredAnchors.length > 0 ? detected.length / requiredAnchors.length : 0;
  
  console.log(`📊 Anchor detection quality: ${(quality * 100).toFixed(1)}%`);
  console.log(`✅ Detected: ${detected.join(', ')}`);
  if (missing.length > 0) {
    console.log(`❌ Missing: ${missing.join(', ')}`);
  }
  
  return {
    quality,
    detected,
    missing,
    isValid: quality >= 0.6 // At least 60% of anchors should be detected
  };
};

export default {
  detectAnchors,
  generateROIs,
  cropImageToROI,
  validateAnchorDetection
};