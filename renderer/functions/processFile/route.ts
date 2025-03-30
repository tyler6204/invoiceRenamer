// Process files and return response with renamed file details
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { RenamingSettings } from '@/components/renamingSettings';
import getSystemPrompt from './systemPrompt';
import { models } from "@/lib/models";
import path from 'path';
import { renameFileWithConflictResolution } from '../fileUtils';
import { geminiResponseSchema, formatInvoiceFilename, InvoiceData } from './schema';
import { GEMINI_API_KEY } from '@/lib/apiKeys';

export interface Results {
  results: Result[];
  newFiles: number;
}

export interface Result {
  success: boolean;
  originalName: string;
  newName: string;
  fileLocation: string;
}

// Helper function to remove file extension
const removeExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, "");
};


export async function processFiles(files: File[], selectedModel = "gemini-pro", renamingSettings: RenamingSettings) {
  try {
    // Process all files in parallel
    const processingPromises = files.map(async (file) => {
      try {
        // Get file path
        const fileName = file.name;
        let filePath = window.ipc.getPathForFile(file);
        
        const results: Result[] = [];
        let fileNewFiles = 0;
        
        // Process with AI - now returns array of names
        const namesFromAI = await AIProcessFile(file, selectedModel, renamingSettings);
        
        if (!namesFromAI || namesFromAI.length === 0) {
          // Fallback if AI returned nothing
          const defaultName = removeExtension(fileName);
          const ext = path.extname(fileName);
          const renameResult = await renameFileWithConflictResolution(filePath, defaultName, ext);
          
          results.push({
            success: renameResult.success,
            originalName: fileName,
            newName: defaultName,
            fileLocation: renameResult.newPath || filePath
          });
          return { results, newFiles: fileNewFiles };
        }
        
        // Handle each name (each represents an invoice in the file)
        for (let i = 0; i < namesFromAI.length; i++) {
          const finalName = namesFromAI[i];
          const ext = path.extname(fileName);
          
          // Keep track of the source path (will be updated after first rename)
          let sourcePath = filePath;
          let renameResult;
          
          if (i === 0) {
            // Rename original file for first invoice
            renameResult = await renameFileWithConflictResolution(filePath, finalName, ext);
            
            // Update the source path to the new renamed path for subsequent operations
            if (renameResult.success && renameResult.newPath) {
              sourcePath = renameResult.newPath;
              filePath = renameResult.newPath; // Update filePath for later iterations
            }
          } else {
            // For additional invoices, duplicate the file
            console.log("Creating New File from:", sourcePath);
            const newPath = path.join(path.dirname(sourcePath), finalName + ext);
            renameResult = await window.ipc.duplicateFile(sourcePath, newPath);
            
            // Increment new files counter if successful
            if (renameResult.success) {
              fileNewFiles++;
            }
          }
          
          results.push({
            success: renameResult.success,
            originalName: fileName,
            newName: finalName,
            fileLocation: renameResult.newPath || sourcePath
          });
        }
        
        return { results, newFiles: fileNewFiles };
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        return {
          results: [{
            success: false,
            originalName: file.name,
            newName: removeExtension(file.name),
            fileLocation: window.ipc.getPathForFile(file)
          }],
          newFiles: 0
        };
      }
    });
    
    // Wait for all files to be processed
    const processedResults = await Promise.all(processingPromises);
    
    // Combine results and count new files
    const allResults: Result[] = [];
    let totalNewFiles = 0;
    
    processedResults.forEach(result => {
      allResults.push(...result.results);
      totalNewFiles += result.newFiles;
    });

    return { results: allResults, newFiles: totalNewFiles };
  } catch (error) {
    console.error('Error processing files:', error);
    return {
      results: [],
      newFiles: 0
    };
  }
}

async function AIProcessFile(file: File, modelName = models[0].apiName, renamingSettings: RenamingSettings): Promise<string[]> {
  //Calls Gemini API to process file and returns array of invoice names
  try {
    // Initialize the Gemini API with the API key
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    
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
    
    // Create prompt for invoice analysis
        
      // For images/PDFs, use the vision capabilities
      // Create image part
      const imagePart: Part = {
        inlineData: {
          data: base64Content,
          mimeType: mimeType
        }
      };
      
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
    
    let response = result.response.text();
    console.log(response);
    
    // Parse the response - it should already be structured JSON
    let invoiceData: InvoiceData[];
    try {
      invoiceData = JSON.parse(response);
    } catch (error) {
      console.error('Failed to parse JSON response from Gemini:', error);
      return ['Unknown'];
    }
    
    // The response is now always an array (based on our schema)
    const invoices: InvoiceData[] = invoiceData;
    
    // Generate filenames from invoice data
    const filenames = invoices.map(invoice => {
      try {
        // Use the imported formatInvoiceFilename helper function
        return formatInvoiceFilename(invoice, renamingSettings);
      } catch (error) {
        console.error('Error formatting invoice filename:', error);
        return 'Unknown'
      }
    });
    
    return filenames.length > 0 ? filenames : ['Unknown'];
  } catch (error) {
    console.error('Error in AI processing:', error);
    return ['Unknown']; // Return the original filename without extension
  }
}
