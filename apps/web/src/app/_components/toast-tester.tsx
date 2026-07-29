'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

function ToastTester() {
  const [toastType, setToastType] = useState<ToastType>('success');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);

  const getDefaultMessage = (type: ToastType): string => {
    return `Test Toast ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  };

  useEffect(() => {
    setCustomMessage(getDefaultMessage(toastType));
    setCustomDescription(
      toastType === 'loading' ? 'Test Toast Loading Description' : ''
    );
  }, [toastType]);

  const handleShowToast = () => {
    const message = customMessage || getDefaultMessage(toastType);
    const description = customDescription;

    const toastOptions = description ? { description } : {};

    switch (toastType) {
      case 'success':
        toast.success(message, toastOptions);
        break;
      case 'error':
        toast.error(message, toastOptions);
        break;
      case 'warning':
        toast.warning(message, toastOptions);
        break;
      case 'info':
        toast.info(message, toastOptions);
        break;
      case 'loading':
        toast.loading(message, { description });
        break;

      default:
        const exhaustiveCheck: never = toastType;
        console.error(`Unhandled toast type: ${exhaustiveCheck}`);
    }
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="fixed bottom-0 left-0 m-4 space-y-2"
    >
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-40 justify-between">
          {' '}
          <span>Test Toasts</span>
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 w-60 rounded-md border p-4 pt-2 shadow-sm">
        {' '}
        <Select
          value={toastType}
          onValueChange={(value: ToastType) => setToastType(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select toast type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="loading">Loading</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="text"
          placeholder="Toast Message"
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
        />
        <Input
          type="text"
          placeholder="Toast Description (optional)"
          value={customDescription}
          onChange={(e) => setCustomDescription(e.target.value)}
        />
        <Button onClick={handleShowToast} className="w-full">
          Show Toast
        </Button>{' '}
        <Button
          onClick={() => toast.dismiss()}
          variant="outline"
          className="w-full"
        >
          {' '}
          Dismiss All
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default ToastTester;
