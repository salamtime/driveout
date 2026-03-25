import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const Hero = () => {
  const { t } = useTranslation();

  // In a real implementation, this would be a properly optimized image from your assets
  const heroImageUrl = '/assets/images/desert-atv.jpg';

  return (
    <div 
      className="relative bg-cover bg-center min-h-[60vh] md:min-h-[80vh] bg-gradient-to-r from-blue-700 to-blue-500" 
      style={{ 
        backgroundImage: heroImageUrl 
          ? `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url(${heroImageUrl})` 
          : 'none'
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center text-white px-6 sm:px-8 md:px-10 py-8 max-w-3xl backdrop-blur-sm bg-black/10 rounded-lg border border-white/10">
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-3 md:mb-4">
            {t('landing.hero.title')}
          </h1>
          <p className="text-lg md:text-2xl mb-6 md:mb-8">
            {t('landing.hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/rentals" 
              className="px-6 py-3 md:px-8 md:py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl text-sm md:text-base w-full sm:w-auto relative overflow-hidden group"
              style={{
                position: 'relative',
                zIndex: 1
              }}
            >
              <span className="absolute inset-0 bg-white/20 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-700"></span>
              <span className="relative z-10 flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"></path>
                </svg>
                {t('landing.hero.bookNow')}
              </span>
            </Link>
            <Link 
              to="/tours" 
              className="px-6 py-3 md:px-8 md:py-4 bg-transparent border-2 border-white text-white font-bold rounded-lg hover:bg-blue-500 hover:border-blue-500 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl text-sm md:text-base w-full sm:w-auto relative overflow-hidden group"
              style={{
                position: 'relative',
                zIndex: 1
              }}
            >
              <span className="absolute inset-0 bg-blue-500/30 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-700"></span>
              <span className="relative z-10 flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                {t('landing.hero.exploreTours')}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;