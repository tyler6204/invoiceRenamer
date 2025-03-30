'use client'

import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Lock } from 'lucide-react';
import { APP_PASSWORD } from '../lib/apiKeys';
interface AuthCheckProps {
  children: React.ReactNode;
}

export const AuthCheck: React.FC<AuthCheckProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showDialog, setShowDialog] = useState(true);

  useEffect(() => {
    // Check if we're already authenticated in this session
    const authState = sessionStorage.getItem('isAuthenticated');
    if (authState === 'true') {
      setIsAuthenticated(true);
      setShowDialog(false);
    }
  }, []);

  const handleAuthenticate = async () => {
    try {
      // Get the correct password from the main process
      const correctPassword = APP_PASSWORD

      if (correctPassword === password) {
        setIsAuthenticated(true);
        setShowDialog(false);
        sessionStorage.setItem('isAuthenticated', 'true');
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch (error) {
      setError('Authentication error. Please try again.');
      console.error('Auth error:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuthenticate();
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <>
      <div className={`${isAuthenticated ? '' : 'blur-xs disabled'}`}>
        {children}
      </div>
      <AlertDialog open={showDialog} onOpenChange={() => {}}>
        <AlertDialogContent className="sm:max-w-md ">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Invoice Renamer Authentication
            </AlertDialogTitle>
            <AlertDialogDescription>
              Please enter the password to access the application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Input
              id="password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full"
            />
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>
          
          <AlertDialogFooter>
            <Button type="submit" onClick={handleAuthenticate}>
              Authenticate
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AuthCheck; 