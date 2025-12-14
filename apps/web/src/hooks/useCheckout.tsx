import { useMutation, useQuery } from '@tanstack/react-query';
import { trackEmailTicketPurchaseComplete } from '@/lib/emailTracking';

import { UserDetailsFormData } from '@/lib/schemas/checkoutSchema';
import {
  ApplyCodeResponse,
  CheckoutConfigResponse,
  ValidationResponse,
} from '@/types/checkout';
import { toast } from 'sonner';

export interface InitiateCheckoutVariables {
  eventId: string;
  selectedTickets: Record<string, number>;
  userDetails: UserDetailsFormData;
  promotionCode?: string;
}

const initiateCheckoutApiCall = async (
  variables: InitiateCheckoutVariables
): Promise<ValidationResponse> => {
  const requestBody = {
    eventId: variables.eventId,
    selectedTickets: variables.selectedTickets,
    userDetails: variables.userDetails,
    promotionCode: variables.promotionCode,
  };

  const response = await fetch('/api/checkout/initiate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(
      responseData.message || `Checkout initiation failed (${response.status})`
    );
  }

  return responseData as ValidationResponse;
};

/**
 * React Query hook using useMutation to call the checkout initiation endpoint.
 * Handles server-side validation, pending order creation, and Stripe Payment Intent creation.
 *
 * @returns {UseMutationResult<ValidationResponse, Error, InitiateCheckoutVariables>}
 * Includes mutate, data, error, isPending, etc.
 */
export function useInitiateCheckout() {
  return useMutation<ValidationResponse, Error, InitiateCheckoutVariables>({
    mutationFn: initiateCheckoutApiCall,
    onSuccess: (data, variables) => {
      const totalTickets = Object.values(variables.selectedTickets).reduce(
        (sum, count) => sum + count,
        0
      );

      trackEmailTicketPurchaseComplete({
        event_id: variables.eventId,
        order_id: data.orderId,
        total_amount: data.total,
        subtotal: data.subtotal,
        fees: data.fees,
        total_tickets: totalTickets,
        user_email: variables.userDetails.email,
        is_free: data.isFree,
        promotion_applied: data.promotionApplied,
      });
    },
    onError: (error) => {
      console.error('Initiate Checkout Error:', error);
      toast.error('Checkout failed. Please try again.');
    },
  });
}

const fetchCheckoutConfig = async (
  eventId: string,
  promoCode?: string
): Promise<CheckoutConfigResponse> => {
  // TODO: Determine if auth is needed for this endpoint
  // const { user } = useContext(TropTixContext); // Get user/token if needed
  // const jwtToken = user?.jwtToken; // Example token retrieval

  if (!eventId) {
    throw new Error('Event ID is required to fetch checkout config.');
  }

  const url = `/api/checkout/config?eventId=${eventId}${
    promoCode ? `&promoCode=${promoCode}` : ''
  }`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const responseData = await response.json(); // Always try to parse JSON

  if (!response.ok) {
    throw new Error(
      responseData.message ||
        `Failed to fetch checkout config (${response.status})`
    );
  }

  // Type assertion on success
  return responseData as CheckoutConfigResponse;
};

/**
 * React Query hook to fetch the initial configuration data needed for the
 * checkout UI (available tickets, etc.) for a specific event.
 * Calls GET /api/checkout/config?eventId=...
 *
 * @param {string | undefined} eventId - The ID of the event to fetch config for. Query disabled if falsy.
 * @returns {UseQueryResult<CheckoutConfigResponseDTO, Error>}
 */
export function useFetchCheckoutConfig(eventId: string, promoCode?: string) {
  return useQuery<CheckoutConfigResponse, Error>({
    queryKey: ['checkout', 'config', eventId], // Query key array
    queryFn: () => fetchCheckoutConfig(eventId, promoCode),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000, // Data considered fresh for 5 minutes
  });
}

export function useApplyCode() {
  return useMutation<
    ApplyCodeResponse, // Expected success response type
    Error, // Error type
    { eventId: string; code: string } // Variables type
  >({
    mutationFn: async (variables) => {
      const response = await fetch('/api/checkout/apply-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(variables),
      });

      if (!response.ok) {
        // Let react-query handle non-2xx responses as errors
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to apply code.');
      }

      return response.json();
    },
    onError: (error) => {
      // You can handle default error toasts here if you want
      console.error('Apply code mutation failed:', error);
      toast.error(error.message);
    },
  });
}
