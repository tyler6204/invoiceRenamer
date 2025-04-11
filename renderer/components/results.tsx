import React, { useState, useEffect, KeyboardEvent, useCallback } from 'react';
import { Results, Result } from '@/functions/processFile/route'; // Assuming Result includes originalName
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FiFolder } from 'react-icons/fi';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import path from 'path'; // Keep path for parsing in the renderer
import { sanitizeFilename } from '@/functions/fileUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from "sonner"


interface ResultsComponentProps {
  results: Results | null;
  isProcessing?: boolean;
  processingCount?: number;
}

// Define a type for the editable state, ensuring newName is always present
interface EditableResult extends Result {
  newName: string; // Ensure newName is part of the type for state
}

export default function ResultsComponent({
  results,
  isProcessing = false,
  processingCount = 0
}: ResultsComponentProps) {
  const [editableResults, setEditableResults] = useState<EditableResult[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // --- State Initialization and Synchronization ---
  useEffect(() => {
    if (results && results.results) {
      const initialEditableResults = results.results.map((result): EditableResult => {
        // Determine the initial display name from the current file location's basename
        const currentExt = path.extname(result.fileLocation || result.originalName || 'Unknown');
        const currentBaseName = path.basename(result.fileLocation || 'Unknown', currentExt);
        return {
          ...result,
          // Ensure the initial display name matches the basename of the actual file location
          // Fallback to 'Unknown' if location is somehow invalid
          newName: result.fileLocation ? currentBaseName : 'Unknown'
        };
      }).filter(result => result.fileLocation); // Filter out results without a valid location initially

      setEditableResults(initialEditableResults);
      window.ipc.log(`[ResultsComponent useEffect] Initialized ${initialEditableResults.length} editable results.`);

    } else {
      setEditableResults([]); // Clear results if props are null/empty
    }
  }, [results]); // Re-run only when the 'results' prop changes


  // --- UI Event Handlers ---

  // Update local state while typing in the input
  const handleNameChange = useCallback((index: number, desiredName: string) => {
    setEditingIndex(index); // Mark as actively editing
    setEditableResults(currentResults =>
      currentResults.map((res, i) =>
        i === index ? { ...res, newName: desiredName } : res
      )
    );
  }, []); // No dependencies needed if only using index/value from event


  // Open the file's containing folder
  const openFile = useCallback(async (fileLocation: string) => {
    if (!fileLocation || typeof fileLocation !== 'string' || !path.isAbsolute(fileLocation)) {
       const errorMsg = `Cannot open file: Invalid or non-absolute path provided: "${fileLocation}"`;
       console.error(errorMsg);
       window.ipc.log(`[ResultsComponent] ${errorMsg}`);
       toast.error("Error Opening File", { description: "Cannot open file location: Invalid path." });
       return;
    }

    window.ipc.log(`[ResultsComponent] Requesting to open file location: "${fileLocation}"`);
    try {
      const result = await window.ipc.openFile(fileLocation); // Assumes openFile opens the directory/file
      if (!result.success) {
        const errorMsg = `Failed to open file location "${fileLocation}": ${result.error || 'Unknown error'}`;
        console.error(errorMsg);
        window.ipc.log(`[ResultsComponent] ${errorMsg}`);
        toast.error("Error Opening File", { description: result.error || 'Could not open the file location.' });
      }
    } catch (error: any) {
      const errorMsg = `Error opening file location "${fileLocation}": ${error.message}`;
      console.error(errorMsg, error);
      window.ipc.log(`[ResultsComponent] ${errorMsg}`);
      toast.error("Error", { description: "An unexpected error occurred while trying to open the file location." });
    }
  }, [toast]); // Include toast if used


  // Handle Enter/Escape keys in the input
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      renameFileOnAction(index); // Trigger rename
      event.currentTarget.blur(); // Blur the input
    } else if (event.key === 'Escape') {
        event.preventDefault();
        event.currentTarget.blur(); // Just blur - renameFileOnAction will handle reset if needed on blur
    }
  }, []); // renameFileOnAction doesn't need to be dependency if wrapped in useCallback


  // --- Core Rename Logic ---

  // Called on Enter or Blur to perform the rename via IPC
  const renameFileOnAction = useCallback(async (index: number) => {
    if (editingIndex !== index) {
        // If blurring an input that wasn't the one actively being edited, do nothing.
        return;
    }
    setEditingIndex(null); // Reset editing state regardless of outcome

    const resultToRename = editableResults[index];
    if (!resultToRename) {
        window.ipc.log(`[ResultsComponent renameFileOnAction] Error: No result found at index ${index}.`);
        return; // Should not happen
    }

    const originalFileLocation = resultToRename.fileLocation; // The known path *before* this rename attempt
    const desiredNewName = resultToRename.newName; // The name typed into the input

    window.ipc.log(`[ResultsComponent renameFileOnAction index ${index}] Initiating. Original path: "${originalFileLocation}", Desired name: "${desiredNewName}"`);

    // --- Pre-IPC Validation ---
    if (!originalFileLocation || typeof originalFileLocation !== 'string' || !path.isAbsolute(originalFileLocation)) {
       const errorMsg = `Cannot rename: Invalid or non-absolute original file location: "${originalFileLocation}"`;
       console.error(errorMsg); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
       toast.error("Rename Error", { description: "Invalid characters in filename." }); // Use sonner
       resetInputState(index, originalFileLocation); // Reset input on validation failure
       return;
    }
     if (!desiredNewName) {
       const errorMsg = `Cannot rename: Desired name is empty.`;
       console.error(errorMsg); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
       resetInputState(index, originalFileLocation); // Reset input
       return;
    }
    const ext = path.extname(resultToRename.originalName || originalFileLocation); // Get extension
    const sanitizedDesiredBaseName = sanitizeFilename(desiredNewName);
     if (!sanitizedDesiredBaseName) {
       const errorMsg = `Cannot rename: Sanitized name is empty for desired name "${desiredNewName}".`;
       console.error(errorMsg); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
       toast.error("Rename Error", { description: "Invalid characters in filename." }); // Use sonner
       resetInputState(index, originalFileLocation); // Reset input
       return;
    }
     // Optional: Check if name actually changed (ignoring case might be useful)
     const originalBaseName = path.basename(originalFileLocation, path.extname(originalFileLocation));
     if (originalBaseName === sanitizedDesiredBaseName) {
         window.ipc.log(`[ResultsComponent renameFileOnAction index ${index}] Rename skipped: Name unchanged.`);
         return; // No need to call IPC if the name didn't change
     }
    // --- End Validation ---


    window.ipc.log(`[ResultsComponent renameFileOnAction index ${index}] Calling IPC resolveAndRename: originalPath="${originalFileLocation}", baseName="${sanitizedDesiredBaseName}", ext="${ext}"`);
    
      // Add a loading toast
      const toastId = toast.loading("Renaming file...", {
        description: `${sanitizedDesiredBaseName}${ext}`
    });

    try {
    
      const renameOpResult = await window.ipc.resolveAndRename(
        originalFileLocation,
        sanitizedDesiredBaseName,
        ext
      );
      window.ipc.log(`[ResultsComponent renameFileOnAction index ${index}] IPC response: ${JSON.stringify(renameOpResult)}`);

      // --- Update State Based on IPC Result ---
      if (renameOpResult.success && renameOpResult.newPath) {
        // SUCCESS: Update state with the actual new path and derived name
        const actualNewAbsolutePath = renameOpResult.newPath;
        const actualNewExt = path.extname(actualNewAbsolutePath);
        const actualNewBaseName = path.basename(actualNewAbsolutePath, actualNewExt);

        setEditableResults(currentResults =>
            currentResults.map((res, i) =>
                i === index
                ? {
                    ...res,
                    fileLocation: actualNewAbsolutePath, // Update the stored absolute path
                    newName: actualNewBaseName,         // Update the display name
                  }
                : res
            )
        );
        window.ipc.log(`[ResultsComponent renameFileOnAction index ${index}] State updated successfully. New path: "${actualNewAbsolutePath}", Display name: "${actualNewBaseName}"`);
        toast.success("Rename Successful", {
          id: toastId, // Update the loading toast
          description: `Renamed to ${actualNewBaseName}${actualNewExt}`
      });

      } else {
        // FAILURE reported by IPC: Log, notify, reset input state
        const errorMsg = `Failed to rename file via IPC: ${renameOpResult.error || 'Unknown IPC error'}`;
        console.error(errorMsg); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
        toast.error("Rename Failed", {
          id: toastId, // Update the loading toast
          description: renameOpResult.error || 'Could not rename the file.'
      });
      resetInputState(index, originalFileLocation); // Reset input to original basename
      }
    } catch (error: any) {
      const errorMsg = `Error calling resolveAndRename IPC: ${error.message}`;
      console.error(errorMsg, error); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
     // Use sonner toast for error, potentially update loading toast if it exists (might need to dismiss manually)
      toast.error("Rename Error", {
          // If toastId was created, update it, otherwise create new error toast
          ...(toastId && { id: toastId }),
          description: "An unexpected error occurred."
      });
      resetInputState(index, originalFileLocation); // Reset input state
   }
 }, [editableResults, editingIndex]); // Removed toast dependency

  // --- Helper Functions ---

  // Resets the display name for a given index back to the basename of its current fileLocation
  const resetInputState = useCallback((index: number, currentFileLocation: string) => {
     if (!currentFileLocation) return; // Safety check
     const currentExt = path.extname(currentFileLocation);
     const currentBaseName = path.basename(currentFileLocation, currentExt);
     setEditableResults(currentResults =>
        currentResults.map((res, i) =>
          i === index ? { ...res, newName: currentBaseName } : res
        )
     );
     window.ipc.log(`[ResultsComponent resetInputState index ${index}] Reverted display name to "${currentBaseName}".`);
  }, []); // No dependencies


  // Check if the name is valid for display styling (e.g., not 'Unknown')
  const isValidName = useCallback((name: string): boolean => {
    return name?.toLowerCase().includes("unknown") === false && sanitizeFilename(name).length > 0;
  }, []); // No dependencies needed


  // --- Rendering ---

  // Render skeleton loading state
  const renderLoadingSkeleton = () => {
    const skeletonCount = processingCount > 0 ? processingCount : 3;
    return (
      <>
        {/* ... (keep existing skeleton rendering logic - seems okay) ... */}
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
                {Array.from({ length: skeletonCount }).map((_, i) => (
                  <motion.div key={`skeleton-${i}`} /* ... other props ... */ >
                     {/* ... skeleton content ... */}
                     <div className="flex items-center space-x-3">
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center mt-1 relative">
                          <motion.div /* ... other props ... */ className="w-full">
                            <Skeleton className="h-9 w-full" />
                          </motion.div>
                        </div>
                      </div>
                      <motion.div /* ... other props ... */>
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

  // Render the list of results with editable inputs
  const renderResults = () => {
    if (!editableResults || editableResults.length === 0) {
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
                    // Using fileLocation + index might still cause issues if location changes AND order changes.
                    // Consider a truly unique ID if possible, otherwise this is often sufficient.
                    key={result.fileLocation + '-' + result.originalName + '-' + index}
                    className="space-y-2"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 24 }}
                    layout // Animate layout changes
                  >
                    <div className="flex items-center space-x-3">
                      {/* Input Field */}
                      <div className="flex-grow min-w-0">
                        <Input
                          value={result.newName} // Display the editable name from state
                          onChange={(e) => handleNameChange(index, e.target.value)}
                          onFocus={() => setEditingIndex(index)} // Set editing index on focus
                          onBlur={() => {
                              // Trigger rename on blur *only if* this was the item being edited
                              if (editingIndex === index) {
                                renameFileOnAction(index);
                              }
                           }}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          className={`text-sm ${isValidName(result.newName) ? "" : "border-red-500 text-red-500"}`}
                          aria-label={`Edit filename for ${result.originalName}`}
                        />
                      </div>
                      {/* Open Folder Button */}
                      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => openFile(result.fileLocation)}
                          className="ml-2 flex-shrink-0" // Prevent button from shrinking
                          title="Open file location"
                          disabled={!result.fileLocation} // Disable if location is invalid
                          aria-label={`Open location for ${result.originalName}`}
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

  // --- Component Return ---
  return (
     // Need to ensure Toaster is rendered somewhere in your app layout (e.g., near root)
    <AnimatePresence mode="wait">
      {isProcessing ? (
        <motion.div key="loading" /* ... transition props ... */ >
          {renderLoadingSkeleton()}
        </motion.div>
      ) : editableResults && editableResults.length > 0 ? (
        <motion.div key="results" /* ... transition props ... */ >
          {renderResults()}
        </motion.div>
      ) : null // Render nothing if not processing and no results
      }
    </AnimatePresence>
  );
}