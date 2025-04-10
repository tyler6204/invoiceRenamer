import React, { useState, useEffect, KeyboardEvent } from 'react';
import { Results, Result } from '@/functions/processFile/route'; // Assuming Result includes originalName
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FiFolder } from 'react-icons/fi';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import path from 'path'; // Keep path for parsing in the renderer if needed (like extname/basename)
// Removed import of renameFileWithConflictResolution from fileUtils
import { sanitizeFilename } from '@/functions/fileUtils'; // Keep sanitizeFilename if needed for display/validation
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // Track which input is being edited

  useEffect(() => {
    if (results && results.results) {
        // Initialize editableResults with data from props
        // The fileLocation should already be absolute from the processFiles step
        setEditableResults(results.results);
    } else {
      setEditableResults([]);
    }
  }, [results]); // Depend only on the incoming results prop

  // Handle name change for a result *locally* while typing
  const handleNameChange = (index: number, newName: string) => {
    setEditingIndex(index); // Mark this index as being edited
    const newResults = [...editableResults];
    // Update the 'newName' property which is bound to the input value
    newResults[index] = { ...newResults[index], newName: newName };
    setEditableResults(newResults);
  };

  // Open file location (no changes needed)
  const openFile = async (fileLocation: string) => {
    if (!fileLocation || typeof fileLocation !== 'string') {
       console.error('Cannot open file: Invalid file location provided.', fileLocation);
       window.ipc.log(`[ResultsComponent] Attempted to open invalid file location: "${fileLocation}"`);
       // Optionally show a user notification here
       return;
    }
    window.ipc.log(`[ResultsComponent] Requesting to open file: "${fileLocation}"`);
    try {
      const result = await window.ipc.openFile(fileLocation);
      if (!result.success) {
        console.error('Failed to open file:', result.error);
        window.ipc.log(`[ResultsComponent] Failed to open file "${fileLocation}": ${result.error}`);
         // Optionally show a user notification here
      }
    } catch (error) {
      console.error('Error opening file:', error);
       window.ipc.log(`[ResultsComponent] Error opening file "${fileLocation}": ${error instanceof Error ? error.message : String(error)}`);
        // Optionally show a user notification here
    }
  };

  // Handle keyboard events (no changes needed, calls renameFileOnAction)
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      renameFileOnAction(index); // Trigger rename
      (event.target as HTMLInputElement).blur(); // Blur the input
    } else if (event.key === 'Escape') {
        event.preventDefault();
        // Optional: Reset the input to its original value before editing started?
        // Would need to store the original value when editing begins.
        (event.target as HTMLInputElement).blur(); // Just blur for now
    }
  };

  // Perform the actual rename via IPC when Enter is pressed or input is blurred
  const renameFileOnAction = async (index: number) => {
    setEditingIndex(null); // No longer actively editing this specific input

    const resultToRename = editableResults[index];
    const originalFileLocation = resultToRename.fileLocation; // The current *absolute* path on disk
    const desiredNewName = resultToRename.newName; // The name typed into the input

    window.ipc.log(`[ResultsComponent] Initiating rename action for index ${index}. Original path: "${originalFileLocation}", Desired name: "${desiredNewName}"`);


    if (!originalFileLocation || !desiredNewName) {
        console.error("Cannot rename: Missing original file location or desired new name.");
        window.ipc.log(`[ResultsComponent] Rename cancelled: Missing required info. Path: "${originalFileLocation}", Name: "${desiredNewName}"`);
        // Optionally reset input if needed, or show error
        return;
    }

    // Basic check if the name actually changed? (Optional)
    // const originalBaseName = path.basename(originalFileLocation, path.extname(originalFileLocation));
    // if (originalBaseName === desiredNewName) {
    //     window.ipc.log(`[ResultsComponent] Rename skipped: Name hasn't changed.`);
    //     return;
    // }


    // Extract extension from the *original* filename stored in the result,
    // or fall back to parsing the current fileLocation.
    // Using originalName is safer if fileLocation might have changed due to conflict resolution.
    const ext = path.extname(resultToRename.originalName || originalFileLocation);
    const sanitizedDesiredBaseName = sanitizeFilename(desiredNewName); // Sanitize before sending

    window.ipc.log(`[ResultsComponent] Calling resolveAndRename with originalPath="${originalFileLocation}", baseName="${sanitizedDesiredBaseName}", ext="${ext}"`);

    try {
      // *** Use the NEW IPC handler ***
      const renameOperationResult = await window.ipc.resolveAndRename(
        originalFileLocation,
        sanitizedDesiredBaseName, // Send the sanitized base name
        ext                      // Send the extension
      );

      window.ipc.log(`[ResultsComponent] IPC resolveAndRename response: ${JSON.stringify(renameOperationResult)}`);

      // --- Update Component State based on IPC result ---
      if (renameOperationResult.success && renameOperationResult.newPath) {
        // SUCCESS: Update the state with the actual new path returned by the main process
        const actualNewAbsolutePath = renameOperationResult.newPath;
        // Extract the base name from the *actual* new path for display in the input
        // This handles cases where "(1)" etc., was added during conflict resolution.
        const actualNewBaseName = path.basename(actualNewAbsolutePath, ext);

        const updatedResults = [...editableResults];
        updatedResults[index] = {
            ...updatedResults[index],
            fileLocation: actualNewAbsolutePath, // Update the stored absolute path
            newName: actualNewBaseName, // Update the name displayed in the input
            // originalName remains the same (name of the initially dropped file)
        };
        setEditableResults(updatedResults);
        window.ipc.log(`[ResultsComponent] State updated successfully for index ${index}. New path: "${actualNewAbsolutePath}", Display name: "${actualNewBaseName}"`);

      } else {
        // FAILURE: Log error, maybe notify user, and potentially reset the input field
        console.error('Failed to rename file via IPC:', renameOperationResult.error);
        window.ipc.log(`[ResultsComponent] Rename failed for index ${index}. Error: ${renameOperationResult.error}`);

        // Optional: Reset the input field back to the name derived from the *current* fileLocation
        // This prevents the input showing a name that failed to apply.
        const currentBaseName = path.basename(originalFileLocation, ext);
        const revertedResults = [...editableResults];
        revertedResults[index] = {
            ...revertedResults[index],
            newName: currentBaseName, // Reset input display value
        };
        setEditableResults(revertedResults);
        // Consider showing a toast notification to the user about the failure
      }
    } catch (error) {
      console.error('Error calling resolveAndRename IPC:', error);
      window.ipc.log(`[ResultsComponent] Error calling IPC resolveAndRename for index ${index}: ${error instanceof Error ? error.message : String(error)}`);
       // Handle error, maybe reset input as above
        const currentBaseName = path.basename(originalFileLocation, ext);
        const revertedResults = [...editableResults];
        revertedResults[index] = {
            ...revertedResults[index],
            newName: currentBaseName, // Reset input display value
        };
        setEditableResults(revertedResults);
    }
  };


  function isValidName(name: string): boolean {
    // Consider enhancing this - maybe check if sanitized name is empty?
    return name?.toLowerCase().includes("unknown") === false && sanitizeFilename(name).length > 0;
  }

  // --- Render Functions (No changes needed below this line) ---

  // Render skeleton loading state
  const renderLoadingSkeleton = () => {
    // ... (keep existing skeleton rendering logic) ...
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
    if (!editableResults || editableResults.length === 0) { // Check editableResults directly
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
            {/* Display newFiles count from original results prop if available */}
            {results && results.newFiles > 0 && (
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
                    key={result.fileLocation + index} // Use a more stable key if fileLocation can change
                    className="space-y-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      delay: index * 0.1,
                      type: "spring",
                      stiffness: 300,
                      damping: 24
                    }}
                    layout // Animate layout changes
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center mt-1 relative">
                          <Input
                            value={result.newName} // Display the editable name
                            onChange={(e) => handleNameChange(index, e.target.value)}
                            onBlur={() => {
                                // Only trigger rename on blur if the input was actually being edited
                                if (editingIndex === index) {
                                    renameFileOnAction(index);
                                }
                            }}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            className={`text-sm ${isValidName(result.newName) ? "" : "border-red-500 text-red-500"}`}
                          />
                        </div>
                      </div>

                      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => openFile(result.fileLocation)} // Use the current file location
                          className="ml-2"
                          title="Open file location"
                          disabled={!result.fileLocation} // Disable if location is invalid
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
      ) : editableResults && editableResults.length > 0 ? ( // Check editableResults for rendering
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