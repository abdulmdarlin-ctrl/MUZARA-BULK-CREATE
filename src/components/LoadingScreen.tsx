import React, { useEffect, useState } from 'react';

interface LoadingScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  onComplete, 
  minDuration = 1500 
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    
    // Simulate loading progress
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progressPercent = Math.min((elapsed / minDuration) * 100, 100);
      setProgress(progressPercent);
      
      if (elapsed >= minDuration) {
        clearInterval(progressInterval);
        setTimeout(() => {
          setIsVisible(false);
          onComplete?.();
        }, 300);
      }
    }, 50);

    return () => clearInterval(progressInterval);
  }, [minDuration, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="relative">
        {/* Animated Logo/Icon */}
        <div className="relative mb-8">
          <div className="w-20 h-20 mx-auto relative">
            {/* Outer rotating ring */}
            <div className="absolute inset-0 border-2 border-blue-500/20 rounded-full animate-spin" />
            
            {/* Middle rotating ring */}
            <div className="absolute inset-2 border-2 border-purple-500/30 rounded-full animate-spin" style={{ animationDirection: 'reverse' }} />
            
            {/* Inner pulsing circle */}
            <div className="absolute inset-4 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full animate-pulse" />
            
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-white animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Loading Text */}
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            PDF BULK GENERATOR
          </h1>
          
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          
          <p className="text-sm text-gray-400 animate-pulse">
            Initializing application...
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mt-8 w-64">
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-center">
            <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Loading Features */}
        <div className="mt-8 space-y-2 text-xs text-gray-600">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${progress > 25 ? 'bg-green-500' : 'bg-gray-700'}`} />
            <span>Loading fonts...</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${progress > 50 ? 'bg-green-500' : 'bg-gray-700'}`} />
            <span>Initializing components...</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${progress > 75 ? 'bg-green-500' : 'bg-gray-700'}`} />
            <span>Preparing workspace...</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${progress > 90 ? 'bg-green-500' : 'bg-gray-700'}`} />
            <span>Almost ready...</span>
          </div>
        </div>
      </div>

      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-blue-500/3 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>
    </div>
  );
};

// Simple loading spinner component
export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ 
  size = 'md', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`animate-spin ${sizeClasses[size]} ${className}`}>
      <svg className="w-full h-full text-current" fill="none" viewBox="0 0 24 24">
        <circle 
          className="opacity-25" 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="4"
        />
        <path 
          className="opacity-75" 
          fill="currentColor" 
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};

// Skeleton loading component
export const Skeleton: React.FC<{ 
  className?: string; 
  children?: React.ReactNode;
  lines?: number;
}> = ({ className = '', children, lines = 3 }) => {
  if (children) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="bg-gray-700 rounded h-4 w-3/4 mb-2" />
        <div className="bg-gray-700 rounded h-4 w-1/2 mb-2" />
        <div className="bg-gray-700 rounded h-4 w-2/3" />
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div 
            className="bg-gray-700 rounded" 
            style={{ 
              height: '16px', 
              width: `${Math.random() * 40 + 60}%` 
            }} 
          />
        </div>
      ))}
    </div>
  );
};
