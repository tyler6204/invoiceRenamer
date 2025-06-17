import { RenamingSettings } from "@/components/renamingSettings";
import { Schema, Type } from "@google/genai";

// Define the invoice data type
export interface InvoiceData {
  vendor?: string;
  date?: string;
  total?: number;
  invoiceNumber?: string;
  isStatement?: boolean;
  creditCardNumber?: string;
}

// Define the response schema using Google's Generative AI schema types
const invoiceObjectSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    vendor: {
      type: Type.STRING,
      description: "Name of the vendor or company that issued the invoice",
    },
    date: {
      type: Type.STRING,
      description: "Invoice date in MM-DD-YYYY format",
    },
    total: {
      type: Type.NUMBER,
      description: "Total invoice amount as a number without currency symbols",
    },
    invoiceNumber: {
      type: Type.STRING,
      description: "Unique invoice identifier",
    },
    isStatement: {
      type: Type.BOOLEAN,
      description: "Whether the invoice is a statement or not",
    },
    creditCardNumber: {
      type: Type.STRING,
      description:
        "The last 4 digits of the credit card number used to pay for the invoice formatted as X????",
    },
  },
  // All fields are optional
  required: [],
};

// Export the schema as an array to always get an array response
export const geminiResponseSchema: Schema = {
  type: Type.ARRAY,
  items: invoiceObjectSchema,
  description: "Array of invoice objects extracted from the document",
};

// Helper to format invoice data into a standardized filename
export function formatInvoiceFilename(
  data: InvoiceData,
  renamingSettings: RenamingSettings
): string {
  // Function to capitalize each word in a string
  const capitalizeWords = (str: string): string => {
    return str
      .split(" ")
      .map(
        (word) =>
          word.toLowerCase().charAt(0).toUpperCase() +
          word.slice(1).toLowerCase()
      )
      .join(" ");
  };

  // Format: [CompanyPrefix-]Vendor-Date-Amount
  const vendor = data.vendor ? capitalizeWords(data.vendor) : "Unknown";
  const date = data.date ? data.date.replace("/", "-") : "Unknown";
  const amount =
    typeof data.total === "number" && !isNaN(data.total)
      ? data.total.toFixed(2)
      : "Unknown";
  const invoiceNumber = data.invoiceNumber;
  const isStatement = data.isStatement;
  const creditCardNumber = data.creditCardNumber;

  const parts = [];

  if (renamingSettings.backup) {
    if (creditCardNumber) {
      parts.push(amount, vendor, date, creditCardNumber);
    } else {
      parts.push(amount, vendor, date, invoiceNumber, "Backup");
    }
  } else {
    parts.push(amount, vendor, date);
    if (isStatement) {
      parts.push("Statement");
    } else if (invoiceNumber) {
      parts.push(invoiceNumber);
    } else if (creditCardNumber) {
      parts.push(creditCardNumber);
    }
  }

  return parts.join(" ");
}
