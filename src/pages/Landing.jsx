import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchVehicles } from '../store/slices/vehiclesSlice';

// Components
import Hero from '../components/home/Hero';
import ServiceCard from '../components/home/ServiceCard';
import VehicleCard from '../components/home/VehicleCard';
import TestimonialCard from '../components/home/TestimonialCard';
import LocationCard from '../components/home/LocationCard';

const Landing = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { vehicles, isLoading: vehiclesLoading } = useSelector(state => state.vehicles);
  const [featuredVehicles, setFeaturedVehicles] = useState([]);
  
  // Sample locations (in a real app, this would come from API)
  const locations = [
    { id: 1, name: 'Marrakech', address: '123 Desert Road', coordinates: { lat: 31.6295, lng: -7.9811 } },
    { id: 2, name: 'Agadir', address: '456 Beach Avenue', coordinates: { lat: 30.4278, lng: -9.5981 } },
    { id: 3, name: 'Merzouga', address: '789 Sand Dune Lane', coordinates: { lat: 31.0914, lng: -4.0096 } }
  ];
  
  // Sample testimonials (in a real app, this would come from API)
  const testimonials = [
    { 
      id: 1, 
      name: 'John Smith', 
      rating: 5, 
      text: 'Amazing experience with SaharaX! The ATVs were in perfect condition and the guide was knowledgeable.',
      date: '2023-05-15',
      avatar: '/assets/images/avatar1.jpg'
    },
    { 
      id: 2, 
      name: 'Marie Dubois', 
      rating: 5, 
      text: 'The sunset tour was breathtaking. Worth every penny!',
      date: '2023-06-22',
      avatar: '/assets/images/avatar2.jpg'
    },
    { 
      id: 3, 
      name: 'Ahmed Hassan', 
      rating: 4, 
      text: 'Great service and friendly staff. Would definitely recommend to friends.',
      date: '2023-07-10',
      avatar: '/assets/images/avatar3.jpg'
    }
  ];
  
  // Services data from translations
  const services = [
    { 
      id: 'rentals', 
      icon: '🏍️', 
      title: t('landing.services.rentalTitle'), 
      description: t('landing.services.rentalDescription'),
      link: '/rentals'
    },
    { 
      id: 'tours', 
      icon: '🌄', 
      title: t('landing.services.toursTitle'), 
      description: t('landing.services.toursDescription'),
      link: '/tours'
    },
    { 
      id: 'delivery', 
      icon: '🚚', 
      title: t('landing.services.deliveryTitle'), 
      description: t('landing.services.deliveryDescription'),
      link: '/rentals'
    },
    { 
      id: 'groups', 
      icon: '👥', 
      title: t('landing.services.groupTitle'), 
      description: t('landing.services.groupDescription'),
      link: '/contact'
    }
  ];
  
  // Fetch vehicles on component mount
  useEffect(() => {
    dispatch(fetchVehicles({ available: true }));
  }, [dispatch]);
  
  // Set featured vehicles when vehicles array changes
  useEffect(() => {
    if (vehicles.length > 0) {
      // Take up to 4 vehicles for the featured section
      setFeaturedVehicles(vehicles.slice(0, 4));
    }
  }, [vehicles]);
  
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <Hero />
      
      {/* Services Section */}
      <section className="bg-white py-10 md:py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-12">{t('landing.services.title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
            {services.map((service) => (
              <ServiceCard 
                key={service.id}
                icon={service.icon}
                title={service.title}
                description={service.description}
                link={service.link}
              />
            ))}
          </div>
        </div>
      </section>
      
      {/* Vehicles Section */}
      <section className="bg-gray-50 py-10 md:py-16">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-6 md:mb-10">
            <h2 className="text-2xl md:text-3xl font-bold">{t('landing.vehicles.title')}</h2>
            <Link 
              to="/rentals" 
              className="text-blue-500 font-medium text-sm md:text-base flex items-center"
            >
              {t('landing.vehicles.viewAll')}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          
          {vehiclesLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : featuredVehicles.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {featuredVehicles.map((vehicle) => (
                <VehicleCard 
                  key={vehicle.id}
                  vehicle={vehicle}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-white rounded-lg shadow">
              <p className="text-gray-500">{t('common.loading')}...</p>
            </div>
          )}
          
          <div className="mt-8 text-center block sm:hidden">
            <Link 
              to="/rentals" 
              className="inline-block w-full px-4 py-3 bg-blue-500 text-white font-medium text-sm rounded-lg hover:bg-blue-600 transition-colors"
            >
              {t('landing.vehicles.viewAll')}
            </Link>
          </div>
        </div>
      </section>
      
      {/* Testimonials Section - Mobile-friendly slider */}
      <section className="bg-white py-10 md:py-16 overflow-hidden">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-10">{t('landing.testimonials.title')}</h2>
          
          {/* Mobile scroll view */}
          <div className="md:hidden -mx-4 px-4 flex overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            {testimonials.map((testimonial) => (
              <div key={testimonial.id} className="snap-start flex-shrink-0 w-full max-w-xs mr-4">
                <TestimonialCard testimonial={testimonial} />
              </div>
            ))}
          </div>
          
          {/* Desktop grid view */}
          <div className="hidden md:grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial) => (
              <TestimonialCard 
                key={testimonial.id}
                testimonial={testimonial}
              />
            ))}
          </div>
          
          {/* Mobile pagination dots */}
          <div className="flex justify-center mt-4 md:hidden">
            {testimonials.map((_, index) => (
              <span 
                key={index} 
                className={`h-2 w-2 mx-1 rounded-full ${index === 0 ? 'bg-blue-500' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        </div>
      </section>
      
      {/* Locations Section */}
      <section className="bg-gray-50 py-10 md:py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-2 md:mb-4">{t('landing.locations.title')}</h2>
          <p className="text-center text-gray-600 mb-6 md:mb-10 text-sm md:text-base">{t('landing.locations.subtitle')}</p>
          
          {/* Mobile scroll view */}
          <div className="md:hidden -mx-4 px-4 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4">
            {locations.map((location) => (
              <div key={location.id} className="snap-start flex-shrink-0 w-80 mr-4">
                <LocationCard location={location} />
              </div>
            ))}
          </div>
          
          {/* Desktop grid view */}
          <div className="hidden md:grid md:grid-cols-3 gap-8">
            {locations.map((location) => (
              <LocationCard 
                key={location.id}
                location={location}
              />
            ))}
          </div>
          
          {/* Mobile pagination dots */}
          <div className="flex justify-center mt-4 md:hidden">
            {locations.map((_, index) => (
              <span 
                key={index} 
                className={`h-2 w-2 mx-1 rounded-full ${index === 0 ? 'bg-blue-500' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="bg-blue-500 text-white py-10 md:py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 md:mb-4">{t('landing.cta.title')}</h2>
          <p className="text-lg md:text-xl mb-6 md:mb-8">{t('landing.cta.subtitle')}</p>
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
            <Link 
              to="/rentals" 
              className="px-6 py-3 md:px-8 md:py-4 bg-white text-blue-500 font-bold rounded-lg hover:bg-gray-100 transition-colors w-full sm:w-auto text-sm md:text-base"
            >
              {t('landing.hero.bookNow')}
            </Link>
            <Link 
              to="/tours" 
              className="px-6 py-3 md:px-8 md:py-4 bg-transparent border-2 border-white text-white font-bold rounded-lg hover:bg-white hover:text-blue-500 transition-colors w-full sm:w-auto text-sm md:text-base"
            >
              {t('landing.hero.exploreTours')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;