import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { createRentalBooking } from '../../store/slices/bookingsSlice';
import { Link } from 'react-router-dom';

const ConfirmationStep = ({ bookingData, onPrevious }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { currentBooking, isLoading, error, success } = useSelector(state => state.bookings);
  const { user } = useSelector(state => state.auth);
  
  // When component mounts, if we don't have a current booking yet, create one
  useEffect(() => {
    const createBooking = async () => {
      if (!currentBooking && user && bookingData.vehicleId) {
        // Prepare booking data for submission
        const rentalBookingData = {
          vehicle_id: bookingData.vehicleId,
          start_date: bookingData.startDate.toISOString(),
          end_date: bookingData.endDate.toISOString(),
          rental_type: bookingData.rentalType,
          duration: bookingData.duration,
          pickup_location_id: bookingData.deliveryRequired ? null : bookingData.pickupLocationId,
          delivery_required: bookingData.deliveryRequired,
          delivery_address: bookingData.deliveryRequired ? bookingData.deliveryAddress : null,
          delivery_fee: bookingData.deliveryRequired ? bookingData.deliveryFee : 0,
          total_price: bookingData.totalPrice,
          status: 'pending',
          // Guest user info will already be in the auth store at this point
          customer_name: bookingData.userInfo.fullName,
          customer_email: user.email,
          customer_phone: bookingData.userInfo.phone,
        };
        
        await dispatch(createRentalBooking(rentalBookingData));
      }
    };
    
    createBooking();
  }, [currentBooking, dispatch, user, bookingData]);

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDurationText = () => {
    switch(bookingData.rentalType) {
      case 'hourly': return `${bookingData.duration} ${t('rental.duration.hours')}`;
      case 'daily': return `${bookingData.duration} ${t('rental.duration.days')}`;
      case 'weekly': return `${bookingData.duration} ${t('rental.duration.weeks')}`;
      case 'monthly': return `${bookingData.duration} ${t('rental.duration.months')}`;
      default: return bookingData.duration;
    }
  };
  
  const getLocationText = () => {
    if (bookingData.deliveryRequired) {
      return t('rental.location.delivery') + ': ' + bookingData.deliveryAddress;
    } else {
      return bookingData.pickupLocation?.name || 'Selected Location';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-4"></div>
        <p className="text-lg">{t('common.loading')}</p>
        <p className="text-gray-500 mt-2">{t('booking.payment.processingPayment')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-6 rounded-lg border border-red-200">
        <div className="flex items-center mb-4">
          <svg className="h-8 w-8 text-red-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-medium text-red-800">{t('booking.payment.paymentFailed')}</h3>
        </div>
        <p className="text-red-700 mb-4">{error}</p>
        <div className="flex justify-between">
          <button
            onClick={onPrevious}
            className="px-6 py-3 bg-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-400 transition-colors"
          >
            {t('rental.buttons.back')}
          </button>
          <button
            onClick={() => dispatch(createRentalBooking({
              vehicle_id: bookingData.vehicleId,
              start_date: bookingData.startDate.toISOString(),
              end_date: bookingData.endDate.toISOString(),
              rental_type: bookingData.rentalType,
              duration: bookingData.duration,
              pickup_location_id: bookingData.deliveryRequired ? null : bookingData.pickupLocationId,
              delivery_required: bookingData.deliveryRequired,
              delivery_address: bookingData.deliveryRequired ? bookingData.deliveryAddress : null,
              delivery_fee: bookingData.deliveryRequired ? bookingData.deliveryFee : 0,
              total_price: bookingData.totalPrice,
              status: 'pending',
              customer_name: bookingData.userInfo.fullName,
              customer_email: user.email,
              customer_phone: bookingData.userInfo.phone,
            }))}
            className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            {t('booking.payment.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="confirmation-step">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 text-green-500 mb-4">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('rental.confirmation.success')}</h2>
        {currentBooking && (
          <p className="text-gray-500">
            {t('rental.confirmation.bookingNumber')} {currentBooking.id}
          </p>
        )}
      </div>

      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <h3 className="font-medium text-lg mb-4">{t('booking.common.bookingDetails')}</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-gray-500">{t('rental.confirmation.date')}:</span>
            <span className="font-medium">
              {formatDate(bookingData.startDate)}
            </span>
          </div>
          
          <div className="flex flex-col">
            <span className="text-gray-500">{t('rental.confirmation.duration')}:</span>
            <span className="font-medium">
              {getDurationText()}
            </span>
          </div>
          
          <div className="flex flex-col">
            <span className="text-gray-500">{t('rental.confirmation.vehicle')}:</span>
            <span className="font-medium">
              {bookingData.selectedVehicle?.model || 'Selected Vehicle'}
            </span>
          </div>
          
          <div className="flex flex-col">
            <span className="text-gray-500">{t('rental.confirmation.pickup')}:</span>
            <span className="font-medium">
              {getLocationText()}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <span className="font-medium">{t('rental.confirmation.total')}:</span>
            <span className="text-xl font-bold">${bookingData.totalPrice}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          className="flex-1 px-6 py-3 bg-gray-100 text-gray-800 font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
        >
          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {t('rental.confirmation.download')}
        </button>
        
        <a
          href={`https://wa.me/+212000000000?text=Hello! I need help with my booking #${currentBooking?.id || 'new'}.`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 px-6 py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center"
        >
          <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          {t('rental.confirmation.contact')}
        </a>
      </div>

      <div className="mt-8 text-center">
        <Link to="/" className="text-blue-500 font-medium hover:text-blue-600">
          {t('booking.common.returnToHome')}
        </Link>
      </div>
    </div>
  );
};

export default ConfirmationStep;