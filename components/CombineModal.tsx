

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GifScene } from '../types';
import Loader from './Loader';
import { X, Download, Scissors, MoveVertical, Share2 } from 'lucide-react';

declare const GIF: any;

interface CombineModalProps {
    isOpen: boolean;
    onClose: () => void;
    scenes: GifScene[];
    workerScriptUrl: string | null;
    onShare: (blob: Blob, name: string) => void;
}

const sanitizeFilename = (name: string | null): string => {
    if (!name) return 'download';
    return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 50) || 'download';
};

const formatTime = (seconds: number) => `${seconds.toFixed(2)}s`;

const CombineModal: React.FC<CombineModalProps> = ({ isOpen, onClose, scenes, workerScriptUrl, onShare }) => {
    const [orderedScenes, setOrderedScenes] = useState<GifScene[]>(scenes);
    const [combinedGif, setCombinedGif] = useState<{ url: string | null, blob: Blob | null }>({ url: null, blob: null });
    const [isGenerating, setIsGenerating] = useState(false);
    const [allFrames, setAllFrames] = useState<{ data: ImageData, delay: number }[]>([]);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    
    const combinedGifUrlRef = useRef<string | null>(null);
    const generationTimeoutRef = useRef<number | null>(null);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const startFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const endFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const { totalDuration, startTime, endTime, selectedDuration } = useMemo(() => {
        if (allFrames.length === 0) {
            return { totalDuration: 0, startTime: 0, endTime: 0, selectedDuration: 0 };
        }
        const totalDurationMs = allFrames.reduce((acc, f) => acc + f.delay, 0);
        const startTimeMs = allFrames.slice(0, trimStart).reduce((acc, f) => acc + f.delay, 0);
        const selectedDurationMs = allFrames.slice(trimStart, trimEnd + 1).reduce((acc, f) => acc + f.delay, 0);
        const endTimeMs = startTimeMs + selectedDurationMs;

        return { 
            totalDuration: totalDurationMs / 1000, 
            startTime: startTimeMs / 1000, 
            endTime: endTimeMs / 1000,
            selectedDuration: selectedDurationMs / 1000
        };
    }, [allFrames, trimStart, trimEnd]);

    // Effect for cleaning up the object URL when the modal is closed (unmounted) to prevent memory leaks.
    useEffect(() => {
        return () => {
            if (combinedGifUrlRef.current) {
                URL.revokeObjectURL(combinedGifUrlRef.current);
            }
        };
    }, []);

    const generateCombinedGif = useCallback(async (framesToCombine: { data: ImageData, delay: number }[], startFrame: number, endFrame: number) => {
        if (!workerScriptUrl || framesToCombine.length === 0) return;

        setIsGenerating(true);
        const trimmedFrames = framesToCombine.slice(startFrame, endFrame + 1);

        // If frames are trimmed to zero, clear the existing GIF.
        if (trimmedFrames.length === 0 || startFrame > endFrame) {
            if (combinedGifUrlRef.current) {
                URL.revokeObjectURL(combinedGifUrlRef.current);
                combinedGifUrlRef.current = null;
            }
            setCombinedGif({ url: null, blob: null });
            setIsGenerating(false);
            return;
        }

        const firstFrame = trimmedFrames[0].data;
        const gif = new GIF({
            workers: 2,
            quality: 10,
            workerScript: workerScriptUrl,
            width: firstFrame.width,
            height: firstFrame.height,
        });

        trimmedFrames.forEach(frame => {
            gif.addFrame(frame.data, { delay: frame.delay });
        });

        gif.on('finished', (blob: Blob) => {
            if (combinedGifUrlRef.current) {
                URL.revokeObjectURL(combinedGifUrlRef.current);
            }
            const url = URL.createObjectURL(blob);
            combinedGifUrlRef.current = url;
            setCombinedGif({ url, blob });
            setIsGenerating(false);
        });

        gif.render();
    }, [workerScriptUrl]);

    // Re-calculate frames when scene order changes
    useEffect(() => {
        const all = orderedScenes.flatMap(scene => scene.frames);
        setAllFrames(all);
        setTrimStart(0);
        setTrimEnd(all.length > 0 ? all.length - 1 : 0);
    }, [orderedScenes]);

    // Debounce GIF generation when trimming or frames change
    useEffect(() => {
        if (isOpen && allFrames.length > 0) {
            if (generationTimeoutRef.current) {
                clearTimeout(generationTimeoutRef.current);
            }
            generationTimeoutRef.current = window.setTimeout(() => {
                generateCombinedGif(allFrames, trimStart, trimEnd);
            }, 300);
        }
        return () => {
            if (generationTimeoutRef.current) {
                clearTimeout(generationTimeoutRef.current);
            }
        };
    }, [isOpen, allFrames, trimStart, trimEnd, generateCombinedGif]);

    // Update trim preview canvases
    useEffect(() => {
        if (allFrames.length > 0 && trimEnd < allFrames.length) {
            const startCanvas = startFrameCanvasRef.current;
            const endCanvas = endFrameCanvasRef.current;
            const startFrameData = allFrames[trimStart]?.data;
            const endFrameData = allFrames[trimEnd]?.data;

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
    }, [trimStart, trimEnd, allFrames]);
    
    const handleDragSort = () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        const newOrderedScenes = [...orderedScenes];
        const draggedItemContent = newOrderedScenes.splice(dragItem.current, 1)[0];
        newOrderedScenes.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setOrderedScenes(newOrderedScenes);
    };

    const handleDownload = () => {
        if (!combinedGif.blob || orderedScenes.length === 0) return;

        const link = document.createElement('a');
        link.href = URL.createObjectURL(combinedGif.blob);
        const filename = `${sanitizeFilename(orderedScenes[0].name)}-combined.gif`;
        link.download = filename;
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <header className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-gray-100">Combine & Edit GIF</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
                </header>

                <main className="flex-grow p-4 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto">
                    <div className="md:col-span-1 flex flex-col gap-2 overflow-y-auto pr-2">
                        <h3 className="text-lg font-semibold text-gray-300 mb-2">Reorder Scenes</h3>
                        {orderedScenes.map((scene, index) => (
                            <div
                                key={scene.id}
                                draggable
                                onDragStart={() => (dragItem.current = index)}
                                onDragEnter={() => (dragOverItem.current = index)}
                                onDragEnd={handleDragSort}
                                onDragOver={(e) => e.preventDefault()}
                                className="flex items-center gap-3 p-2 bg-gray-700 rounded-md cursor-grab active:cursor-grabbing"
                            >
                                <MoveVertical className="text-gray-400" size={20} />
                                <img src={scene.dataUrl} alt={scene.name} className="w-16 h-16 object-cover rounded" />
                                <span className="font-semibold text-gray-200 truncate">{scene.name}</span>
                            </div>
                        ))}
                    </div>
                    
                    <div className="md:col-span-2 flex flex-col gap-4">
                        <h3 className="text-lg font-semibold text-gray-300">Preview & Trim</h3>
                        <div className="relative w-full aspect-video bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden">
                            {isGenerating && <Loader size="lg" />}
                            {!isGenerating && combinedGif.url && <img src={combinedGif.url} alt="Combined GIF Preview" className="max-w-full max-h-full object-contain" />}
                            {!isGenerating && !combinedGif.url && <p className="text-gray-500">No preview available</p>}
                        </div>

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
                                    <input type="range" min={0} max={allFrames.length > 0 ? allFrames.length - 1 : 0} value={trimStart} onChange={handleStartTrimChange} aria-label="Trim start frame" className="absolute w-full h-2 top-1/2 -translate-y-1/2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto" />
                                    <input type="range" min={0} max={allFrames.length > 0 ? allFrames.length - 1 : 0} value={trimEnd} onChange={handleEndTrimChange} aria-label="Trim end frame" className="absolute w-full h-2 top-1/2 -translate-y-1/2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto" />
                                </div>
                                <div className="flex justify-between">
                                     <span>Total: {allFrames.length} frames ({formatTime(totalDuration)})</span>
                                     <span>Selected: {trimEnd >= trimStart ? trimEnd - trimStart + 1 : 0} frames ({formatTime(selectedDuration)})</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="flex justify-end gap-4 p-4 border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-all">Cancel</button>
                    
                    <button 
                        onClick={() => combinedGif.blob && onShare(combinedGif.blob, `${orderedScenes[0].name} (Combined)`)}
                        disabled={!combinedGif.blob || isGenerating}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
                    >
                        <Share2 size={18} />
                        Add to Library
                    </button>

                    <button 
                        onClick={handleDownload}
                        disabled={!combinedGif.blob || isGenerating}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all"
                    >
                        <Download size={18} />
                        Download GIF
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default CombineModal;
