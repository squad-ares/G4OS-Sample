import type * as React from 'react';
import { cn } from '../libs/utils.ts';
import { useTranslate } from '../translate/translate-provider.tsx';

export interface SpinnerProps extends React.HTMLAttributes<SVGSVGElement> {
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 'size-4', md: 'size-6', lg: 'size-8' };

export function Spinner({ className, size = 'md', ...props }: Readonly<SpinnerProps>) {
  const { t } = useTranslate();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin text-current', sizeMap[size], className)}
      aria-label={t('ui.spinner.loading')}
      aria-live="polite"
      {...props}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
