/**
 * Where Global Payouts can pay by local bank transfer from a US sender, less
 * the United States, which is Connect's. The whitelist for the recipient
 * onboarding dialog (docs/plans/2026-09-global-payouts-rail.md decision 5).
 * Wire-only countries stay on the manual rail. Transcribed from Stripe's
 * recipient requirements table on 2026-09-27; add a row only from that page.
 */
export interface PayoutCountry {
  code: string;
  name: string;
  currency: string;
}

export const PAYOUT_COUNTRIES: readonly PayoutCountry[] = [
  { code: 'JM', name: 'Jamaica', currency: 'JMD' },
  { code: 'TT', name: 'Trinidad and Tobago', currency: 'TTD' },
  { code: 'DO', name: 'Dominican Republic', currency: 'DOP' },
  { code: 'CR', name: 'Costa Rica', currency: 'CRC' },
  { code: 'MX', name: 'Mexico', currency: 'MXN' },
  { code: 'PE', name: 'Peru', currency: 'PEN' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'ES', name: 'Spain', currency: 'EUR' },
  { code: 'IT', name: 'Italy', currency: 'EUR' },
  { code: 'PT', name: 'Portugal', currency: 'EUR' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' },
  { code: 'BE', name: 'Belgium', currency: 'EUR' },
  { code: 'LU', name: 'Luxembourg', currency: 'EUR' },
  { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'FI', name: 'Finland', currency: 'EUR' },
  { code: 'GR', name: 'Greece', currency: 'EUR' },
  { code: 'CY', name: 'Cyprus', currency: 'EUR' },
  { code: 'MT', name: 'Malta', currency: 'EUR' },
  { code: 'EE', name: 'Estonia', currency: 'EUR' },
  { code: 'LV', name: 'Latvia', currency: 'EUR' },
  { code: 'LT', name: 'Lithuania', currency: 'EUR' },
  { code: 'SK', name: 'Slovakia', currency: 'EUR' },
  { code: 'SI', name: 'Slovenia', currency: 'EUR' },
  { code: 'HR', name: 'Croatia', currency: 'EUR' },
  { code: 'BG', name: 'Bulgaria', currency: 'EUR' },
  { code: 'CZ', name: 'Czech Republic', currency: 'EUR' },
  { code: 'IS', name: 'Iceland', currency: 'EUR' },
  { code: 'LI', name: 'Liechtenstein', currency: 'EUR' },
  { code: 'MC', name: 'Monaco', currency: 'EUR' },
  { code: 'SM', name: 'San Marino', currency: 'EUR' },
  { code: 'CH', name: 'Switzerland', currency: 'EUR' },
  { code: 'DK', name: 'Denmark', currency: 'DKK' },
  { code: 'SE', name: 'Sweden', currency: 'SEK' },
  { code: 'NO', name: 'Norway', currency: 'NOK' },
  { code: 'PL', name: 'Poland', currency: 'PLN' },
  { code: 'HU', name: 'Hungary', currency: 'HUF' },
  { code: 'RO', name: 'Romania', currency: 'RON' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'IL', name: 'Israel', currency: 'ILS' },
  { code: 'MA', name: 'Morocco', currency: 'MAD' },
  { code: 'TN', name: 'Tunisia', currency: 'TND' },
  { code: 'SN', name: 'Senegal', currency: 'XOF' },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF' },
  { code: 'BJ', name: 'Benin', currency: 'XOF' },
];

export function findPayoutCountry(code: string): PayoutCountry | undefined {
  return PAYOUT_COUNTRIES.find((country) => country.code === code);
}
