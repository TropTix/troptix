'use client';

import React from 'react';

interface CheckoutStepsProps {
  current: number;
  steps: string[];
}

const CheckoutSteps = ({ current, steps }: CheckoutStepsProps) => {
  return (
    <div className="flex items-center justify-center space-x-4">
      {steps.map((title, index) => (
        <React.Fragment key={title}>
          <div className="flex items-center">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                index <= current
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {index + 1}
            </div>
            <span
              className={`ml-2 text-sm ${
                index === current
                  ? 'font-semibold text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              {title}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className="w-12 h-px bg-border mx-2"></div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default CheckoutSteps;
