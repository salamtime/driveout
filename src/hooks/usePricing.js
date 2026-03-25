import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  calculateRentalPricing, 
  clearCalculation,
  selectCurrentCalculation,
  selectCalculationLoading,
  selectCalculationError 
} from '../store/slices/pricingSlice';

export const usePricing = () => {
  const dispatch = useDispatch();
  const calculation = useSelector(selectCurrentCalculation);
  const loading = useSelector(selectCalculationLoading);
  const error = useSelector(selectCalculationError);

  const calculatePricing = useCallback((rentalParams) => {
    // Only calculate if we have required parameters
    if (rentalParams.rental_start_date && 
        rentalParams.rental_end_date && 
        rentalParams.rental_type) {
      dispatch(calculateRentalPricing(rentalParams));
    }
  }, [dispatch]);

  const clearPricingCalculation = useCallback(() => {
    dispatch(clearCalculation());
  }, [dispatch]);

  // Auto-calculate pricing when rental parameters change
  const autoCalculatePricing = useCallback((rentalParams) => {
    // Debounce the calculation to avoid too many API calls
    const timeoutId = setTimeout(() => {
      calculatePricing(rentalParams);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [calculatePricing]);

  return {
    calculation,
    loading,
    error,
    calculatePricing,
    clearPricingCalculation,
    autoCalculatePricing
  };
};

export default usePricing;