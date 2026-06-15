'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getFormattedCurrency } from '@/lib/utils';
import Image from 'next/image';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { CheckoutContainer } from './CheckoutContainer';
import CheckoutSteps from './checkout-steps';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart } from 'lucide-react';

interface TicketModalProps {
  event: any;
  isTicketModalOpen: boolean;
  onClose: () => void;
}

export default function TicketModal({
  event,
  isTicketModalOpen,
  onClose,
}: TicketModalProps) {
  return (
    <CheckoutContainer
      event={event}
      isOpen={isTicketModalOpen}
      onClose={onClose}
    >
      {({
        current,
        checkoutConfig,
        checkout,
        clientSecret,
        handleNext,
        handleCompleteStripePayment,
        renderCheckoutStep,
        formMethods,
        cartSubtotal,
        cartFees,
      }) => (
        <Dialog open={isTicketModalOpen} onOpenChange={onClose} modal={true}>
          <DialogContent className="sm:max-w-[1080px]">
            <DialogHeader>
              <DialogTitle>Ticket Checkout</DialogTitle>
            </DialogHeader>
            <div className="w-full">
              <div style={{ height: 650 }} className="flex mt-6">
                <div className="w-4/6 grow">
                  <div className="flex flex-col h-full px-4">
                    <div className="w-3/4 md:mx-auto mb-6">
                      <CheckoutSteps
                        current={current}
                        steps={['Tickets', 'Checkout']}
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {renderCheckoutStep()}
                    </div>
                    <div className="flex flex-end content-end items-end self-end mt-4">
                      {current === 0 && (
                        <Button
                          onClick={formMethods.handleSubmit(handleNext)}
                          className="w-full px-6 py-6 shadow-md items-center justify-center font-medium inline-flex"
                        >
                          {cartSubtotal === 0 ? 'RSVP' : 'Continue'}
                        </Button>
                      )}
                      {current === 1 && (
                        <div className="flex w-full">
                          <Button
                            onClick={handleCompleteStripePayment}
                            disabled={!clientSecret}
                            className="ml-2 w-full px-6 py-6 shadow-md items-center justify-center font-medium inline-flex"
                          >
                            Complete Purchase
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-2/6 ml-8 overflow-y-auto border-l pl-12 pr-6">
                  <div className="mx-auto text-center">
                    <div className="text-center justify-center">
                      <Image
                        height={200}
                        width={200}
                        src={
                          eventFlyerUrl(event?.imageUrl) ?? DEFAULT_EVENT_IMAGE
                        }
                        alt={event?.name || 'Event Image'}
                        style={{
                          maxHeight: 200,
                          maxWidth: 200,
                          objectFit: 'cover',
                        }}
                        className="mb-8 max-h-full flex-shrink-0 self-center object-cover overflow-hidden rounded-lg mx-auto"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-4 md:mt-4 md:mb-8 my-auto w-full">
                      {Object.keys(checkout?.tickets ?? {}).length === 0 ? (
                        <div className="mx-auto my-auto w-full text-center justify-center items-center">
                          <ShoppingCart className="h-10 w-10 mb-3 mx-auto text-muted-foreground" />
                          <div className="text-base text-muted-foreground">
                            Cart is empty
                          </div>
                        </div>
                      ) : (
                        <div>
                          <h2
                            className="text-xl font-bold leading-tighter tracking-tighter mb-4"
                            data-aos="zoom-y-out"
                          >
                            Order Summary
                          </h2>
                          <div className="space-y-3">
                            {Object.entries(checkout?.tickets ?? {}).map(
                              ([id, quantity]) => {
                                const numQuantity =
                                  typeof quantity === 'number' ? quantity : 0;
                                const ticket = checkoutConfig?.tickets.find(
                                  (t) => t.id === id
                                );
                                if (!ticket || numQuantity <= 0) return null;

                                return (
                                  <div
                                    key={id}
                                    className="flex justify-between items-center text-sm"
                                  >
                                    <span>
                                      {numQuantity} x {ticket.name}
                                    </span>
                                    <span className="font-medium">
                                      {getFormattedCurrency(
                                        ticket.price * numQuantity
                                      )}
                                    </span>
                                  </div>
                                );
                              }
                            )}
                          </div>

                          <Separator className="my-4" />

                          <div className="w-full flex my-4">
                            <div className="grow">
                              <div className="text-sm">Subtotal:</div>
                              <div className="text-sm">Taxes & Fees:</div>
                            </div>
                            <div className="ml-4">
                              <div className="ml-4">
                                <div className="text-sm text-end">
                                  {getFormattedCurrency(cartSubtotal)}
                                </div>
                                <div className="text-sm text-end">
                                  {getFormattedCurrency(cartFees)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <Separator className="my-4" />

                          <div className="w-full flex my-4">
                            <div className="grow">
                              <div className="text-xl font-bold">Total:</div>
                            </div>
                            <div className="ml-4">
                              <div className="ml-4">
                                <div className="text-xl font-bold text-end">
                                  {getFormattedCurrency(
                                    cartSubtotal + cartFees
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </CheckoutContainer>
  );
}
