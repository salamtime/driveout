import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ServiceCard = ({ icon, title, description, link }) => {
  const { t } = useTranslation();
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 md:p-6 transition-transform hover:-translate-y-1 hover:shadow-lg h-full flex flex-col">
      <div className="text-3xl md:text-4xl mb-3 md:mb-4">{icon}</div>
      <h3 className="text-lg md:text-xl font-semibold mb-2 md:mb-3">{title}</h3>
      <p className="text-gray-600 mb-4 text-sm md:text-base flex-grow">{description}</p>
      <Link to={link} className="text-blue-500 hover:text-blue-600 font-medium text-sm md:text-base flex items-center">
        {t('common.learnMore')} 
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
};

export default ServiceCard;