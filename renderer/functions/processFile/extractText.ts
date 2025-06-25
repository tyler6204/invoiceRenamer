//MARK: Extract visible text from a receipt image OR pdf using Google Cloud Vision OCR
// This utility now detects whether the supplied base64 blob represents an image or a PDF (based on the mimeType
// passed in by the caller). If it's a PDF we render each page to an off-screen canvas with **pdfjs-dist** and
// run the same Vision OCR logic page-by-page.
// This utility takes a base64-encoded image (optionally prefixed with a data-URI header)
// and returns the full text detected in the image. The resulting string can be supplied
// to the Gemini model alongside the image itself to improve accuracy.

// Single line comments are included to clarify each logical step of the function.
import { pdfjs } from "react-pdf";

//MARK: Types for structured OCR output
export interface OCRToken {
  /** Detected word */
  text: string;
  /** Normalised centre of the token's bounding box – range 0-1 on both axes */
  coords: [number, number];
}

//MARK: Types for Google Vision document structure (to avoid using `any`)
type Vertex = { x?: number; y?: number };
type BoundingPoly = { vertices?: Vertex[] };
type OcrSymbol = { text?: string };
type Word = { symbols?: OcrSymbol[]; boundingBox?: BoundingPoly };
type Paragraph = { words?: Word[] };
type Block = { paragraphs?: Paragraph[] };
type Page = { blocks?: Block[] };

/**
 * Extracts text from an image using Google Cloud Vision API.
 * @param imageDataBase64 The image data as a base64 string (data-URI header optional).
 * @returns The extracted text or an empty string if extraction fails.
 */
export async function extractText(
  /** Raw base64 string **without** the data-URI header */
  dataBase64: string,
  /** Mime-type of the original file (e.g. "image/png" or "application/pdf") */
  mimeType: string = "image/png" // default to image
): Promise<OCRToken[]> {
  // Decide the branch based on mimeType
  if (mimeType === "application/pdf") {
    return extractTextFromPdf(dataBase64);
  }
  // Fallback to default image implementation
  return extractTextFromImage(dataBase64);
}

//MARK: --- PRIVATE HELPERS --------------------------------------------------------------------

/**
 * Extracts text tokens from a **single image** using Vision API (existing implementation).
 */
async function extractTextFromImage(base64: string): Promise<OCRToken[]> {
  //MARK: Validate & fetch API key
  const apiKey = process.env.NEXT_PUBLIC_VISION_API_KEY;
  if (!apiKey) {
    console.error("NEXT_PUBLIC_VISION_API_KEY environment variable not set.");
    return [];
  }

  //MARK: Build the Vision API request payload
  const requestBody = {
    requests: [
      {
        image: {
          content: base64, // supply raw base64 bytes
        },
        features: [
          { type: "DOCUMENT_TEXT_DETECTION" }, // ask Vision for OCR results
        ],
      },
    ],
  };

  //MARK: Call Vision API endpoint
  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    // Log detailed error for debugging purposes
    console.error(
      "Error calling Google Vision API:",
      response.status,
      response.statusText,
      await response.text()
    );
    return [];
  }
  const responseJson = await response.json();
  const json = responseJson as {
    responses?: Array<{
      textAnnotations?: Array<{
        description?: string;
        boundingPoly?: { vertices?: Array<{ x?: number; y?: number }> };
      }>;
      fullTextAnnotation?: { text?: string };
    }>;
  };

  // Attempt to parse using fullTextAnnotation (more granular words)
  const pages: Page[] =
    (json.responses?.[0]?.fullTextAnnotation as { pages?: Page[] } | undefined)
      ?.pages ?? [];

  // Helper array to gather words with their bounding boxes
  const words: Array<
    { text: string; vertices: Array<{ x?: number; y?: number }> }
  > = [];

  //MARK: Extract words from the document structure if present
  for (const page of pages) {
    for (const block of (page.blocks ?? [])) {
      for (const paragraph of (block.paragraphs ?? [])) {
        for (const word of (paragraph.words ?? [])) {
          const wordText = (word.symbols ?? []).map((symbol: OcrSymbol) =>
            symbol.text ?? ""
          ).join(
            "",
          );
          words.push({
            text: wordText,
            vertices: word.boundingBox?.vertices ?? [],
          });
        }
      }
    }
  }

  // Fallback to textAnnotations slice(1) if document structure empty (older behaviour)
  const fallbackTokenAnnotations =
    json.responses?.[0]?.textAnnotations?.slice(1) ?? [];

  if (words.length === 0 && fallbackTokenAnnotations.length === 0) {
    return []; // No text detected at all
  }

  // Combine whichever source produced tokens
  type RawToken = {
    text: string;
    vertices: Array<{ x?: number; y?: number }>;
  };
  const rawTokens: RawToken[] = words.length > 0
    ? words
    : fallbackTokenAnnotations.map((anno) => ({
      text: anno.description ?? "",
      vertices: anno.boundingPoly?.vertices ?? [],
    }));

  // Determine max extents for normalisation
  let maxX = 0;
  let maxY = 0;
  for (const tok of rawTokens) {
    for (const v of tok.vertices) {
      if (v.x !== undefined) maxX = Math.max(maxX, v.x);
      if (v.y !== undefined) maxY = Math.max(maxY, v.y);
    }
  }
  maxX = maxX || 1;
  maxY = maxY || 1;

  //MARK: Convert raw tokens to OCRToken with normalised centre coordinates
  const tokens: OCRToken[] = rawTokens.map((tok) => {
    const xs = tok.vertices.map((v) => v.x ?? 0);
    const ys = tok.vertices.map((v) => v.y ?? 0);
    const minX = Math.min(...xs);
    const maxXv = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxYv = Math.max(...ys);
    const centreX = (minX + maxXv) / 2;
    const centreY = (minY + maxYv) / 2;

    return {
      text: tok.text,
      coords: [
        Number(((centreX / maxX) * 1000).toFixed(0)),
        Number(((centreY / maxY) * 1000).toFixed(0)),
      ],
    };
  });

  return tokens;
}

/**
 * Renders every page of a PDF (supplied as base64) to an off-screen canvas and OCRs each one.
 * Coordinates are normalised per-page, then merged into a single token list.
 */
async function extractTextFromPdf(base64: string): Promise<OCRToken[]> {
  //MARK: Configure pdf.js worker - disable it to avoid external dependencies
  // @ts-ignore - disableWorker exists at runtime but not in the official types
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

  //MARK: Convert base64 to Uint8Array for pdf.js
  const pdfData = Uint8Array.from(Buffer.from(base64, "base64"));

  try {
    const loadingTask = pdfjs.getDocument({ data: pdfData });
    const pdfDoc = await loadingTask.promise;

    const allTokens: OCRToken[] = [];

    //MARK: Process all pages *in parallel* for improved performance
    const pagePromises = Array.from({ length: pdfDoc.numPages }, (_, idx) =>
      (async () => {
        const pageNum = idx + 1;
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR

        //MARK: Create off-screen canvas for this page
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return [] as OCRToken[]; // Skip if canvas context unavailable

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render the current PDF page onto its canvas
        await page.render({ canvasContext: context, viewport }).promise;

        // Convert canvas to base64 PNG for Vision OCR
        const base64Image = canvas
          .toDataURL("image/png")
          .replace(/^data:image\/png;base64,/, "");

        // OCR this page image and return its tokens
        return extractTextFromImage(base64Image);
      })()
    );

    // Wait for all pages to finish OCR concurrently
    const tokenArrays = await Promise.all(pagePromises);

    // Flatten the array-of-arrays into a single token list
    tokenArrays.forEach((pageTokens) => allTokens.push(...pageTokens));

    return allTokens;
  } catch (error) {
    console.error("Error processing PDF:", error);
    return [];
  }
}
