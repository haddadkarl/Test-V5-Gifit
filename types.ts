
export interface GifScene {
    id: string;
    dataUrl: string;
    isSelected: boolean;
    frames: { data: ImageData; delay: number }[];
    name: string;
}

export interface OptimizationSettings {
    resolution: 'original' | number;
    frameRate: number;
    quality: number;
    dither: boolean;
}

export interface ParsedGifFrame {
    imageData: ImageData;
    delay: number;
}
  
export interface ParsedGif {
    width: number;
    height: number;
    frames: ParsedGifFrame[];
}
  
export interface ParsedGifWithMeta extends ParsedGif {
    id: string;
    name: string;
    url: string;
}

export interface LibraryItem {
    id: string;
    name: string;
    url: string; // Remote URL (Firebase Storage)
    category?: string; // Deprecated, kept for backward compatibility
    categories: string[]; // New: Support multiple tags
    createdAt: number;
}