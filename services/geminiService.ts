
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Analyzes a GIF blob using Gemini 2.5 Flash to determine its best fit category.
 * @param blob The GIF file blob.
 * @param categories The list of available categories.
 * @returns A promise resolving to the category name.
 */
export const categorizeGif = async (blob: Blob, categories: string[]): Promise<string> => {
    try {
        const base64 = await blobToBase64(blob);
        // Strip the data URL prefix to get just the base64 data
        const data = base64.split(',')[1];

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: blob.type || 'image/gif',
                            data: data
                        }
                    },
                    {
                        text: `Analyze the visual content of this GIF. Categorize it into exactly one of the following categories: ${categories.join(', ')}. 
                        
                        Rules:
                        1. Return ONLY the category name as a plain string.
                        2. Do not add punctuation or explanation.
                        3. If it fits multiple, pick the most dominant one.
                        4. If it doesn't fit well, return 'Other'.`
                    }
                ]
            }
        });

        const text = result.text?.trim();
        if (!text) return 'Other';

        // Cleanup and fuzzy match
        const cleanText = text.replace(/['"`.]/g, '').trim();
        const matchedCategory = categories.find(c => c.toLowerCase() === cleanText.toLowerCase());
        
        return matchedCategory || 'Other';

    } catch (error) {
        console.error("Error categorizing GIF with Gemini:", error);
        return 'Other';
    }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
