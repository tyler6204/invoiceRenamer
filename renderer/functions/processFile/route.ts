import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { RenamingSettings } from '@/components/renamingSettings';
import getSystemPrompt from './systemPrompt';
import { models } from "@/lib/models";
import path from 'path'; // Keep path for extname in renderer
import { sanitizeFilename } from '../fileUtils'; // Only need sanitizeFilename
import { geminiResponseSchema, formatInvoiceFilename, InvoiceData } from './schema';
import { GEMINI_API_KEY } from '@/lib/apiKeys';

export interface Results {
  results: Result[];
  newFiles: number;
}

export interface Result {
  success: boolean;
  originalName: string;
  newName: string; // The final name intended (might differ from path if conflicts occurred)
  fileLocation: string; // The final absolute path of the file
}

// Helper function to remove file extension
const removeExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, "");
};


export async function processFiles(files: File[], selectedModel = "gemini-pro", renamingSettings: RenamingSettings): Promise<Results> {
  try {
    const processingPromises = files.map(async (file) => {
      let filePath: string | null = null;
      const fileName = file?.name || 'unknown file';

      try {
        filePath = window.ipc.getPathForFile(file);
        window.ipc.log(`[processFiles loop] File: "${fileName}", Got path from IPC: "${filePath}", Type: ${typeof filePath}`);

        if (!filePath || typeof filePath !== 'string') {
            throw new Error(`Failed to get a valid file path for ${fileName} from IPC. Received: ${filePath}`);
        }

        const results: Result[] = [];
        let fileNewFiles = 0;
        const namesFromAI = await AIProcessFile(file, selectedModel, renamingSettings);

        if (!namesFromAI || namesFromAI.length === 0) {
          const defaultName = removeExtension(fileName);
          const ext = path.extname(fileName);
          const sanitizedDefaultName = sanitizeFilename(defaultName);

          window.ipc.log(`[processFiles loop fallback] Calling resolveAndRename with filePath="${filePath}", sanitizedDefaultName="${sanitizedDefaultName}", ext="${ext}"`);

          // *** USE NEW IPC HANDLER ***
          const renameResult = await window.ipc.resolveAndRename(filePath, sanitizedDefaultName, ext);

          results.push({
            success: renameResult?.success ?? false,
            originalName: fileName,
            newName: defaultName, // Keep intended name separate from potentially modified path
            fileLocation: renameResult?.newPath || filePath // Use actual path from IPC or fallback
          });

          return { results, newFiles: fileNewFiles };
        }

        let currentSourcePath = filePath; // Use a separate var for the source of duplication

        for (let i = 0; i < namesFromAI.length; i++) {
          const finalName = namesFromAI[i]; // Name from AI (may contain invalid chars)
          const ext = path.extname(fileName);
          const sanitizedBaseName = sanitizeFilename(finalName); // Sanitize for the file system

          let operationResult; // To store result from rename or duplicate

          if (i === 0) {
            // --- Rename original file ---
            window.ipc.log(`[processFiles loop i=${i}] Calling resolveAndRename with filePath="${currentSourcePath}", sanitizedBaseName="${sanitizedBaseName}", ext="${ext}"`);

            // *** USE NEW IPC HANDLER ***
            operationResult = await window.ipc.resolveAndRename(currentSourcePath, sanitizedBaseName, ext);

            if (operationResult?.success && operationResult.newPath) {
              window.ipc.log(`[processFiles loop i=${i}] Rename successful. New path: "${operationResult.newPath}"`);
              // Update currentSourcePath for potential subsequent duplications *from the newly renamed file*
              currentSourcePath = operationResult.newPath;
            } else {
               console.error(`Failed to rename ${currentSourcePath} to ${sanitizedBaseName}, skipping duplicates.`);
               window.ipc.log(`[processFiles loop i=${i}] Rename FAILED for filePath="${currentSourcePath}", desiredName="${sanitizedBaseName}". Error: ${operationResult?.error}`);
               break; // Exit loop for this file if first rename fails
            }
          } else {
             // --- Duplicate file for additional invoices ---
             window.ipc.log(`[processFiles loop i=${i}] Creating New File from sourcePath: "${currentSourcePath}"`);

             // Construct the *desired* absolute target path in the renderer (it's just a string here)
             const targetDir = path.dirname(currentSourcePath); // Use path from the *previous* successful operation
             const targetFileName = sanitizedBaseName + ext; // Use sanitized name + extension
             const desiredTargetPath = path.join(targetDir, targetFileName); // Construct desired full path

             window.ipc.log(`[processFiles loop i=${i}] Calling resolveAndDuplicate with sourcePath="${currentSourcePath}", desiredTargetPath="${desiredTargetPath}"`);

             // *** USE NEW IPC HANDLER ***
             // Note: resolve-and-duplicate currently prevents overwrites. If you need conflict resolution (adding "(1)"),
             // you'd need to enhance the resolve-and-duplicate handler similar to resolve-and-rename.
             operationResult = await window.ipc.resolveAndDuplicate(currentSourcePath, desiredTargetPath);

             window.ipc.log(`[processFiles loop i=${i}] Duplicate response: ${JSON.stringify(operationResult)}`);

             if (operationResult?.success) {
               fileNewFiles++;
               // If duplicating multiple times, decide if the NEXT duplicate should come from the ORIGINAL source
               // or the NEWLY created duplicate. Current logic uses the path from the *previous* successful step (currentSourcePath).
             } else {
               console.error(`Failed to duplicate file to ${desiredTargetPath}`);
               window.ipc.log(`[processFiles loop i=${i}] Duplicate FAILED for sourcePath="${currentSourcePath}", desiredTargetPath="${desiredTargetPath}". Error: ${operationResult?.error}`);
               // Decide if you want to stop processing this file or just skip this duplicate
               // continue; // Skip to next name from AI
               break; // Stop processing this file if duplication fails
             }
          }

          // Add result for this invoice (rename or duplicate)
          results.push({
            success: operationResult?.success ?? false,
            originalName: fileName, // Always the original drop name
            newName: finalName, // The name intended by AI/formatting
            fileLocation: operationResult?.newPath || currentSourcePath // The actual final path on disk
          });
        } // End for loop

        return { results, newFiles: fileNewFiles };

      } catch (error: any) {
        console.error(`Error processing file ${fileName} (path: ${filePath || 'unknown'}):`, error);
        window.ipc.log(`[processFiles loop ERROR] File: ${fileName}, Path: ${filePath || 'unknown'}, Error: ${error.message} \nStack: ${error.stack}`);
        return {
          results: [{
            success: false,
            originalName: fileName,
            newName: removeExtension(fileName),
            fileLocation: filePath || ''
          }],
          newFiles: 0
        };
      }
    }); // End files.map

    const processedResults = await Promise.all(processingPromises);
    const allResults: Result[] = [];
    let totalNewFiles = 0;
    processedResults.forEach(result => {
      allResults.push(...result.results);
      totalNewFiles += result.newFiles;
    });

    return { results: allResults, newFiles: totalNewFiles };

  } catch (error) {
    console.error('Error processing files:', error);
    window.ipc.log(`[processFiles global ERROR] ${error instanceof Error ? error.message : String(error)}`);
    return { results: [], newFiles: 0 };
  }
}

// --- AIProcessFile function remains the same as before ---
async function AIProcessFile(file: File, modelName = models[0].apiName, renamingSettings: RenamingSettings): Promise<string[]> {
  // ... (Keep the existing implementation) ...
    //Calls Gemini API to process file and returns array of invoice names
  try {
    // Initialize the Gemini API with the API key
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    window.ipc.log(`[AIProcessFile] Initialized Gemini with key ending in ${GEMINI_API_KEY.slice(-4)}`);

    // Get the model - use the selected model or default to gemini-pro
    const systemPrompt = getSystemPrompt(renamingSettings.company);

    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        // Use Gemini's built-in JSON response support
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema
      },
    });

    // Read file as base64 to send to API
    const fileContent = await file.arrayBuffer();
    const base64Content = Buffer.from(fileContent).toString('base64');
    const mimeType = file.type;

    // Create image part
    const imagePart: Part = {
      inlineData: {
        data: base64Content,
        mimeType: mimeType
      }
    };

    window.ipc.log(`[AIProcessFile] Sending request to model ${modelName} for file ${file.name} (type: ${mimeType})`);
    // Send request with system prompt and user prompt
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            imagePart
          ]
        }
      ]
    });

    let responseText = result.response.text();
    window.ipc.log(`[AIProcessFile] Raw response from Gemini: ${responseText}`);

    // Parse the response - it should already be structured JSON
    let invoiceDataArray: InvoiceData[];
    try {
      invoiceDataArray = JSON.parse(responseText);
      if (!Array.isArray(invoiceDataArray)) {
         // If it's not an array, wrap it in one, though the schema should prevent this.
         window.ipc.log(`[AIProcessFile] Warning: Gemini response was not an array, wrapping it.`);
         invoiceDataArray = [invoiceDataArray];
      }
    } catch (error) {
      console.error('Failed to parse JSON response from Gemini:', error);
      window.ipc.log(`[AIProcessFile] Error parsing JSON response: ${error instanceof Error ? error.message : String(error)}`);
      return ['Unknown']; // Return default if parsing fails
    }

    // Generate filenames from invoice data
    const filenames = invoiceDataArray.map((invoice, index) => {
      try {
        // Use the imported formatInvoiceFilename helper function
        const formattedName = formatInvoiceFilename(invoice, renamingSettings);
        window.ipc.log(`[AIProcessFile] Formatted name for invoice ${index}: ${formattedName}`);
        return formattedName;
      } catch (error) {
        console.error('Error formatting invoice filename:', error);
        window.ipc.log(`[AIProcessFile] Error formatting filename for invoice ${index}: ${error instanceof Error ? error.message : String(error)}`);
        return 'Unknown' // Return default for specific invoice format error
      }
    });

    // Return the array of names, or ['Unknown'] if empty
    const finalNames = filenames.length > 0 ? filenames : ['Unknown'];
    window.ipc.log(`[AIProcessFile] Final generated names: ${JSON.stringify(finalNames)}`);
    return finalNames;

  } catch (error) {
    console.error('Error in AI processing:', error);
    window.ipc.log(`[AIProcessFile] Global error during AI processing: ${error instanceof Error ? error.message : String(error)}`);
    return ['Unknown']; // Return default on any major AI processing error
  }
}