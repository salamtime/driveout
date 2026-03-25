import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Test Navigation component
 * Provides links to test pages and components
 */
const TestNavigation = () => {
  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="relative group">
        <button className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md">
          <span>Test Menu</span>
          <ChevronRight size={16} className="ml-2 group-hover:rotate-90 transition-transform duration-300" />
        </button>
        
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg overflow-hidden invisible group-hover:visible transition-all opacity-0 group-hover:opacity-100 transform translate-y-1 group-hover:translate-y-0">
          <ul className="py-2">
            <li>
              <Link 
                to="/test-pricing"
                className="block px-4 py-2 hover:bg-blue-50 text-gray-800"
              >
                Test Pricing Calculator
              </Link>
            </li>
            <li>
              <Link 
                to="/booking-demo"
                className="block px-4 py-2 hover:bg-blue-50 text-gray-800"
              >
                Booking Cards Demo
              </Link>
            </li>
            <li>
              <Link 
                to="/tours"
                className="block px-4 py-2 hover:bg-blue-50 text-gray-800"
              >
                Tour Booking Page
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TestNavigation;