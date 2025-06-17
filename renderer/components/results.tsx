import React, { useState, useEffect, KeyboardEvent, useCallback } from 'react';
import { Results, Result } from '@/functions/processFile/route'; // Assuming Result includes originalName
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FiFolder } from 'react-icons/fi';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
      const initialEditableResults = results.results.map((result, idx): EditableResult => {
        // Always derive initial display name from fileLocation if possible
        let initialDisplayName = 'Unknown';
        
        if (result.newName && typeof result.newName === 'string') {
          // If the newName contains a path separator (/ or \), extract just the filename portion
          initialDisplayName = result.newName.replace(/^.*[\\\/]/, ''); // Extract filename from path
        } else if (result.fileLocation && typeof result.fileLocation === 'string') {
          // Extract just the filename portion from the absolute path
          initialDisplayName = result.fileLocation.replace(/^.*[\\\/]/, '');
          // Also remove the extension from the display name
          initialDisplayName = initialDisplayName.replace(/\.[^/.]+$/, "");
        } else {
          // Last resort: extract from originalName
          initialDisplayName = result.originalName ? result.originalName.replace(/^.*[\\\/]/, '') : 'Unknown';
          initialDisplayName = initialDisplayName.replace(/\.[^/.]+$/, ""); // Remove extension
        }

        return {
          ...result,
          // Always ensure newName is just the basename, not a path
          newName: initialDisplayName 
        };
      }).filter(result => result.fileLocation); // Keep filtering based on fileLocation presence

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
    if (!fileLocation || typeof fileLocation !== 'string') {
       const errorMsg = `Cannot open file: Invalid or missing path: "${fileLocation}"`;
       console.error(errorMsg);
       toast.error("Error Opening File", { description: "Cannot open file: Invalid path." });
       return;
    }

    // Check if the path is absolute (Windows or Unix style)
    const isWindowsPath = /^([a-z]:|\\\\)/i.test(fileLocation);
    const isUnixPath = fileLocation.startsWith('/');
    
    if (!isWindowsPath && !isUnixPath) {
      const errorMsg = `Cannot open file: Path is not absolute: "${fileLocation}"`;
      console.error(errorMsg);
      toast.error("Error Opening File", { description: "Cannot open file: Not an absolute path." });
      return;
    }

    try {
      // First check if the file exists
      const existsResult = await window.ipc.checkFileExists(fileLocation);
      if (!existsResult.exists) {
        toast.error("Error Opening File", { description: `File not found at location.` });
        return;
      }

      const result = await window.ipc.openFile(fileLocation);
      if (!result.success) {
        const errorMsg = `Failed to open file location "${fileLocation}": ${result.error || 'Unknown error'}`;
        console.error(errorMsg);
        toast.error("Error Opening File", { description: result.error || 'Could not open the file location.' });
      } else {
        // File opened successfully
      }
    } catch (error: any) {
      const errorMsg = `Error opening file location "${fileLocation}": ${error.message}`;
      console.error(errorMsg, error);
      toast.error("Error", { description: "An unexpected error occurred while trying to open the file location." });
    }
  }, []);


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
        return; // Should not happen
    }

    const originalFileLocation = resultToRename.fileLocation; // The current absolute path from state
    const desiredNewName = resultToRename.newName; // The name typed into the input (base name only)

    // --- Pre-IPC Validation ---
    if (!originalFileLocation || typeof originalFileLocation !== 'string') {
       const errorMsg = `Cannot rename: Missing or invalid original file location: "${originalFileLocation}"`;
       console.error(errorMsg);
       toast.error("Rename Error", { description: `Invalid file path.` }); 
       return;
    }

    //MARK: Cross-platform absolute-path check (handles Windows & Unix)
    const isWindowsAbsolute = /^([a-zA-Z]:|\\\\)/.test(originalFileLocation); // e.g., "C:\\" or "\\\\server"
    const isUnixAbsolute = originalFileLocation.startsWith('/'); // " /home/user "
    const isAbsolutePath = isWindowsAbsolute || isUnixAbsolute;

    if (!isAbsolutePath) {
      const errorMsg = `Cannot rename: Not an absolute path: "${originalFileLocation}"`;
      console.error(errorMsg);
      toast.error("Rename Error", { description: `Invalid file path format.` }); 
      return;
    }

    // First check if the file exists at the current location
    try {
      const existsResult = await window.ipc.checkFileExists(originalFileLocation);
      if (!existsResult.exists) {
        toast.error("Rename Error", { description: `File not found at current location.` });
        return;
      }
    } catch (error) {
      console.error("Error checking file existence:", error);
      toast.error("Rename Error", { description: `Error checking file: ${error.message}` });
      return;
    }

    if (!desiredNewName || typeof desiredNewName !== 'string' || desiredNewName.trim().length === 0) {
       const errorMsg = `Cannot rename: Desired name is empty or invalid.`;
       console.error(errorMsg);
       toast.error("Rename Error", { description: "Filename cannot be empty." });
       resetInputState(index, originalFileLocation); // Reset input
       return;
    }

    // *** Make sure input is just the filename without path separators ***
    if (desiredNewName.includes('\\') || desiredNewName.includes('/')) {
      const errorMsg = `Cannot rename: Filename cannot contain path separators: "${desiredNewName}"`;
      console.error(errorMsg);
      toast.error("Rename Error", { description: "Filename cannot contain path separators." });
      resetInputState(index, originalFileLocation);
      return;
    }
    
    // Extract the extension from the *current* file location using regex
    const ext = originalFileLocation.match(/\.[^/.\\]+$/)?.[0] || "";
    
    // Sanitize the desired base name from the input
    const sanitizedDesiredBaseName = sanitizeFilename(desiredNewName); 
    if (!sanitizedDesiredBaseName || sanitizedDesiredBaseName.trim().length === 0) {
       const errorMsg = `Cannot rename: Sanitized name is empty or invalid for desired name "${desiredNewName}".`;
       console.error(errorMsg);
       toast.error("Rename Error", { description: "Invalid characters in filename." }); 
       resetInputState(index, originalFileLocation); // Reset input
       return;
    }
     
    // Get current filename from path for comparison
    const currentFileName = originalFileLocation.replace(/^.*[\\\/]/, '');
    const currentBaseName = currentFileName.replace(/\.[^/.]+$/, "");
    
    if (currentBaseName === sanitizedDesiredBaseName) {
       return; // No need to call IPC if the name didn't change
    }
    // --- End Validation ---

    
    try {
      const renameOpResult = await window.ipc.resolveAndRename(
        originalFileLocation,
        sanitizedDesiredBaseName,
        ext
      );
      

      // --- Update State Based on IPC Result ---
      if (renameOpResult.success && renameOpResult.newPath) {
        // SUCCESS: Update state with the actual new path and derived name
        const actualNewAbsolutePath = renameOpResult.newPath;
        
        // Extract just the filename without path or extension using regex
        const actualNewFileName = actualNewAbsolutePath.replace(/^.*[\\\/]/, '');
        const actualNewBaseName = actualNewFileName.replace(/\.[^/.]+$/, "");

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
      } else {
        // FAILURE reported by IPC: Log, notify, reset input state
        const errorMsg = `Failed to rename file via IPC: ${renameOpResult.error || 'Unknown IPC error'}`; 
        console.error(errorMsg);
        toast.error("Rename Failed", {
          description: `${currentFileName}: ${renameOpResult.error || 'Could not rename the file.'}` 
        });
        resetInputState(index, originalFileLocation); // Reset input to original basename
      }
    } catch (error: any) {
      const errorMsg = `Error calling resolveAndRename IPC: ${error.message}`;
      console.error(errorMsg, error);
      toast.error("Rename Error", {
          description: `Failed to rename: ${error.message}`
      });
      resetInputState(index, originalFileLocation); // Reset input state
   }
 }, [editableResults, editingIndex]); // Remove resetInputState from dependencies

  // --- Helper Functions ---

  // Resets the display name for a given index back to the basename of its current fileLocation
  const resetInputState = useCallback((index: number, currentFileLocation: string) => {
     if (!currentFileLocation || typeof currentFileLocation !== 'string') return; // Safety check
     
     // Extract just the filename without path or extension using regex
     // This handles both forward and backslashes for cross-platform compatibility
     const currentBaseName = currentFileLocation.replace(/^.*[\\\/]/, '').replace(/\.[^/.]+$/, "");
     
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