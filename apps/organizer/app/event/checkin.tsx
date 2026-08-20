import { Ticket, TicketStatus } from '@/hooks/types/Ticket';
import { useFetchEventOrders } from '@/hooks/useOrders';
import { checkInTicket } from '@/hooks/useTicket';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { Incubator, TextField, ToastPresets } from 'react-native-ui-lib';
import { useAuth } from '../_layout';

type ToastSettings = {
  toastMessage?: string;
  toastPreset?: ToastPresets;
  showToast?: boolean;
};

export default function CheckInPage({ event }) {
  const { jwtToken } = useAuth();
  const [guests, setGuests] = useState<Ticket[]>([]);
  const { isLoading, isError, data, error } = useFetchEventOrders(
    event.id,
    jwtToken
  );
  const [toastSettings, setToastSettings] = useState<ToastSettings>({});
  const { mutate } = checkInTicket();
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    let guestList: Ticket[] = [];

    if (isLoading) {
      return;
    }

    data.forEach((order) => {
      const tickets = order.tickets;

      tickets.forEach((ticket) => {
        guestList.push(ticket);
      });
    });

    setGuests(guestList);
  }, [data]);

  function checkIn(ticket: Ticket, index: number) {
    let title = 'Check in guest';
    let description = `Are you sure you want to check in ${ticket?.firstName} ${ticket?.lastName}?`;
    let buttonText = 'Check In';

    if (ticket.status === TicketStatus.NOT_AVAILABLE) {
      title = 'Activate Ticket';
      description = 'Are you sure you want to activate this ticket?';
      buttonText = 'Activate Ticket';
    }

    Alert.alert(title, description, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: buttonText,
        onPress: () => {
          processCheckIn(ticket, index);
        },
      },
    ]);
  }

  function processCheckIn(guest: Ticket, index: number) {
    const updatedTicket = {
      ...guest,
      ['status']:
        !guest?.status || guest?.status === TicketStatus.NOT_AVAILABLE
          ? TicketStatus.AVAILABLE
          : TicketStatus.NOT_AVAILABLE,
    };

    setToastSettings({
      showToast: true,
      toastMessage: 'Updating Ticket...',
      toastPreset: ToastPresets.GENERAL,
    });

    mutate(
      { ticketId: updatedTicket.id || '', jwtToken },
      {
        onSuccess: (data) => {
          let oldData = guests[index];
          oldData = {
            ...guests[index],
            ...data,
          };

          const updatedGuests = guests.map((guest, i) => {
            if (guest.id === oldData.id) {
              return oldData;
            } else {
              return guest;
            }
          });

          setGuests(updatedGuests);

          setToastSettings({
            showToast: true,
            toastMessage: 'Successfully updated ticket.',
            toastPreset: ToastPresets.SUCCESS,
          });
        },
        onError: (error) => {
          setToastSettings({
            showToast: true,
            toastMessage: 'Failed to update ticket, please try again.',
            toastPreset: ToastPresets.FAILURE,
          });
          return;
        },
      }
    );
  }

  function updateToastVisibility() {
    setToastSettings((prevState) => ({
      ...prevState,
      showToast: !prevState.showToast,
    }));
  }

  function doesStringInclude(string1: string, string2: string) {
    if (!string1 || !string2) {
      return false;
    }

    return string1.toLowerCase().includes(string2.toLowerCase());
  }

  return (
    <SafeAreaView style={{ height: '100%', backgroundColor: 'white' }}>
      <Incubator.Toast
        visible={toastSettings.showToast}
        message={toastSettings.toastMessage}
        preset={toastSettings.toastPreset || ToastPresets.SUCCESS}
        backgroundColor={'black'}
        messageStyle={{ color: 'white' }}
        position="bottom"
        autoDismiss={2000}
        onDismiss={updateToastVisibility}
      />
      <View style={{ flex: 1 }}>
        <View>
          <TextField
            placeholder={'Search order number, email, or name'}
            value={searchValue}
            onChangeText={setSearchValue}
            placeholderTextColor="#999"
            containerStyle={{
              marginBlock: 8,
              marginInline: 16,
              borderColor: '#D3D3D3',
              borderRadius: 4,
              backgroundColor: '#fff',
              paddingVertical: 16,
              paddingHorizontal: 16,
              borderWidth: 1,
            }}
            showClearButton={true}
          />
        </View>
        <FlatList
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={guests.filter((guest) => {
            if (searchValue === '') {
              return true;
            } else {
              return (
                doesStringInclude(guest.id ?? '', searchValue) ||
                doesStringInclude(guest.firstName ?? '', searchValue) ||
                doesStringInclude(guest.lastName ?? '', searchValue)
              );
            }
          })}
          keyExtractor={(item) => item.id ?? ''}
          renderItem={({ item, index }) => {
            let buttonText = 'Check In';

            if (item.status === TicketStatus.NOT_AVAILABLE) {
              buttonText = 'Activate Ticket';
            }

            return (
              <View key={index}>
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 16,
                    marginInline: 16,
                  }}
                >
                  <View>
                    <View>
                      <Text>
                        Order ID: {String(item.orderId).toUpperCase()}
                      </Text>
                      <Text>Ticket ID: {String(item.id).toUpperCase()}</Text>
                      <Text
                        style={{
                          textDecorationLine:
                            item.status === TicketStatus.NOT_AVAILABLE
                              ? 'line-through'
                              : 'none',
                        }}
                      >
                        {item.firstName} {item.lastName}
                      </Text>
                      <Text
                        style={{
                          textDecorationLine:
                            item.status === TicketStatus.NOT_AVAILABLE
                              ? 'line-through'
                              : 'none',
                        }}
                      >
                        {item.email}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{ justifyContent: 'center', alignItems: 'center' }}
                    marginL-8
                  >
                    <Button
                      onPress={() => checkIn(item, index)}
                      title={buttonText}
                    />
                  </View>
                </View>
                <View
                  marginT-16
                  style={{
                    height: 1,
                    backgroundColor: '#D3D3D3',
                    marginTop: 12,
                    marginInline: 16,
                  }}
                />
              </View>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}
