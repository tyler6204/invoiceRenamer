import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Part,
} from "@google/genai";
import { RenamingSettings } from "@/components/renamingSettings";
import getSystemPrompt from "./systemPrompt";
import { models } from "@/lib/models";
import path from "path"; // Keep path for extname in renderer
import { sanitizeFilename } from "../fileUtils"; // Only need sanitizeFilename
import {
  geminiResponseSchema,
  formatInvoiceFilename,
  InvoiceData,
} from "./schema";
import { extractText } from "./extractText";

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

export async function processFiles(
  files: File[],
  selectedModel = "gemini-2.5-flash",
  renamingSettings: RenamingSettings
): Promise<Results> {
  try {
    const processingPromises = files.map(async (file) => {
      let filePath: string | null = null;
      const fileName = file?.name || "unknown file";

      try {
        filePath = window.ipc.getPathForFile(file);
        window.ipc.log(
          `[processFiles loop] File: "${fileName}", Got path from IPC: "${filePath}", Type: ${typeof filePath}`
        );

        if (!filePath || typeof filePath !== "string") {
          throw new Error(
            `Failed to get a valid file path for ${fileName} from IPC. Received: ${filePath}`
          );
        }

        const results: Result[] = [];
        let fileNewFiles = 0;
        const namesFromAI = await AIProcessFile(
          file,
          selectedModel,
          renamingSettings
        );

        if (!namesFromAI || namesFromAI.length === 0) {
          const defaultName = removeExtension(fileName);
          const ext = path.extname(fileName);
          const sanitizedDefaultName = sanitizeFilename(defaultName);

          window.ipc.log(
            `[processFiles loop fallback] Calling resolveAndRename with filePath="${filePath}", sanitizedDefaultName="${sanitizedDefaultName}", ext="${ext}"`
          );

          // *** USE NEW IPC HANDLER ***
          const renameResult = await window.ipc.resolveAndRename(
            filePath,
            sanitizedDefaultName,
            ext
          );

          // Extract just the basename for display after rename
          const finalDisplayName =
            renameResult?.success && renameResult.newPath
              ? renameResult.newPath
                  .replace(/^.*[\\\/]/, "")
                  .replace(/\.[^/.]+$/, "")
              : sanitizedDefaultName;

          window.ipc.log(
            `[processFiles loop fallback] Result: success=${renameResult?.success}, displayName="${finalDisplayName}"`
          );

          results.push({
            success: renameResult?.success ?? false,
            originalName: fileName,
            // Always use just the basename for newName
            newName: finalDisplayName,
            fileLocation: renameResult?.newPath || filePath, // Use actual path from IPC or fallback
          });

          return { results, newFiles: fileNewFiles };
        }

        let currentSourcePath = filePath; // Use a separate var for the source of duplication

        for (let i = 0; i < namesFromAI.length; i++) {
          const nameFromAI = namesFromAI[i]; // Original name from AI (may contain invalid chars)
          const ext = path.extname(fileName);
          // Sanitize the base name from AI for the file system operation
          const sanitizedBaseName = sanitizeFilename(nameFromAI);

          let operationResult; // To store result from rename or duplicate
          let finalAbsolutePath; // To store the final path from the operation
          let finalDisplayName; // To store the base name intended for display

          if (i === 0) {
            // --- Rename original file ---
            window.ipc.log(
              `[processFiles loop i=${i}] Calling resolveAndRename with filePath="${currentSourcePath}", sanitizedBaseName="${sanitizedBaseName}", ext="${ext}"`
            );

            // *** USE NEW IPC HANDLER ***
            operationResult = await window.ipc.resolveAndRename(
              currentSourcePath,
              sanitizedBaseName,
              ext
            );

            if (operationResult?.success && operationResult.newPath) {
              window.ipc.log(
                `[processFiles loop i=${i}] Rename successful. New path: "${operationResult.newPath}"`
              );
              currentSourcePath = operationResult.newPath; // Update source for potential duplicates
              finalAbsolutePath = operationResult.newPath;
              // Extract just the basename for display (without path or extension)
              finalDisplayName = operationResult.newPath
                .replace(/^.*[\\\/]/, "")
                .replace(/\.[^/.]+$/, "");
              window.ipc.log(
                `[processFiles loop i=${i}] Extracted display name: "${finalDisplayName}"`
              );
            } else {
              console.error(
                `Failed to rename ${currentSourcePath} to ${sanitizedBaseName}, skipping duplicates.`
              );
              window.ipc.log(
                `[processFiles loop i=${i}] Rename FAILED for filePath="${currentSourcePath}", desiredName="${sanitizedBaseName}". Error: ${operationResult?.error}`
              );
              // If rename fails, create a failure result but keep original info
              results.push({
                success: false,
                originalName: fileName,
                // Just use the basic sanitized name from AI without any path components
                newName:
                  nameFromAI.includes("/") || nameFromAI.includes("\\")
                    ? nameFromAI.replace(/^.*[\\\/]/, "")
                    : nameFromAI,
                fileLocation: currentSourcePath, // Original path before failed rename
              });
              break; // Exit loop for this file if first rename fails
            }
          } else {
            // --- Duplicate file for additional invoices ---
            window.ipc.log(
              `[processFiles loop i=${i}] Creating New File from sourcePath: "${currentSourcePath}"`
            );

            const targetDir = path.dirname(currentSourcePath);
            // Use sanitized name + extension for the target filename
            const targetFileName = sanitizedBaseName + ext;
            const desiredTargetPath = path.join(targetDir, targetFileName);

            window.ipc.log(
              `[processFiles loop i=${i}] Calling resolveAndDuplicate with sourcePath="${currentSourcePath}", desiredTargetPath="${desiredTargetPath}"`
            );

            // *** USE NEW IPC HANDLER ***
            operationResult = await window.ipc.resolveAndDuplicate(
              currentSourcePath,
              desiredTargetPath
            );

            window.ipc.log(
              `[processFiles loop i=${i}] Duplicate response: ${JSON.stringify(
                operationResult
              )}`
            );

            if (operationResult?.success && operationResult.newPath) {
              fileNewFiles++;
              finalAbsolutePath = operationResult.newPath;
              // Extract just the basename for display (without path or extension)
              finalDisplayName = operationResult.newPath
                .replace(/^.*[\\\/]/, "")
                .replace(/\.[^/.]+$/, "");
              window.ipc.log(
                `[processFiles loop i=${i}] Extracted display name for duplicate: "${finalDisplayName}"`
              );
              // Note: currentSourcePath remains the same for subsequent duplicates *from the original (now potentially renamed) file*
            } else {
              console.error(`Failed to duplicate file to ${desiredTargetPath}`);
              window.ipc.log(
                `[processFiles loop i=${i}] Duplicate FAILED for sourcePath="${currentSourcePath}", desiredTargetPath="${desiredTargetPath}". Error: ${operationResult?.error}`
              );
              // If duplicate fails, create a failure result
              results.push({
                success: false,
                originalName: fileName,
                // Just use the basic sanitized name from AI without any path components
                newName:
                  nameFromAI.includes("/") || nameFromAI.includes("\\")
                    ? nameFromAI.replace(/^.*[\\\/]/, "")
                    : nameFromAI,
                fileLocation: currentSourcePath, // Original path before failed duplicate
              });
              break; // Stop processing this file if duplication fails
            }
          }

          // Add result only if the operation was successful (or handled above for failure)
          if (
            operationResult?.success &&
            finalAbsolutePath &&
            finalDisplayName
          ) {
            results.push({
              success: true,
              originalName: fileName, // Always the original drop name
              // Use the sanitized basename without path components for display
              newName: finalDisplayName,
              // Store the final absolute path
              fileLocation: finalAbsolutePath,
            });

            window.ipc.log(
              `[processFiles loop i=${i}] Added result: newName="${finalDisplayName}", fileLocation="${finalAbsolutePath}"`
            );
          }
        } // End for loop

        return { results, newFiles: fileNewFiles };
      } catch (error: any) {
        console.error(
          `Error processing file ${fileName} (path: ${filePath || "unknown"}):`,
          error
        );
        window.ipc.log(
          `[processFiles loop ERROR] File: ${fileName}, Path: ${
            filePath || "unknown"
          }, Error: ${error.message} \nStack: ${error.stack}`
        );

        // Create a basic fallback result with just the basename as newName
        const fallbackBaseName = path.basename(
          fileName,
          path.extname(fileName)
        );
        window.ipc.log(
          `[processFiles loop ERROR] Creating fallback result with newName="${fallbackBaseName}"`
        );

        return {
          results: [
            {
              success: false,
              originalName: fileName,
              newName: fallbackBaseName, // Just the basename without extension
              fileLocation: filePath || "",
            },
          ],
          newFiles: 0,
        };
      }
    }); // End files.map

    const processedResults = await Promise.all(processingPromises);
    const allResults: Result[] = [];
    let totalNewFiles = 0;
    processedResults.forEach((result) => {
      allResults.push(...result.results);
      totalNewFiles += result.newFiles;
    });

    window.ipc.log(
      `[processFiles] All processing complete. Returning ${allResults.length} results with ${totalNewFiles} new files.`
    );

    // Log a sample of the results for debugging
    if (allResults.length > 0) {
      const sample = allResults[0];
      window.ipc.log(
        `[processFiles] Sample result - originalName: "${sample.originalName}", newName: "${sample.newName}", fileLocation: "${sample.fileLocation}"`
      );
    }

    return { results: allResults, newFiles: totalNewFiles };
  } catch (error) {
    console.error("Error processing files:", error);
    window.ipc.log(
      `[processFiles global ERROR] ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { results: [], newFiles: 0 };
  }
}

// --- AIProcessFile function remains the same as before ---
async function AIProcessFile(
  file: File,
  modelName = models[0].apiName,
  renamingSettings: RenamingSettings
): Promise<string[]> {
  // ... (Keep the existing implementation) ...
  //Calls Gemini API to process file and returns array of invoice names
  try {
    // Initialize the Gemini API with the API key
    window.ipc.log(
      `[AIProcessFile] Initialized Gemini with key ending in ${process.env.NEXT_PUBLIC_GEMINI_API_KEY?.slice(
        -4
      )}`
    );

    // Get the model - use the selected model or default to gemini-pro
    const systemPrompt = getSystemPrompt(renamingSettings.company);

    const ai = new GoogleGenAI({
      apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    });
    // Configure the model with the schema and safety settings
    const config = {
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
      config: {
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema,
      },
      thinkingConfig: {
        thinkingBudget: 8000,
      },
      systemInstruction: [
        {
          text: systemPrompt,
        },
      ],
    };

    // Read file as base64 to send to API
    const fileContent = await file.arrayBuffer();
    const base64Content = Buffer.from(fileContent).toString("base64");
    const mimeType = file.type;
    const tokens = await extractText(base64Content, mimeType);

    // Format each word with its bounding box coordinates inline
    const textWithCoords = tokens
      .map((t) => `${t.text} [${t.coords[0]}, ${t.coords[1]}]`)
      .join(" ");

    const textPart: Part = {
      text: `Here is the text extracted from the image with bounding box coordinates: ${textWithCoords}`,
    };
    const imagePart: Part = {
      inlineData: {
        data: base64Content,
        mimeType: mimeType,
      },
    };
    const model = modelName;

    window.ipc.log(
      `[AIProcessFile] Sending request to model ${modelName} for file ${file.name} (type: ${mimeType})`
    );
    // Send request with system prompt and user prompt
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [textPart, imagePart] }],
      config,
    });

    const responseText = result.text;
    window.ipc.log(`[AIProcessFile] Raw response from Gemini: ${responseText}`);

    // Parse the response - it should already be structured JSON
    let invoiceDataArray: InvoiceData[];
    try {
      invoiceDataArray = JSON.parse(responseText);
      if (!Array.isArray(invoiceDataArray)) {
        // If it's not an array, wrap it in one, though the schema should prevent this.
        window.ipc.log(
          `[AIProcessFile] Warning: Gemini response was not an array, wrapping it.`
        );
        invoiceDataArray = [invoiceDataArray];
      }
    } catch (error) {
      console.error("Failed to parse JSON response from Gemini:", error);
      window.ipc.log(
        `[AIProcessFile] Error parsing JSON response: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return ["Unknown"]; // Return default if parsing fails
    }

    // Generate filenames from invoice data
    const filenames = invoiceDataArray.map((invoice, index) => {
      try {
        // Use the imported formatInvoiceFilename helper function
        const formattedName = formatInvoiceFilename(invoice, renamingSettings);
        window.ipc.log(
          `[AIProcessFile] Formatted name for invoice ${index}: ${formattedName}`
        );
        return formattedName;
      } catch (error) {
        console.error("Error formatting invoice filename:", error);
        window.ipc.log(
          `[AIProcessFile] Error formatting filename for invoice ${index}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return "Unknown"; // Return default for specific invoice format error
      }
    });

    // Return the array of names, or ['Unknown'] if empty
    const finalNames = filenames.length > 0 ? filenames : ["Unknown"];
    window.ipc.log(
      `[AIProcessFile] Final generated names: ${JSON.stringify(finalNames)}`
    );
    return finalNames;
  } catch (error) {
    console.error("Error in AI processing:", error);
    window.ipc.log(
      `[AIProcessFile] Global error during AI processing: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return ["Unknown"]; // Return default on any major AI processing error
  }
}
