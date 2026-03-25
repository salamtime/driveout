// Simplified Firebase config - Always use mock service for immediate loading
console.log('🔥 Using Mock Firebase service for immediate loading...');

// Mock Firebase configuration - no real Firebase needed
const firebaseConfig = {
  apiKey: "mock-api-key",
  authDomain: "mock-project.firebaseapp.com",
  projectId: "mock-project",
  storageBucket: "mock-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "mock-app-id"
};

// Always use mock service - no connection testing
export const usingMockFirebase = true;

// Simple connection test that returns immediately
export const testFirebaseConnection = async () => {
  console.log('✅ Mock Firebase service ready');
  return { success: true, usingMock: true };
};

// Export mock database reference
export const db = { mock: true };
export default { mock: true };