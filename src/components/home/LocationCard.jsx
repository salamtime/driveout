import React from 'react';
import { Link } from 'react-router-dom';

const LocationCard = ({ location }) => {
  const { name, address } = location;
  
  // Generate static map URL (in a real app, you might use Google Maps API)
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${location.coordinates.lat},${location.coordinates.lng}&zoom=14&size=400x200&maptype=roadmap&markers=color:red%7C${location.coordinates.lat},${location.coordinates.lng}&key=YOUR_API_KEY`;
  
  return (
    <div className="bg-white rounded-lg overflow-hidden shadow-md transition-transform hover:-translate-y-1 hover:shadow-lg">
      <div className="bg-gray-300 h-48">
        {/* In a real app, this would be a proper Google Maps component */}
        <div className="w-full h-full bg-gray-300 flex items-center justify-center text-gray-500">
          Map Location: {name}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-lg mb-2">{name}</h3>
        <p className="text-gray-600 mb-4">{address}</p>
        <Link 
          to={`/rentals?location=${location.id}`}
          className="text-blue-500 hover:text-blue-600 font-medium"
        >
          Book from this location →
        </Link>
      </div>
    </div>
  );
};

export default LocationCard;