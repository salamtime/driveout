/**
 * Image preprocessing utilities for OCR enhancement
 * Provides basic image processing without OpenCV dependency
 */

/**
 * Convert image to grayscale using canvas
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {ImageData} Processed image data
 */
function convertToGrayscale(canvas, ctx) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;     // Red
    data[i + 1] = gray; // Green
    data[i + 2] = gray; // Blue
    // Alpha channel (data[i + 3]) remains unchanged
  }
  
  return imageData;
}

/**
 * Apply contrast enhancement
 * @param {ImageData} imageData - Image data to process
 * @param {number} contrast - Contrast factor (1.0 = no change)
 * @returns {ImageData} Enhanced image data
 */
function enhanceContrast(imageData, contrast = 1.5) {
  const data = imageData.data;
  const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));     // Red
    data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128)); // Green
    data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128)); // Blue
  }
  
  return imageData;
}

/**
 * Apply brightness adjustment
 * @param {ImageData} imageData - Image data to process
 * @param {number} brightness - Brightness adjustment (-255 to 255)
 * @returns {ImageData} Adjusted image data
 */
function adjustBrightness(imageData, brightness = 20) {
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + brightness));     // Red
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + brightness)); // Green
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + brightness)); // Blue
  }
  
  return imageData;
}

/**
 * Simple noise reduction using averaging
 * @param {ImageData} imageData - Image data to process
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {ImageData} Denoised image data
 */
function reduceNoise(imageData, width, height) {
  const data = imageData.data;
  const newData = new Uint8ClampedArray(data);
  
  // Simple 3x3 averaging filter
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      // Average surrounding pixels
      let r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
          r += data[neighborIdx];
          g += data[neighborIdx + 1];
          b += data[neighborIdx + 2];
        }
      }
      
      newData[idx] = r / 9;
      newData[idx + 1] = g / 9;
      newData[idx + 2] = b / 9;
    }
  }
  
  return new ImageData(newData, width, height);
}

/**
 * Preprocess image for better OCR results
 * @param {File} imageFile - Input image file
 * @param {Object} options - Processing options
 * @returns {Promise<string>} Base64 encoded processed image
 */
export async function preprocessImage(imageFile, options = {}) {
  const {
    grayscale = true,
    enhanceContrast: shouldEnhanceContrast = true,
    adjustBrightness: shouldAdjustBrightness = true,
    reduceNoise: shouldReduceNoise = false,
    contrast = 1.3,
    brightness = 15
  } = options;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      try {
        // Set canvas size to match image
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image to canvas
        ctx.drawImage(img, 0, 0);

        // Get image data
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Apply preprocessing steps
        if (grayscale) {
          imageData = convertToGrayscale(canvas, ctx);
          ctx.putImageData(imageData, 0, 0);
        }

        if (shouldEnhanceContrast) {
          imageData = enhanceContrast(imageData, contrast);
          ctx.putImageData(imageData, 0, 0);
        }

        if (shouldAdjustBrightness) {
          imageData = adjustBrightness(imageData, brightness);
          ctx.putImageData(imageData, 0, 0);
        }

        if (shouldReduceNoise) {
          imageData = reduceNoise(imageData, canvas.width, canvas.height);
          ctx.putImageData(imageData, 0, 0);
        }

        // Convert to base64
        const processedImageData = canvas.toDataURL('image/png');
        resolve(processedImageData);

      } catch (error) {
        console.error('Error preprocessing image:', error);
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Create object URL and load image
    const objectUrl = URL.createObjectURL(imageFile);
    img.src = objectUrl;
  });
}

/**
 * Basic image quality assessment
 * @param {File} imageFile - Input image file
 * @returns {Promise<Object>} Quality metrics
 */
export async function assessImageQuality(imageFile) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      try {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Calculate basic metrics
        let brightness = 0;
        let contrast = 0;
        const pixelCount = data.length / 4;

        // Calculate average brightness
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          brightness += gray;
        }
        brightness /= pixelCount;

        // Calculate contrast (standard deviation)
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          contrast += Math.pow(gray - brightness, 2);
        }
        contrast = Math.sqrt(contrast / pixelCount);

        resolve({
          width: img.width,
          height: img.height,
          brightness: Math.round(brightness),
          contrast: Math.round(contrast),
          resolution: img.width * img.height,
          aspectRatio: img.width / img.height
        });

      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for quality assessment'));
    };

    const objectUrl = URL.createObjectURL(imageFile);
    img.src = objectUrl;
  });
}

export default {
  preprocessImage,
  assessImageQuality
};