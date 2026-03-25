/**
 * NOTE: This is a mock implementation of the OCR service.
 * The original implementation was missing, causing a build failure.
 * This mock is intended to unblock the build and development process.
 * A proper OCR solution (e.g., Tesseract.js or a backend API) needs to be implemented.
 */

/**
 * Performs Optical Character Recognition on an image file.
 * @param {File} imageFile The image file to process.
 * @returns {Promise<string>} A promise that resolves with the extracted text.
 */
export const performOCR = async (imageFile) => {
  console.warn(
    'OCR service is currently mocked. Returning sample data. Please implement a real OCR solution.'
  );

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Return sample OCR text that can be parsed by extractFieldsFromOCR
  const mockOcrText = `
    IDNUMBER C12345678
    EXP. 12-12-2030
    LN: DOE
    FN: JOHN
    DOB: 01-01-1990
    SEX: M
    ADDRESS: 123 MAIN ST, ANYTOWN, USA 12345
    EMAIL: john.doe@example.com
    PHONE: 555-123-4567
  `;

  return mockOcrText;
};