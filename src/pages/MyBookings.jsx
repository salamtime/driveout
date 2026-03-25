import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { CalendarIcon, MapPinIcon, ClockIcon, UsersIcon } from 'lucide-react';

const MyBookings = () => {
  const { t } = useTranslation();
  const { user } = useSelector(state => state.auth);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for demo purposes
    const mockBookings = [
      {
        id: 1,
        type: 'tour',
        title: 'Desert Safari Adventure',
        date: '2024-07-15',
        time: '09:00',
        location: 'Sahara Desert',
        status: 'confirmed',
        participants: 4,
        price: 299
      },
      {
        id: 2,
        type: 'rental',
        title: 'ATV Rental',
        date: '2024-07-20',
        time: '14:00',
        location: 'Base Camp',
        status: 'pending',
        participants: 2,
        price: 150
      }
    ];

    // Simulate API call
    setTimeout(() => {
      setBookings(mockBookings);
      setLoading(false);
    }, 1000);
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4">
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            {t('common.myBookings')}
          </h1>

          {bookings.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <CalendarIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No bookings yet
              </h3>
              <p className="text-gray-500 mb-6">
                You haven't made any bookings yet. Start exploring our tours and rentals!
              </p>
              <div className="space-x-4">
                <a 
                  href="/tours" 
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Browse Tours
                </a>
                <a 
                  href="/rentals" 
                  className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
                >
                  Browse Rentals
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {bookings.map((booking) => (
                <div key={booking.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {booking.title}
                      </h3>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">${booking.price}</p>
                      <p className="text-sm text-gray-500">Total</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                    <div className="flex items-center">
                      <CalendarIcon className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{booking.date}</span>
                    </div>
                    <div className="flex items-center">
                      <ClockIcon className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{booking.time}</span>
                    </div>
                    <div className="flex items-center">
                      <MapPinIcon className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{booking.location}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center text-sm text-gray-600">
                      <UsersIcon className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{booking.participants} participants</span>
                    </div>
                    <div className="space-x-2">
                      <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View Details
                      </button>
                      {booking.status === 'confirmed' && (
                        <button className="text-red-600 hover:text-red-800 text-sm font-medium">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyBookings;