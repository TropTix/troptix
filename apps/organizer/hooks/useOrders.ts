import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { prodUrl } from './constants';

export function useFetchEventOrders(eventId: string, jwtToken?: string) {
  return useQuery({
    queryKey: ['order', eventId],
    queryFn: async () => {
      if (!jwtToken) {
        throw new Error('JWT token is not available');
      }

      if (!eventId) {
        throw new Error('Event ID not defined');
      }

      const response = await axios.get(
        prodUrl + `/api/organizer/orders/${eventId}`,
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        }
      );

      if (response.status !== 200) throw new Error(response.statusText);
      return response.data;
    },
  });
}
