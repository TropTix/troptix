export type User = {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;

  firstName?: string;
  lastName?: string;
  email?: string;
  stripeId?: string;
  role?: Role;
  isOrganizer?: boolean;
  telephoneNumber?: string;
  billingAddress1?: string;
  billingAddress2?: string;
  billingCity?: string;
  billingCountry?: string;
  billingZip?: string;
  billingState?: string;
};

enum Role {
  PATRON,
  ORGANIZER,
}
