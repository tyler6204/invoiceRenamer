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
      window.ipc.log(`[ResultsComponent useEffect] Processing ${results.results.length} results from props.`);
      
      const initialEditableResults = results.results.map((result, idx): EditableResult => {
        // Always derive initial display name from fileLocation if possible
        let initialDisplayName = 'Unknown';
        
        if (result.newName && typeof result.newName === 'string') {
          // Prefer the newName from the API result if it exists and is valid
          initialDisplayName = result.newName;
          window.ipc.log(`[ResultsComponent useEffect] Result #${idx} using provided newName: "${initialDisplayName}"`);
        } else if (result.fileLocation && typeof result.fileLocation === 'string') {
          // Fall back to extracting from fileLocation if needed
          const currentExt = path.extname(result.fileLocation);
          initialDisplayName = path.basename(result.fileLocation, currentExt);
          window.ipc.log(`[ResultsComponent useEffect] Result #${idx} derived name from fileLocation: "${initialDisplayName}"`);
        } else {
          // Last resort: use originalName's basename
          const fallbackExt = path.extname(result.originalName || 'Unknown');
          initialDisplayName = path.basename(result.originalName || 'Unknown', fallbackExt);
          window.ipc.log(`[ResultsComponent useEffect] Result #${idx} using basename from originalName: "${initialDisplayName}"`);
        }

        return {
          ...result,
          // Always ensure newName is just the basename, not a path
          newName: initialDisplayName 
        };
      }).filter(result => result.fileLocation); // Keep filtering based on fileLocation presence

      window.ipc.log(`[ResultsComponent useEffect] Initialized ${initialEditableResults.length} editable results.`);
      // Log the first result for debugging
      if (initialEditableResults.length > 0) {
        const sample = initialEditableResults[0];
        window.ipc.log(`[ResultsComponent useEffect] Sample - newName: "${sample.newName}", fileLocation: "${sample.fileLocation}"`);
      }

      setEditableResults(initialEditableResults);
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

    const originalFileLocation = resultToRename.fileLocation; // The current absolute path from state
    const desiredNewName = resultToRename.newName; // The name typed into the input (base name only)

    window.ipc.log(`[ResultsComponent renameFileOnAction index ${index}] Initiating. Original path: "${originalFileLocation}", Desired base name: "${desiredNewName}"`);

    // --- Pre-IPC Validation ---
    if (!originalFileLocation || typeof originalFileLocation !== 'string' || !path.isAbsolute(originalFileLocation)) {
       const errorMsg = `Cannot rename: Invalid or non-absolute original file location state: "${originalFileLocation}"`;
       console.error(errorMsg); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
       toast.error("Rename Error", { description: `Invalid file path.` }); 
       resetInputState(index, originalFileLocation); // Reset input on validation failure
       return;
    }

    // First check if the file exists at the current location
    try {
      const existsResult = await window.ipc.checkFileExists(originalFileLocation);
      if (!existsResult.exists) {
        window.ipc.log(`[ResultsComponent renameFileOnAction] File doesn't exist at path: "${originalFileLocation}"`);
        toast.error("Rename Error", { description: `File not found at current location.` });
        return;
      }
    } catch (error) {
      console.error("Error checking file existence:", error);
      window.ipc.log(`[ResultsComponent] Error checking existence: ${error.message}`);
      toast.error("Rename Error", { description: `Error checking file: ${error.message}` });
      return;
    }

    if (!desiredNewName || typeof desiredNewName !== 'string' || desiredNewName.trim().length === 0) {
       const errorMsg = `Cannot rename: Desired name is empty or invalid.`;
       console.error(errorMsg); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
       toast.error("Rename Error", { description: "Filename cannot be empty." });
       resetInputState(index, originalFileLocation); // Reset input
       return;
    }
    // Extract the extension from the *current* file location
    const ext = path.extname(originalFileLocation); 
    // Sanitize the desired base name from the input
    const sanitizedDesiredBaseName = sanitizeFilename(desiredNewName); 
    if (!sanitizedDesiredBaseName || sanitizedDesiredBaseName.trim().length === 0) {
       const errorMsg = `Cannot rename: Sanitized name is empty or invalid for desired name "${desiredNewName}".`;
       console.error(errorMsg); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
       toast.error("Rename Error", { description: "Invalid characters in filename." }); 
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
        // Derive the actual base name from the path returned by IPC (handles conflicts like "(1)")
        const actualNewExt = path.extname(actualNewAbsolutePath); 
        const actualNewBaseName = path.basename(actualNewAbsolutePath, actualNewExt);

        setEditableResults(currentResults =>
            currentResults.map((res, i) =>
                i === index
                ? {
                    ...res,
                    fileLocation: actualNewAbsolutePath, // Update the stored absolute path
                    newName: actualNewBaseName,         // Update the display name to the actual resulting base name
                  }
                : res
            )
        );
        window.ipc.log(`[ResultsComponent renameFileOnAction index ${index}] State updated successfully. New path: "${actualNewAbsolutePath}", Display name: "${actualNewBaseName}"`);
        toast.success("Rename Successful", {
          id: toastId, // Update the loading toast
          description: `Renamed to ${actualNewBaseName}`
        });

      } else {
        // FAILURE reported by IPC: Log, notify, reset input state
        const errorMsg = `Failed to rename file via IPC: ${renameOpResult.error || 'Unknown IPC error'}`; 
        console.error(errorMsg); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
        toast.error("Rename Failed", {
          id: toastId, // Update the loading toast
          // Show just the basename and error
          description: `${path.basename(originalFileLocation)}: ${renameOpResult.error || 'Could not rename the file.'}` 
        });
        resetInputState(index, originalFileLocation); // Reset input to original basename
      }
    } catch (error: any) {
      const errorMsg = `Error calling resolveAndRename IPC: ${error.message}`;
      console.error(errorMsg, error); window.ipc.log(`[ResultsComponent] ${errorMsg}`);
      toast.error("Rename Error", {
          id: toastId,
          description: `Failed to rename: ${error.message}`
      });
      resetInputState(index, originalFileLocation); // Reset input state
   }
 }, [editableResults, editingIndex]); // Remove resetInputState from dependencies to avoid circular reference

  // --- Helper Functions ---

  // Resets the display name for a given index back to the basename of its current fileLocation
  const resetInputState = useCallback((index: number, currentFileLocation: string) => {
     if (!currentFileLocation || typeof currentFileLocation !== 'string') return; // Safety check
     
     // Always extract just the basename, never use the full path
     const currentExt = path.extname(currentFileLocation);
     const currentBaseName = path.basename(currentFileLocation, currentExt);
     
     window.ipc.log(`[ResultsComponent resetInputState] Index ${index}: Resetting to basename "${currentBaseName}" from "${currentFileLocation}"`);
     
     setEditableResults(currentResults =>
        currentResults.map((res, i) =>
          i === index ? { ...res, newName: currentBaseName } : res
        )
     );
  }, []);


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
                      {/* Input Field - Display only the basename in newName */}
                      <div className="flex-grow min-w-0">
                        <Input
                          value={result.newName} // Display ONLY the base filename from state
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