import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const Tours = () => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState('all');

  const tours = [
    {
      id: 1,
      title: "Sahara Sunset Adventure",
      category: "sunset",
      duration: "4 hours",
      difficulty: "Easy",
      price: 150,
      image: "/assets/images/tours/sunset-tour.jpg",
      description: "Experience the magic of a Sahara sunset on this unforgettable ATV adventure.",
      highlights: ["Sunset viewing", "Desert photography", "Traditional tea", "Local guide"],
      groupSize: "2-8 people"
    },
    {
      id: 2,
      title: "Desert Explorer Full Day",
      category: "full-day",
      duration: "8 hours",
      difficulty: "Moderate",
      price: 280,
      image: "/assets/images/tours/full-day-tour.jpg",
      description: "A comprehensive desert exploration with lunch and multiple stops.",
      highlights: ["Oasis visit", "Berber village", "Traditional lunch", "Camel riding"],
      groupSize: "4-12 people"
    },
    {
      id: 3,
      title: "Adrenaline Rush Express",
      category: "adventure",
      duration: "2 hours",
      difficulty: "Hard",
      price: 100,
      image: "/assets/images/tours/adventure-tour.jpg",
      description: "High-speed desert racing for thrill-seekers and experienced riders.",
      highlights: ["High-speed riding", "Dune jumping", "Racing techniques", "Safety briefing"],
      groupSize: "2-6 people"
    },
    {
      id: 4,
      title: "Family Desert Discovery",
      category: "family",
      duration: "3 hours",
      difficulty: "Easy",
      price: 120,
      image: "/assets/images/tours/family-tour.jpg",
      description: "Perfect for families with children, featuring gentle rides and cultural experiences.",
      highlights: ["Kid-friendly ATVs", "Cultural activities", "Snacks included", "Photo stops"],
      groupSize: "2-10 people"
    },
    {
      id: 5,
      title: "Overnight Desert Camp",
      category: "overnight",
      duration: "24 hours",
      difficulty: "Moderate",
      price: 450,
      image: "/assets/images/tours/overnight-tour.jpg",
      description: "Sleep under the stars in our luxury desert camp with traditional entertainment.",
      highlights: ["Luxury tents", "Traditional dinner", "Stargazing", "Morning sunrise"],
      groupSize: "2-16 people"
    },
    {
      id: 6,
      title: "Photography Safari",
      category: "photography",
      duration: "6 hours",
      difficulty: "Easy",
      price: 200,
      image: "/assets/images/tours/photo-tour.jpg",
      description: "Capture stunning desert landscapes with our professional photography guide.",
      highlights: ["Pro photography tips", "Best photo spots", "Equipment provided", "Editing workshop"],
      groupSize: "2-8 people"
    }
  ];

  const categories = [
    { id: 'all', name: 'All Tours' },
    { id: 'sunset', name: 'Sunset Tours' },
    { id: 'full-day', name: 'Full Day' },
    { id: 'adventure', name: 'Adventure' },
    { id: 'family', name: 'Family' },
    { id: 'overnight', name: 'Overnight' },
    { id: 'photography', name: 'Photography' }
  ];

  const filteredTours = selectedCategory === 'all' 
    ? tours 
    : tours.filter(tour => tour.category === selectedCategory);

  const getDifficultyColor = (difficulty) => {
    switch (difficulty.toLowerCase()) {
      case 'easy': return 'text-green-600 bg-green-100';
      case 'moderate': return 'text-yellow-600 bg-yellow-100';
      case 'hard': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-orange-600 to-red-600 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Desert Tours & Adventures
          </h1>
          <p className="text-xl md:text-2xl max-w-3xl mx-auto">
            Discover the magic of Morocco's Sahara Desert with our expertly guided tours
          </p>
        </div>
      </section>

      {/* Filter Section */}
      <section className="py-8 bg-white shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-6 py-2 rounded-full font-medium transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Tours Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredTours.map(tour => (
              <div key={tour.id} className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                {/* Tour Image */}
                <div className="h-48 bg-gradient-to-r from-orange-400 to-red-400 flex items-center justify-center">
                  <span className="text-white font-medium">Tour Image</span>
                </div>

                {/* Tour Content */}
                <div className="p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xl font-bold text-gray-800">{tour.title}</h3>
                    <span className="text-2xl font-bold text-orange-600">${tour.price}</span>
                  </div>

                  <p className="text-gray-600 mb-4 text-sm">{tour.description}</p>

                  {/* Tour Details */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Duration:</span>
                      <span className="font-medium">{tour.duration}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Group Size:</span>
                      <span className="font-medium">{tour.groupSize}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Difficulty:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(tour.difficulty)}`}>
                        {tour.difficulty}
                      </span>
                    </div>
                  </div>

                  {/* Highlights */}
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm">Highlights:</h4>
                    <div className="flex flex-wrap gap-1">
                      {tour.highlights.map((highlight, index) => (
                        <span key={index} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                          {highlight}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Link
                      to={`/tours/${tour.id}`}
                      className="flex-1 bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors text-center font-medium"
                    >
                      Book Now
                    </Link>
                    <button className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">
            Why Choose Our Tours?
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Expert Guides</h3>
              <p className="text-gray-600 text-sm">
                Local guides with years of desert experience and cultural knowledge
              </p>
            </div>
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Safety First</h3>
              <p className="text-gray-600 text-sm">
                Top-quality equipment and comprehensive safety briefings for all tours
              </p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Best Value</h3>
              <p className="text-gray-600 text-sm">
                Competitive pricing with no hidden fees and flexible payment options
              </p>
            </div>
            <div className="text-center">
              <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Memorable Experience</h3>
              <p className="text-gray-600 text-sm">
                Unforgettable adventures that create lasting memories for all participants
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-orange-600 to-red-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready for Your Desert Adventure?
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Book your tour today and experience the magic of Morocco's Sahara Desert
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/contact"
              className="bg-white text-orange-600 px-8 py-3 rounded-md font-semibold hover:bg-gray-100 transition-colors"
            >
              Contact Us
            </Link>
            <Link
              to="/rentals"
              className="border-2 border-white text-white px-8 py-3 rounded-md font-semibold hover:bg-white hover:text-orange-600 transition-colors"
            >
              ATV Rentals
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Tours;