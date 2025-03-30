import { Skeleton } from '@/components/ui/skeleton';
import React from 'react';
import { cn } from '@/lib/utils';
interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  textSize?: string;
  loading?: boolean;
}

export function CircularProgress({
  value,
  size = 120,
  strokeWidth = 8,
  textSize = '',
  loading = false,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (loading ? 0.8 : value / 100) * circumference;

  const getColor = (value: number) => {
    if (loading) return 'stroke-primary';
    if (value >= 80) return 'stroke-green-600'; 
    if (value >= 60) return 'stroke-yellow-500'; 
    return 'stroke-red-600'; 
  };

  return (
    <div className="relative inline-flex flex-col items-center">
      <div className="relative">
        <svg width={size} height={size} className={`${loading ? 'animate-spin' : 'transform -rotate-90'}`}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke="hsl(var(--muted))"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
              transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease',
            }}
            className={getColor(value)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {!loading ? (
            <span className={cn('text-base font-bold flex items-center justify-center', textSize)}>{Math.round(value)}<p className='text-[10px]'>%</p></span>
          ) : (
            <Skeleton className={cn('text-sm font-bold w-6 h-4', textSize)} />
          )}
        </div>
      </div>
    </div>
  );
}
