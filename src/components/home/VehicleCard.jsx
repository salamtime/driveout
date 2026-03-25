import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const VehicleCard = ({ vehicle }) => {
  const { t } = useTranslation();
  
  // Default placeholder image if vehicle image is not available
  const imageUrl = vehicle.image_url || '/assets/images/atv-placeholder.jpg';
  
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-blue-50 group">
      <div className="relative h-40 sm:h-48 overflow-hidden">
        <img 
          src={imageUrl} 
          alt={vehicle.model} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
          <div className="p-3 text-white w-full">
            <div className="text-xs font-medium truncate">{vehicle.description || t('common.exploreVehicle')}</div>
          </div>
        </div>
        {vehicle.status === 'available' && (
          <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
            {t('common.available')}
          </div>
        )}
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="font-bold text-base sm:text-lg mb-1 sm:mb-2 truncate">{vehicle.model}</h3>
        <div className="flex justify-between mb-2 text-sm sm:text-base">
          <span className="text-gray-700">
            {vehicle.power_cc}cc
          </span>
          <span className="text-gray-700">
            {vehicle.capacity} {t('tours.people')}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mt-2 sm:mt-4 gap-2">
          <span className="text-blue-600 font-bold text-sm sm:text-base">
            {vehicle.hourly_rate || vehicle.price || '300'} MAD / {t('rental.duration.hour')}
          </span>
          <Link 
            to={`/rentals?vehicle=${vehicle.id}`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-center transition-all duration-300 transform hover:scale-105 shadow hover:shadow-md relative overflow-hidden group flex items-center justify-center"
          >
            <span className="absolute inset-0 bg-white/20 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500"></span>
            <span className="relative z-10 flex items-center justify-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
              </svg>
              {t('rental.buttons.bookNow')}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default VehicleCard;