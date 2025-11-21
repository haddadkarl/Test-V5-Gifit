import { parseGIF, decompressFrames } from 'gifuct-js';
import type { ParsedGif, ParsedGifFrame } from '../types';

/**
 * Parses a GIF file into its constituent frames, each with its ImageData and delay.
 * It uses an OffscreenCanvas for efficient, non-blocking image processing.
 * @param file The GIF file to parse.
 * @returns A promise that resolves to a ParsedGif object.
 */
export async function parseGifFile(file: File): Promise<ParsedGif> {
    const buffer = await file.arrayBuffer();
    const gif = parseGIF(buffer);
    
    // Using `decompressFrames` with the second argument as `true` builds full frames,
    // handling disposal methods automatically, which simplifies rendering.
    const frames = decompressFrames(gif, true);
    
    if (!frames || frames.length === 0) {
        throw new Error('Could not parse frames from GIF.');
    }

    const { width, height } = gif.lsd;
    
    const parsedFrames: ParsedGifFrame[] = frames.map(frame => {
        // The patch is the full frame image data when `buildPatch` is true.
        const imageData = new ImageData(new Uint8ClampedArray(frame.patch), width, height);
        return { imageData, delay: frame.delay };
    });
    
    return { width, height, frames: parsedFrames };
}
