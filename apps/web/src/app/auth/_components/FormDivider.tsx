import React from 'react';

export function FormDivider({ text = 'Or' }: { text?: string }) {
  return (
    <div className="flex items-center my-6">
      <div className="border-t border-border grow mr-3" aria-hidden="true" />
      <div className="text-muted-foreground italic text-sm">{text}</div>
      <div className="border-t border-border grow ml-3" aria-hidden="true" />
    </div>
  );
}
