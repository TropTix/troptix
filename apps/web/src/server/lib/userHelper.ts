import { Prisma } from '@/generated/prisma/client';

export function getPrismaUpdateSocialMediaQuery(account) {
  let socialMedia: Prisma.SocialMediaAccountsUpdateInput;

  socialMedia = {
    id: account.id,
    socialMediaAccountType: account.socialMediaAccountType,
    link: account.link,
    user: {
      connect: {
        id: account.userId,
      },
    },
  };

  return socialMedia;
}

export function getPrismaUpdateUserQuery(account) {
  let user: Prisma.UsersUpdateInput;

  user = {
    firstName: account.firstName,
    lastName: account.lastName,
    telephoneNumber: account.telephoneNumber,
    billingAddress1: account.billingAddress1,
    billingAddress2: account.billingAddress2,
    billingCity: account.billingCity,
    billingCountry: account.billingCountry,
    billingZip: account.billingZip,
    billingState: account.billingState,
  };

  return user;
}

export function getPrismaCreateUserQuery(account) {
  let user: Prisma.UsersCreateInput;

  user = {
    id: account.id,
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
  };

  return user;
}
