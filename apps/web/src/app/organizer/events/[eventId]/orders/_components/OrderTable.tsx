'use client';

import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { FetchedOrder } from '../page'; // Import the type
import { type ColumnDef } from '@tanstack/react-table'; // Keep ColumnDef

// Import DataTable and Button
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  MobileCardInfoRowLarge,
  MobileCardInfoRow,
} from '@/components/ui/mobile-card-info';
// Import an icon
import { EyeIcon, User, Mail, DollarSign, Calendar } from 'lucide-react';
// Import mobile hook
import { useIsMobile } from '@/hooks/use-mobile';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import OrderDetails from './OrderDetails';

// Mobile Card View Component
function MobileCardView({
  filteredOrders,
  searchTerm,
  setSearchTerm,
  setSelectedOrder,
}: {
  filteredOrders: FetchedOrder[];
  searchTerm: string;
  setSearchTerm: (searchTerm: string) => void;
  setSelectedOrder: (order: FetchedOrder) => void;
}) {
  return (
    <div>
      <div className="mb-6">
        <Input
          placeholder="Search orders..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            {searchTerm
              ? 'No orders match your search.'
              : 'No orders found for this event.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const name =
              [order.firstName, order.lastName].filter(Boolean).join(' ') ||
              'N/A';
            const formattedAmount = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(order.subtotal);

            return (
              <Card key={order.id} className="w-full overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3 min-w-0">
                      <MobileCardInfoRowLarge icon={User} content={name} />

                      {order.email && (
                        <MobileCardInfoRow icon={Mail} content={order.email} />
                      )}

                      <MobileCardInfoRowLarge
                        icon={DollarSign}
                        iconColor="text-green-600"
                        content={formattedAmount}
                        className="font-semibold text-base text-green-600"
                      />

                      {order.createdAt && (
                        <MobileCardInfoRow
                          icon={Calendar}
                          content={format(
                            new Date(order.createdAt),
                            'MMM d, yyyy'
                          )}
                        />
                      )}

                      <div className="text-sm text-muted-foreground px-3 py-1 bg-muted rounded-md inline-block max-w-fit">
                        <span className="truncate">Order #{order.id}</span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <EyeIcon className="h-5 w-5" />
                      <span className="sr-only">View Details</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface OrderTableProps {
  initialOrders: FetchedOrder[];
}

export default function OrderTable({ initialOrders }: OrderTableProps) {
  const [selectedOrder, setSelectedOrder] = useState<FetchedOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const isMobile = useIsMobile();

  const handleDialogClose = () => {
    setSelectedOrder(null);
  };

  const columns = useMemo<ColumnDef<FetchedOrder>[]>(() => {
    const handleRowClick = (order: FetchedOrder) => {
      setSelectedOrder(order);
    };

    return [
      {
        accessorKey: 'id',
        header: 'Order ID',
        cell: ({ row }) => {
          const order = row.original;
          return <span className="font-medium">{order.id}</span>;
        },
      },
      {
        id: 'name',
        header: 'Name',
        accessorFn: (order) =>
          [order.firstName, order.lastName].filter(Boolean).join(' ') || 'N/A',
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => {
          const email = row.getValue('email') as string | null;
          return email ? (
            <a href={`mailto:${email}`} className="hover:underline">
              {email}
            </a>
          ) : (
            <span>{'N/A'}</span>
          );
        },
      },
      {
        accessorKey: 'total',
        header: () => <div className="text-right">Total</div>,
        cell: ({ row }) => {
          const amount = parseFloat(row.getValue('total'));
          const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(amount);
          return <div className="text-right font-medium">{formatted}</div>;
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Date',
        cell: ({ row }) => {
          const date = row.getValue('createdAt') as Date | null;
          return (
            <div>
              {date
                ? format(new Date(date), isMobile ? 'MM/dd/yy' : 'PPpp')
                : 'N/A'}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="text-right">
              <Button
                variant="ghost"
                size={isMobile ? 'sm' : 'icon'}
                onClick={() => handleRowClick(order)}
                className={isMobile ? 'h-9 px-3 min-w-[80px]' : ''}
              >
                <EyeIcon className="h-4 w-4" />
                {isMobile && <span className="ml-1 text-xs">View</span>}
                <span className="sr-only">View Details</span>
              </Button>
            </div>
          );
        },
      },
    ];
  }, [isMobile]);

  // Filter orders based on search term
  const filteredOrders = useMemo(() => {
    if (!searchTerm) return initialOrders;

    return initialOrders.filter((order) => {
      const name = [order.firstName, order.lastName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const email = (order.email || '').toLowerCase();
      const orderId = order.id.toLowerCase();

      const search = searchTerm.toLowerCase();
      return (
        name.includes(search) ||
        email.includes(search) ||
        orderId.includes(search)
      );
    });
  }, [initialOrders, searchTerm]);

  return (
    <>
      {isMobile ? (
        <MobileCardView
          filteredOrders={filteredOrders}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          setSelectedOrder={setSelectedOrder}
        />
      ) : (
        <DataTable
          columns={columns}
          data={initialOrders}
          filterColumnId="name"
          filterInputPlaceholder="Search by name..."
          enableColumnVisibility={true}
        />
      )}

      <Dialog
        open={!!selectedOrder}
        onOpenChange={(open) => !open && handleDialogClose()}
      >
        <DialogContent
          className={
            isMobile
              ? 'max-w-[95vw] w-full max-h-[90vh] h-auto m-4 p-0 gap-0'
              : 'sm:max-w-[600px] max-h-[85vh]'
          }
        >
          <div className={isMobile ? 'flex flex-col h-full' : ''}>
            <DialogHeader
              className={
                isMobile ? 'p-6 pb-4 border-b border-border flex-shrink-0' : ''
              }
            >
              <DialogTitle>Order Details</DialogTitle>
            </DialogHeader>
            <div
              className={
                isMobile ? 'flex-1 overflow-y-auto p-6 pt-0' : 'overflow-y-auto'
              }
            >
              {selectedOrder && <OrderDetails order={selectedOrder} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
