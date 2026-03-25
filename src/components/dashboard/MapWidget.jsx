import React from 'react';
import { MapPin } from 'lucide-react';

const MapWidget = () => {
  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <MapPin className="h-5 w-5 mr-2" />
          Live Vehicle Tracking
        </h3>
      </div>
      <div className="p-4 h-64 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p>Map component will load here</p>
          <p className="text-sm">Real-time vehicle locations</p>
        </div>
      </div>
    </div>
  );
};

export default MapWidget;