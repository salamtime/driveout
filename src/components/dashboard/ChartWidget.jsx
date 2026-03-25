import React from 'react';
import { BarChart3 } from 'lucide-react';

const ChartWidget = () => {
  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <BarChart3 className="h-5 w-5 mr-2" />
          Revenue Analytics
        </h3>
      </div>
      <div className="p-4 h-64 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p>Chart component will load here</p>
          <p className="text-sm">Revenue trends and analytics</p>
        </div>
      </div>
    </div>
  );
};

export default ChartWidget;