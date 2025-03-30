import React, { useState, useEffect, KeyboardEvent } from 'react';
import { Results, Result } from '@/functions/processFile/route';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FiFolder } from 'react-icons/fi';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import path from 'path';
import { renameFileWithConflictResolution } from '@/functions/fileUtils';
import { motion, AnimatePresence } from 'framer-motion';

interface ResultsComponentProps {
  results: Results | null;
  isProcessing?: boolean;
  processingCount?: number;
}

export default function ResultsComponent({ 
  results, 
  isProcessing = false, 
  processingCount = 0 
}: ResultsComponentProps) {
  const [editableResults, setEditableResults] = useState<Result[]>([]);

  useEffect(() => {
    if (results && results.results) {
      // Ensure we're working with results that have absolute paths
      const processResults = async () => {
        const processed = await Promise.all(results.results.map(async (result) => {
          // If the path looks relative (starts with ./ or is not an absolute path)
          if (result.fileLocation.startsWith('./') || !path.isAbsolute(result.fileLocation)) {
            try {
              return { ...result, fileLocation: '' };
            } catch (error) {
              console.error('Error getting absolute path:', error);
              return result;
            }
          }
          return result;
        }));
        
        setEditableResults(processed);
      };
      
      processResults();
    } else {
      setEditableResults([]);
    }
  }, [results]);

  // Handle name change for a result
  const handleNameChange = (index: number, newName: string) => {
    const newResults = [...editableResults];
    newResults[index].newName = newName;
    setEditableResults(newResults);
  };

  // Open file location
  const openFile = async (fileLocation: string) => {
    try {
      const result = await window.ipc.openFile(fileLocation);
      if (!result.success) {
        console.error('Failed to open file:', result.error);
      }
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };

  // Handle keyboard events
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      renameFile(index);
      // Blur the input to unfocus after Enter
      (event.target as HTMLInputElement).blur();
    }
  };

  // Rename file
  const renameFile = async (index: number) => {
    const result = editableResults[index];
    
    if (!result.fileLocation || !result.newName) return;
    
    const ext = path.extname(result.originalName);
    
    try {
      // Use the utility function to rename the file
      const renameResult = await renameFileWithConflictResolution(
        result.fileLocation, 
        result.newName, 
        ext
      );
      
      if (renameResult.success) {
        // Extract just the filename without path for display
        const newPathWithExt = renameResult.newPath || result.fileLocation;
        const newFileName = path.basename(newPathWithExt, ext);
        
        // Update the file location and name in our state
        const newResults = [...editableResults];
        newResults[index].fileLocation = newPathWithExt;
        newResults[index].newName = newFileName;
        setEditableResults(newResults);
      }
    } catch (error) {
      console.error('Error renaming file:', error);
    }
  };


  function isValidName(name: string): boolean {
    return !name.toLowerCase().includes("unknown");
  }

  // Render skeleton loading state
  const renderLoadingSkeleton = () => {
    // Create an array with the length of processing files count
    const skeletonCount = processingCount > 0 ? processingCount : 3;
    return (
      <>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">Processing Files</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {skeletonCount} file{skeletonCount === 1 ? '' : 's'}
            </Badge>
          </div>
        </div>
        <div className="space-y-8">
          <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-4">
                {Array.from({ length: skeletonCount }).map((_, index) => (
                  <motion.div 
                    key={index} 
                    className="space-y-2"
                    initial={{ opacity: 0}}
                    animate={{ opacity: 1 }}
                    transition={{ 
                      delay: index * 0.1,
                      type: "spring", 
                      stiffness: 300, 
                      damping: 24
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center mt-1 relative">
                          <motion.div
                            animate={{ 
                              opacity: [0.6, 1, 0.6],
                              transition: {
                                duration: 1.5,
                                repeat: Infinity,
                                repeatType: "loop"
                              }
                            }}
                            className="w-full"
                          >
                            <Skeleton className="h-9 w-full" />
                          </motion.div>
                        </div>
                      </div>
                      <motion.div
                        animate={{ 
                          opacity: [0.6, 1, 0.6],
                          transition: {
                            duration: 1.5,
                            repeat: Infinity,
                            repeatType: "loop"
                          }
                        }}
                      >
                        <Skeleton className="h-9 w-9 ml-2" />
                      </motion.div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  };

  // Content for the results view
  const renderResults = () => {
    if (!results || !results.results || results.results.length === 0) {
      return null;
    }

    return (
      <>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">Processed Files</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {editableResults.length} invoice{editableResults.length === 1 ? '' : 's'}
            </Badge>
            {results.newFiles > 0 && (
              <Badge variant="outline" className="text-green-500">
                {results.newFiles} new
              </Badge>
            )}
          </div>
        </div>
        <div className="space-y-8">
          <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-4">
                {editableResults.map((result, index) => (
                  <motion.div 
                    key={index} 
                    className="space-y-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ 
                      delay: index * 0.1,
                      type: "spring", 
                      stiffness: 300, 
                      damping: 24
                    }}
                    layout
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center mt-1 relative">
                          <Input
                            value={result.newName}
                            onChange={(e) => handleNameChange(index, e.target.value)}
                            onBlur={() => renameFile(index)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            className={`text-sm ${isValidName(result.newName) ? "" : "border-red-500 text-red-500"}`}
                          />
                        </div>
                      </div>
                      
                      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => openFile(result.fileLocation)}
                          className="ml-2"
                          title="Open file location"
                        >
                          <FiFolder className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  };

  return (
    <AnimatePresence mode="wait">
      {isProcessing ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {renderLoadingSkeleton()}
        </motion.div>
      ) : results && results.results && results.results.length > 0 ? (
        <motion.div
          key="results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0}}
          transition={{ duration: 0.15 }}
        >
          {renderResults()}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
