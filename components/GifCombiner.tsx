
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ParsedGifWithMeta, ParsedGifFrame } from '../types';
import Loader from './Loader';
import { X, Download, Scissors, MoveVertical, ArrowLeft, Share2 } from 'lucide-react';
import GIF from 'gif.js';

interface GifCombinerProps {
    gifs: ParsedGifWithMeta[];
    onBack: () => void;
    onGifsUpdate: (gifs: ParsedGifWithMeta[]) => void;
    onShare: (blob: Blob, name: string) => void;
}

const formatTime = (seconds: number) => `${seconds.toFixed(2)}s`;

const GifCombiner: React.FC<GifCombinerProps> = ({ gifs, onBack, onGifsUpdate, onShare }) => {
    const [orderedGifs, setOrderedGifs] = useState<ParsedGifWithMeta[]>(gifs);
    const [flatFrames, setFlatFrames] = useState<ParsedGifFrame[]>([]);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [combinedGif, setCombinedGif] = useState<{ url: string | null, blob: Blob | null }>({ url: null, blob: null });
    const [isGenerating, setIsGenerating] = useState(false);
    const [workerUrl, setWorkerUrl] = useState<string | null>(null);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const generationTimeoutRef = useRef<number | null>(null);
    const startFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const endFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const { totalDuration, startTime, endTime, selectedDuration } = useMemo(() => {
        if (flatFrames.length === 0) {
            return { totalDuration: 0, startTime: 0, endTime: 0, selectedDuration: 0 };
        }
        const totalDurationMs = flatFrames.reduce((acc, f) => acc + f.delay, 0);
        const startTimeMs = flatFrames.slice(0, trimStart).reduce((acc, f) => acc + f.delay, 0);
        const selectedDurationMs = flatFrames.slice(trimStart, trimEnd + 1).reduce((acc, f) => acc + f.delay, 0);
        const endTimeMs = startTimeMs + selectedDurationMs;

        return { 
            totalDuration: totalDurationMs / 1000, 
            startTime: startTimeMs / 1000, 
            endTime: endTimeMs / 1000,
            selectedDuration: selectedDurationMs / 1000
        };
    }, [flatFrames, trimStart, trimEnd]);

    useEffect(() => {
        let objectUrl: string | null = null;
        const createWorkerUrl = async () => {
            try {
                const response = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js');
                if (!response.ok) throw new Error(`Network response was not ok`);
                const scriptText = await response.text();
                const blob = new Blob([scriptText], { type: 'application/javascript' });
                objectUrl = URL.createObjectURL(blob);
                setWorkerUrl(objectUrl);
            } catch (err) {
                console.error("Failed to create worker script URL:", err);
            }
        };
        createWorkerUrl();
        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, []);

    useEffect(() => {
        const all = orderedGifs.flatMap(gif => gif.frames);
        setFlatFrames(all);
        setTrimStart(0);
        setTrimEnd(all.length > 0 ? all.length - 1 : 0);
    }, [orderedGifs]);

    const generateCombinedGif = useCallback(async () => {
        if (!workerUrl || flatFrames.length === 0 || orderedGifs.length === 0) return;
        if (trimStart > trimEnd) {
            setCombinedGif({ url: null, blob: null });
            return;
        }

        setIsGenerating(true);
        const framesToCombine = flatFrames.slice(trimStart, trimEnd + 1);
        if (framesToCombine.length === 0) {
            setIsGenerating(false);
            return;
        }
        
        const firstGif = orderedGifs[0];
        const gif = new GIF({
            workers: 2,
            quality: 10,
            workerScript: workerUrl,
            width: firstGif.width,
            height: firstGif.height,
        });

        framesToCombine.forEach(frame => {
            gif.addFrame(frame.imageData, { delay: frame.delay });
        });
        
        gif.on('finished', (blob: Blob) => {
            const url = URL.createObjectURL(blob);
            setCombinedGif(prev => {
                if (prev.url) URL.revokeObjectURL(prev.url);
                return { url, blob };
            });
            setIsGenerating(false);
        });

        gif.render();
    }, [workerUrl, flatFrames, orderedGifs, trimStart, trimEnd]);
    
    // Debounced, automatic GIF generation
    useEffect(() => {
        if (!workerUrl || flatFrames.length === 0) {
            setCombinedGif(prev => {
                if (prev.url) URL.revokeObjectURL(prev.url);
                return { url: null, blob: null };
            });
            return;
        };

        if (generationTimeoutRef.current) clearTimeout(generationTimeoutRef.current);

        setIsGenerating(true);
        generationTimeoutRef.current = window.setTimeout(() => {
            generateCombinedGif();
        }, 500);

        return () => {
            if (generationTimeoutRef.current) clearTimeout(generationTimeoutRef.current);
        };

    }, [workerUrl, flatFrames, trimStart, trimEnd, generateCombinedGif]);

    // Update trim preview canvases
    useEffect(() => {
        if (flatFrames.length > 0 && trimEnd < flatFrames.length) {
            const startCanvas = startFrameCanvasRef.current;
            const endCanvas = endFrameCanvasRef.current;
            const startFrameData = flatFrames[trimStart]?.imageData;
            const endFrameData = flatFrames[trimEnd]?.imageData;

            if (startCanvas && startFrameData) {
                const ctx = startCanvas.getContext('2d');
                startCanvas.width = startFrameData.width;
                startCanvas.height = startFrameData.height;
                if (ctx) ctx.putImageData(startFrameData, 0, 0);
            }

            if (endCanvas && endFrameData) {
                const ctx = endCanvas.getContext('2d');
                endCanvas.width = endFrameData.width;
                endCanvas.height = endFrameData.height;
                if (ctx) ctx.putImageData(endFrameData, 0, 0);
            }
        }
    }, [trimStart, trimEnd, flatFrames]);

    const handleDragSort = () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        const newOrderedGifs = [...orderedGifs];
        const draggedItemContent = newOrderedGifs.splice(dragItem.current, 1)[0];
        newOrderedGifs.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setOrderedGifs(newOrderedGifs);
        onGifsUpdate(newOrderedGifs);
    };
    
    const handleDownload = () => {
        if (!combinedGif.blob) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(combinedGif.blob);
        link.download = 'combined.gif';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };

    const handleStartTrimChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newStart = parseInt(e.target.value, 10);
        setTrimStart(Math.min(newStart, trimEnd));
    };

    const handleEndTrimChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newEnd = parseInt(e.target.value, 10);
        setTrimEnd(Math.max(newEnd, trimStart));
    };
    
    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors">
                    <ArrowLeft size={16} />
                    Back
                </button>
                <h2 className="text-3xl font-bold text-gray-200">Combine & Edit GIFs</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 flex flex-col gap-2 overflow-y-auto pr-2 max-h-[60vh]">
                     <h3 className="text-lg font-semibold text-gray-300 mb-2">Reorder Scenes</h3>
                    {orderedGifs.map((gif, index) => (
                         <div
                            key={gif.id}
                            draggable
                            onDragStart={() => (dragItem.current = index)}
                            onDragEnter={() => (dragOverItem.current = index)}
                            onDragEnd={handleDragSort}
                            onDragOver={(e) => e.preventDefault()}
                            className="flex items-center gap-3 p-2 bg-gray-700 rounded-md cursor-grab active:cursor-grabbing"
                        >
                            <MoveVertical className="text-gray-400 flex-shrink-0" size={20} />
                            <img src={gif.url} alt={gif.name} className="w-12 h-12 object-cover rounded flex-shrink-0" />
                            <span className="font-semibold text-gray-200 truncate" title={gif.name}>{gif.name}</span>
                        </div>
                    ))}
                </div>

                <div className="md:col-span-2 flex flex-col gap-4">
                    <div className="bg-gray-700 p-4 rounded-lg">
                        <div className="flex items-center gap-3 mb-3">
                            <Scissors size={20} className="text-indigo-400"/>
                            <h4 className="font-semibold text-gray-200">Trimming Timeline</h4>
                        </div>
                        <div className="flex justify-between items-start gap-4 mb-4">
                            <div className="flex-1 text-center">
                                <h5 className="text-sm font-medium text-gray-300 mb-1">Start Frame: {trimStart}</h5>
                                <p className="text-xs text-indigo-300 font-mono mb-2">@{formatTime(startTime)}</p>
                                <canvas 
                                    ref={startFrameCanvasRef}
                                    className="w-full aspect-video bg-gray-900 rounded border border-gray-600 object-contain"
                                    aria-label={`Preview of start frame ${trimStart}`}
                                ></canvas>
                            </div>
                            <div className="flex-1 text-center">
                                <h5 className="text-sm font-medium text-gray-300 mb-1">End Frame: {trimEnd}</h5>
                                <p className="text-xs text-indigo-300 font-mono mb-2">@{formatTime(endTime)}</p>
                                <canvas 
                                    ref={endFrameCanvasRef}
                                    className="w-full aspect-video bg-gray-900 rounded border border-gray-600 object-contain"
                                    aria-label={`Preview of end frame ${trimEnd}`}
                                ></canvas>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 text-sm text-gray-400">
                            <div className="relative h-5">
                                <input type="range" min={0} max={flatFrames.length > 0 ? flatFrames.length - 1 : 0} value={trimStart} onChange={handleStartTrimChange} aria-label="Trim start frame" className="absolute w-full h-2 top-1/2 -translate-y-1/2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto" style={{ zIndex: trimStart > (flatFrames.length / 2) ? 5 : 4 }}/>
                                <input type="range" min={0} max={flatFrames.length > 0 ? flatFrames.length - 1 : 0} value={trimEnd} onChange={handleEndTrimChange} aria-label="Trim end frame" className="absolute w-full h-2 top-1/2 -translate-y-1/2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto" />
                            </div>
                            <div className="flex justify-between mt-1">
                                 <span>Total: {flatFrames.length} frames ({formatTime(totalDuration)})</span>
                                 <span>Selected: {trimEnd >= trimStart ? trimEnd - trimStart + 1 : 0} frames ({formatTime(selectedDuration)})</span>
                            </div>
                        </div>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-300 mt-2">Live Preview</h3>
                     <div className="relative w-full aspect-video bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden border border-gray-600">
                        {isGenerating && <Loader size="lg" />}
                        {!isGenerating && combinedGif.url && <img src={combinedGif.url} alt="Combined GIF Preview" className="max-w-full max-h-full object-contain" />}
                        {!isGenerating && !combinedGif.url && <p className="text-gray-500">Preview will appear here</p>}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => combinedGif.blob && onShare(combinedGif.blob, 'Combined GIF')} disabled={!combinedGif.blob || isGenerating} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-lg hover:opacity-90 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all">
                            <Share2 size={18} />
                            Share to Library
                        </button>
                        <button onClick={handleDownload} disabled={!combinedGif.blob || isGenerating} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all">
                            <Download size={18} />
                            Download GIF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GifCombiner;