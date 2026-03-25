import { GoogleGenerativeAI } from "@google/generative-ai";

// API key is now handled by backend proxy - this file may not be used anymore
const apiKey = "placeholder";
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

const fileToGenerativePart = async (file) => {
  const base64EncodedData = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type,
    },
  };
};

const OcrService = {
  extractTextFromImage: async (imageFile) => {
    try {
      console.log("Starting OCR process with Gemini...");
      const imagePart = await fileToGenerativePart(imageFile);
      const prompt = "Extract the full name, and document number from this ID document. Provide the output in JSON format with keys 'name' and 'license_number'.";

      const result = await model.generateContent([prompt, imagePart]);
      const response = result.response;
      const text = response.text();
      
      console.log("Gemini API response text:", text);

      // Clean the response to get a valid JSON string
      const jsonString = text.replace(/```json/g, "").replace(/```/g, "").trim();
      
      console.log("Cleaned JSON string:", jsonString);

      const data = JSON.parse(jsonString);

      console.log("Parsed OCR data:", data);
      return { success: true, data };
    } catch (error) {
      console.error("Error during OCR with Gemini API:", error);
      return { success: false, error: "Failed to extract text from image." };
    }
  },
};

export default OcrService;