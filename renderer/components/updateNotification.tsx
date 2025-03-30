'use client'

import React, { useEffect, useState } from 'react';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Download, RefreshCw, ArrowUpCircle } from 'lucide-react';

// Types for update status
type UpdateStatus = {
  status: string;
  data: any;
};

export const UpdateNotification: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReadyToInstall, setIsReadyToInstall] = useState(false);

  useEffect(() => {
    // Subscribe to update events from the main process
    const removeListener = window.ipc.onUpdateStatus((status: UpdateStatus) => {
      console.log('Update status:', status);
      setUpdateStatus(status);

      if (status.status === 'update-available') {
        setShowDialog(true);
        setIsDownloading(false);
        setIsReadyToInstall(false);
      } else if (status.status === 'download-progress') {
        setIsDownloading(true);
        setDownloadProgress(status.data?.percent || 0);
      } else if (status.status === 'update-downloaded') {
        setIsDownloading(false);
        setIsReadyToInstall(true);
        setShowDialog(true);
      }
    });

    // Check for updates when component mounts
    // window.ipc.checkForUpdates();

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  const handleDownload = () => {
    setIsDownloading(true);
    window.ipc.downloadUpdate();
  };

  const handleInstall = () => {
    window.ipc.installUpdate();
  };

  // No update notification when there's no update
  if (!updateStatus || updateStatus.status === 'update-not-available') {
    return null;
  }

  return (
    <>
      {/* Fixed banner at bottom when update is available but dialog is closed */}
      {(updateStatus.status === 'update-available' || isReadyToInstall || isDownloading) && !showDialog && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-primary/20 text-primary p-3 px-4 flex items-center justify-between z-50">
          <div className="flex items-center space-x-2">
            {isReadyToInstall ? (
              <ArrowUpCircle className="h-4 w-4" />
            ) : isDownloading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="text-sm">
              {isReadyToInstall 
                ? 'Update ready to install'
                : isDownloading
                ? `Downloading update: ${Math.round(downloadProgress)}%`
                : 'Update available'}
            </span>
          </div>
          {isDownloading && (
            <Progress value={downloadProgress} className="w-1/3 mx-4 bg-primary/20" />
          )}
          <Button size="sm" onClick={() => setShowDialog(true)}>
            {isReadyToInstall ? 'Install Now' : isDownloading ? 'View Details' : 'View Details'}
          </Button>
        </div>
      )}

      {/* Update dialog */}
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isReadyToInstall 
                ? 'Update Ready to Install' 
                : 'Update Available'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isReadyToInstall 
                ? 'A new version has been downloaded. Restart the application to apply the update.' 
                : `A new version (${updateStatus?.data?.version || 'unknown'}) is available. Would you like to download it now?`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {isDownloading && (
            <div className="my-4">
              <p className="text-sm mb-2">Downloading update: {Math.round(downloadProgress)}%</p>
              <Progress value={downloadProgress} className="w-full" />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>
              {isDownloading ? 'Background' : 'Later'}
            </AlertDialogCancel>
            
            {!isDownloading && !isReadyToInstall && (
              <AlertDialogAction onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </AlertDialogAction>
            )}
            
            {isReadyToInstall && (
              <AlertDialogAction onClick={handleInstall}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Restart & Install
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UpdateNotification; 