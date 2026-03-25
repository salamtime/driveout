/**
 * Script-aware text parsing for multi-language OCR results
 * Handles Arabic, French, and English text classification and filtering
 */

/**
 * Detect the script type of a text string
 * @param {string} text - Input text to analyze
 * @returns {string} - Script type: 'arabic', 'latin', 'mixed', or 'unknown'
 */
export const detectScript = (text) => {
  if (!text || typeof text !== 'string') {
    return 'unknown';
  }
  
  const cleanText = text.trim();
  if (cleanText.length === 0) {
    return 'unknown';
  }
  
  // Count characters by script
  let arabicCount = 0;
  let latinCount = 0;
  let digitCount = 0;
  let otherCount = 0;
  
  for (const char of cleanText) {
    const code = char.charCodeAt(0);
    
    // Arabic script range (including Arabic-Indic digits)
    if ((code >= 0x0600 && code <= 0x06FF) || // Arabic
        (code >= 0x0750 && code <= 0x077F) || // Arabic Supplement
        (code >= 0x08A0 && code <= 0x08FF) || // Arabic Extended-A
        (code >= 0xFB50 && code <= 0xFDFF) || // Arabic Presentation Forms-A
        (code >= 0xFE70 && code <= 0xFEFF)) { // Arabic Presentation Forms-B
      arabicCount++;
    }
    // Latin script (including accented characters)
    else if ((code >= 0x0041 && code <= 0x005A) || // A-Z
             (code >= 0x0061 && code <= 0x007A) || // a-z
             (code >= 0x00C0 && code <= 0x00FF) || // Latin-1 Supplement
             (code >= 0x0100 && code <= 0x017F) || // Latin Extended-A
             (code >= 0x0180 && code <= 0x024F)) { // Latin Extended-B
      latinCount++;
    }
    // Digits (0-9)
    else if (code >= 0x0030 && code <= 0x0039) {
      digitCount++;
    }
    // Other characters (punctuation, spaces, etc.)
    else {
      otherCount++;
    }
  }
  
  const totalChars = arabicCount + latinCount + digitCount + otherCount;
  const arabicRatio = arabicCount / totalChars;
  const latinRatio = latinCount / totalChars;
  
  // Determine script based on ratios
  if (arabicRatio > 0.6) {
    return 'arabic';
  } else if (latinRatio > 0.6) {
    return 'latin';
  } else if (arabicRatio > 0.2 && latinRatio > 0.2) {
    return 'mixed';
  } else if (digitCount > 0 && (arabicCount + latinCount) === 0) {
    return 'numeric';
  } else {
    return 'unknown';
  }
};

/**
 * Filter text tokens by script type
 * @param {Array} tokens - Array of text tokens
 * @param {string} preferredScript - Preferred script type ('arabic', 'latin', 'numeric')
 * @param {Object} options - Filtering options
 * @returns {Array} - Filtered tokens
 */
export const filterTokensByScript = (tokens, preferredScript, options = {}) => {
  const {
    allowMixed = true,
    minTokenLength = 1,
    excludePatterns = []
  } = options;
  
  if (!Array.isArray(tokens)) {
    return [];
  }
  
  return tokens.filter(token => {
    if (!token || typeof token !== 'string') {
      return false;
    }
    
    const cleanToken = token.trim();
    
    // Skip empty or too short tokens
    if (cleanToken.length < minTokenLength) {
      return false;
    }
    
    // Skip tokens matching exclude patterns
    if (excludePatterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(cleanToken);
    })) {
      return false;
    }
    
    const script = detectScript(cleanToken);
    
    // Filter based on preferred script
    switch (preferredScript) {
      case 'latin':
        return script === 'latin' || script === 'numeric' || (allowMixed && script === 'mixed');
      case 'arabic':
        return script === 'arabic' || (allowMixed && script === 'mixed');
      case 'numeric':
        return script === 'numeric' || /^\d+$/.test(cleanToken);
      case 'any':
        return script !== 'unknown';
      default:
        return true;
    }
  });
};

/**
 * Extract Latin text from mixed-script content
 * @param {string} text - Input text with mixed scripts
 * @param {Object} options - Extraction options
 * @returns {string} - Extracted Latin text
 */
export const extractLatinText = (text, options = {}) => {
  const {
    preserveSpaces = true,
    removeExtraSpaces = true,
    minWordLength = 2
  } = options;
  
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Split into words and filter for Latin script
  const words = text.split(/\s+/);
  const latinWords = filterTokensByScript(words, 'latin', {
    minTokenLength: minWordLength,
    allowMixed: false
  });
  
  let result = latinWords.join(' ');
  
  if (removeExtraSpaces) {
    result = result.replace(/\s+/g, ' ').trim();
  }
  
  return result;
};

/**
 * Extract Arabic text from mixed-script content
 * @param {string} text - Input text with mixed scripts
 * @param {Object} options - Extraction options
 * @returns {string} - Extracted Arabic text
 */
export const extractArabicText = (text, options = {}) => {
  const {
    preserveSpaces = true,
    removeExtraSpaces = true,
    minWordLength = 1
  } = options;
  
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Split into words and filter for Arabic script
  const words = text.split(/\s+/);
  const arabicWords = filterTokensByScript(words, 'arabic', {
    minTokenLength: minWordLength,
    allowMixed: false
  });
  
  let result = arabicWords.join(' ');
  
  if (removeExtraSpaces) {
    result = result.replace(/\s+/g, ' ').trim();
  }
  
  return result;
};

/**
 * Extract numeric tokens from text
 * @param {string} text - Input text
 * @param {Object} options - Extraction options
 * @returns {Array} - Array of numeric strings
 */
export const extractNumericTokens = (text, options = {}) => {
  const {
    includeFormatted = true, // Include formatted numbers like "12/34/5678"
    minDigits = 1,
    maxDigits = 20
  } = options;
  
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  const patterns = [];
  
  // Basic digits
  patterns.push(/\b\d+\b/g);
  
  if (includeFormatted) {
    // Formatted numbers (dates, IDs, etc.)
    patterns.push(/\b\d{1,4}[\/\-\.]\d{1,4}[\/\-\.]\d{1,4}\b/g); // Date format
    patterns.push(/\bCT\d{6,8}\b/g); // CNIE format
    patterns.push(/\b\d{2,3}\/\d{6,8}\b/g); // License format
  }
  
  const matches = [];
  
  patterns.forEach(pattern => {
    const found = text.match(pattern) || [];
    matches.push(...found);
  });
  
  // Filter by digit count
  return matches.filter(match => {
    const digitCount = (match.match(/\d/g) || []).length;
    return digitCount >= minDigits && digitCount <= maxDigits;
  });
};

/**
 * Parse name from OCR text with script awareness
 * @param {string} text - OCR text containing name
 * @param {Object} options - Parsing options
 * @returns {Object} - Parsed name information
 */
export const parseName = (text, options = {}) => {
  const {
    preferLatin = true,
    includeArabic = true,
    minNameLength = 2,
    maxNameLength = 50
  } = options;
  
  if (!text || typeof text !== 'string') {
    return { latin: '', arabic: '', confidence: 0 };
  }
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let latinName = '';
  let arabicName = '';
  let confidence = 0;
  
  for (const line of lines) {
    const script = detectScript(line);
    
    // Extract Latin name
    if ((script === 'latin' || script === 'mixed') && !latinName) {
      const extracted = extractLatinText(line, { minWordLength: minNameLength });
      if (extracted.length >= minNameLength && extracted.length <= maxNameLength) {
        // Validate that it looks like a name (mostly uppercase letters)
        if (/^[A-Z\s]{2,}$/.test(extracted)) {
          latinName = extracted;
          confidence = Math.max(confidence, 0.8);
        }
      }
    }
    
    // Extract Arabic name
    if ((script === 'arabic' || script === 'mixed') && !arabicName && includeArabic) {
      const extracted = extractArabicText(line, { minWordLength: 1 });
      if (extracted.length >= 1 && extracted.length <= maxNameLength) {
        arabicName = extracted;
        confidence = Math.max(confidence, 0.6);
      }
    }
  }
  
  // Return preferred name first
  return {
    latin: latinName,
    arabic: arabicName,
    primary: preferLatin ? (latinName || arabicName) : (arabicName || latinName),
    confidence
  };
};

/**
 * Parse date from text with multiple format support
 * @param {string} text - Text containing date
 * @param {Object} options - Parsing options
 * @returns {Object} - Parsed date information
 */
export const parseDate = (text, options = {}) => {
  const {
    preferredFormat = 'DMY', // DMY, MDY, YMD
    allowedSeparators = ['/', '-', '.', ' ']
  } = options;
  
  if (!text || typeof text !== 'string') {
    return { date: '', format: '', confidence: 0 };
  }
  
  // Date patterns for different formats
  const patterns = [
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    { regex: /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/, format: 'DMY' },
    // MM/DD/YYYY
    { regex: /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/, format: 'MDY' },
    // YYYY/MM/DD
    { regex: /\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/, format: 'YMD' },
    // DD MM YYYY (space separated)
    { regex: /\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/, format: 'DMY' }
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const [fullMatch, part1, part2, part3] = match;
      
      let day, month, year;
      
      switch (pattern.format) {
        case 'DMY':
          day = part1;
          month = part2;
          year = part3;
          break;
        case 'MDY':
          month = part1;
          day = part2;
          year = part3;
          break;
        case 'YMD':
          year = part1;
          month = part2;
          day = part3;
          break;
      }
      
      // Validate date components
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      
      if (dayNum >= 1 && dayNum <= 31 && 
          monthNum >= 1 && monthNum <= 12 && 
          yearNum >= 1900 && yearNum <= 2030) {
        
        // Format as DD/MM/YYYY (standard for Morocco)
        const formattedDate = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        
        return {
          date: formattedDate,
          format: pattern.format,
          confidence: 0.9,
          raw: fullMatch
        };
      }
    }
  }
  
  return { date: '', format: '', confidence: 0 };
};

/**
 * Parse place name from birth information text
 * @param {string} text - Text containing place information
 * @param {Object} options - Parsing options
 * @returns {Object} - Parsed place information
 */
export const parsePlace = (text, options = {}) => {
  const {
    preferLatin = true,
    minPlaceLength = 3,
    maxPlaceLength = 50,
    excludeDatePattern = true
  } = options;
  
  if (!text || typeof text !== 'string') {
    return { place: '', confidence: 0 };
  }
  
  let processedText = text;
  
  // Remove date patterns if requested
  if (excludeDatePattern) {
    processedText = processedText.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b/g, '');
    processedText = processedText.replace(/\b\d{1,2}\s+\d{1,2}\s+\d{4}\b/g, '');
  }
  
  // Extract Latin text (place names are typically in Latin script)
  const latinText = extractLatinText(processedText, {
    minWordLength: 2,
    removeExtraSpaces: true
  });
  
  if (latinText.length >= minPlaceLength && latinText.length <= maxPlaceLength) {
    // Validate that it looks like a place name (uppercase words)
    if (/^[A-Z\s]{3,}$/.test(latinText)) {
      return {
        place: latinText.trim(),
        confidence: 0.8
      };
    }
  }
  
  return { place: '', confidence: 0 };
};

/**
 * Clean and normalize OCR text
 * @param {string} text - Raw OCR text
 * @param {Object} options - Cleaning options
 * @returns {string} - Cleaned text
 */
export const cleanOcrText = (text, options = {}) => {
  const {
    removeExtraSpaces = true,
    removePunctuation = false,
    normalizeCase = false,
    removeSpecialChars = false
  } = options;
  
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  let cleaned = text;
  
  // Remove extra whitespace
  if (removeExtraSpaces) {
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
  }
  
  // Remove punctuation (except useful ones)
  if (removePunctuation) {
    cleaned = cleaned.replace(/[^\w\s\-\/\.]/g, '');
  }
  
  // Normalize case
  if (normalizeCase) {
    cleaned = cleaned.toUpperCase();
  }
  
  // Remove special characters
  if (removeSpecialChars) {
    cleaned = cleaned.replace(/[^\w\s]/g, '');
  }
  
  return cleaned;
};

export default {
  detectScript,
  filterTokensByScript,
  extractLatinText,
  extractArabicText,
  extractNumericTokens,
  parseName,
  parseDate,
  parsePlace,
  cleanOcrText
};