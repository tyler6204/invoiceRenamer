import React, { useState, useCallback, useRef } from 'react';
import { FiUpload, FiLoader } from 'react-icons/fi';
import { processFiles, Results } from '@/functions/processFile/route';
import { RenamingSettings } from '@/components/renamingSettings';

interface DragAndDropProps {
  results: Results | null;
  setResults: (results: Results) => void;
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;
  selectedModel: string;
  renamingSettings: RenamingSettings;
  setProcessingFiles: (files: File[]) => void;
}

export default function DragAndDrop({ 
  results, 
  setResults, 
  isProcessing, 
  setIsProcessing,
  selectedModel,
  renamingSettings,
  setProcessingFiles
}: DragAndDropProps) {
  const [fileList, setFileList] = useState<File[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  
  // File type validation function
  const validateFileType = (file: File): boolean => {
    const validTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/tiff',
      'image/webp'
    ];
    return validTypes.includes(file.type);
  };
  
  // Handle file processing
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setIsProcessing(true);
    
    // Convert FileList to array and filter valid files
    const filesArray = Array.from(files).filter(validateFileType);
    
    setFileList(filesArray);
    setProcessingFiles(filesArray); // Set processing files for the skeleton UI
    
    // Process the files with the selected model and renaming settings
    const results = await processFiles(filesArray, selectedModel, renamingSettings);
    
    setResults(results);
    setIsProcessing(false);
  }, [setResults, setIsProcessing, selectedModel, renamingSettings, setProcessingFiles]);
  
  // Handle native drag events with counter to handle nested elements
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragActive(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    dragCounterRef.current = 0;
    
    // Extract files from the drop event
    const files = e.dataTransfer.files;
    handleFiles(files);
  };
  
  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    handleFiles(files);
  };
  
  // Handle click on the drop area
  const handleClick = () => {
    if (!isProcessing && inputRef.current) {
      inputRef.current.click();
    }
  };
  
  return (
    <div 
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        relative border-2 border-dashed rounded-xl p-6 text-center 
        transition-all duration-200 ease-in-out
        ${isProcessing ? 'opacity-50 cursor-not-allowed disabled' : `cursor-pointer
          ${isDragActive ? 'border-primary bg-primary/5' : ''}
          ${!isDragActive ? 'hover:border-primary/50 hover:bg-muted/30' : ''}
        `}
        group
      `}
    >
      <input 
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleInputChange}
        accept=".pdf,.png,.jpg,.jpeg,.gif,.tiff,.webp"
        multiple
      />
      
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className={`
          rounded-full p-4 bg-muted
          ${isProcessing ? 'opacity-50 cursor-not-allowed disabled' : `
            group-hover:bg-primary/10 transition-colors duration-200
          `}
        `}
        >
          {isProcessing ? (
            <FiLoader className="h-6 w-6 text-primary animate-spin" />
          ) : (
            <FiUpload className={`
              h-6 w-6 text-muted-foreground  
              group-hover:text-primary`} />
          )}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-semibold tracking-tight">
            {isDragActive ? (
              'Drop to upload'
            ) : isProcessing ? (
              'Processing files...'
            ) : (
              'Drag & drop files here'
            )}
          </h3>
        </div>
      </div>
    </div>
  );
}