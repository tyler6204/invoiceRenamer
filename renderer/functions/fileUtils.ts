import path from 'path';

// Find a non-conflicting filename for renaming
export async function findNonConflictingName(
  basePath: string, 
  baseName: string, 
  extension: string, 
  currentPath: string
): Promise<string> {
  // Check if the current file already has this name
  const currentFilename = path.basename(currentPath);
  const newFilename = `${baseName}${extension}`;
  
  // If it's already named this way, return the current path
  if (currentFilename === newFilename) {
    return currentPath;
  }
  
  // Try the original name first
  let newPath = path.join(basePath, newFilename);
  
  // If it's the same as current path, just return it
  if (newPath === currentPath) {
    return currentPath;
  }
  
  let counter = 1;
  
  // Check if file exists
  let fileExists = await window.ipc.checkFileExists(newPath);
  
  // Keep checking with incremented numbers until we find a name that doesn't exist
  while (fileExists.exists) {
    newPath = path.join(basePath, `${baseName} (${counter})${extension}`);
    
    // If we're trying to rename to the current file (different case perhaps)
    if (newPath === currentPath) {
      return currentPath;
    }
    
    fileExists = await window.ipc.checkFileExists(newPath);
    counter++;
    
    // Safety check to prevent infinite loops
    if (counter > 100) {
      console.error("Too many naming conflicts, stopping at 100 attempts");
      break;
    }
  }
  
  return newPath;
}

// Rename a file safely with conflict resolution
export async function renameFileWithConflictResolution(
  originalPath: string,
  newName: string,
  extension: string
): Promise<{ success: boolean; newPath?: string; error?: string }> {
  try {
    const dirPath = path.dirname(originalPath);
    
    // Find a non-conflicting name
    const newPath = await findNonConflictingName(dirPath, newName, extension, originalPath);
    
    // Only rename if the path changed
    if (newPath === originalPath) {
      return { success: true, newPath: originalPath };
    }

    // Use window.ipc.renameFile to rename the file
    const response = await window.ipc.renameFile(originalPath, newPath);
    
    if (response.success) {
      return { success: true, newPath };
    } else {
      return { success: false, error: response.error || 'Unknown error during rename' };
    }
  } catch (error) {
    console.error('Error in renameFileWithConflictResolution:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during rename' 
    };
  }
} 