// src/renderer/functions/fileUtils.ts OR wherever this file lives

// Only keep sanitizeFilename here, remove renameFileWithConflictResolution

// Make sure sanitizeFilename is defined correctly
export function sanitizeFilename(name: string): string {
  // Basic sanitization: remove characters not allowed in Windows/macOS filenames
  // Replace control characters, reserved chars, leading/trailing dots/spaces
  if (!name || typeof name !== 'string') return 'invalid_name';
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace reserved chars and control chars
    .replace(/^\.+$/, '_') // Replace if name is only dots
    .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '$1_') // Avoid reserved names
    .trim() // Trim leading/trailing whitespace
    .replace(/[. ]+$/, ''); // Remove trailing dots or spaces
  return sanitized || 'invalid_name'; // Ensure not empty
}

// The renameFileWithConflictResolution function is REMOVED from this file.
// Its logic is now inside the 'resolve-and-rename' IPC handler in background.ts.