
import React, { useState, useEffect, useCallback } from 'react';
import { useVideoProcessor } from './hooks/useVideoProcessor';
import { GifScene, OptimizationSettings, ParsedGifWithMeta } from './types';
import GifCard from './components/GifCard';
import Loader from './components/Loader';
import Header from './components/Header';
import CombineModal from './components/CombineModal';
import GifFileUploader from './components/GifFileUploader';
import GifCombiner from './components/GifCombiner';
import Library from './components/Library';
import ShareModal from './components/ShareModal';
import { Download, Clapperboard, Film, Merge, UploadCloud, Settings, Check, X, PlayCircle, BookOpen, Share2, Save } from 'lucide-react';
import { parseGifFile } from './utils/gifParser';
import { saveToLibrary, subscribeToAuthChanges } from './utils/storage';


// This is a workaround for CDN-loaded scripts.
declare const JSZip: any;
declare const GIF: any;

// Fixed: Ensure 'library' is included in AppTab type to resolve type overlap errors when comparing activeTab === 'library'.
type AppTab = 'url' | 'upload' | 'combine' | 'library';

const sanitizeFilename = (name: string | null): string => {
    if (!name) return 'download';
    return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 50) || 'download';
};


// A robust polyfill for Promise.any, used for racing multiple API endpoints to find the fastest one.
const promiseAny: <T>(promises: Iterable<Promise<T>>) => Promise<T> =
    // @ts-ignore
    Promise.any?.bind(Promise) ||
    function(promises) {
        return new Promise((resolve, reject) => {
            const promisesArray = Array.from(promises);
            if (promisesArray.length === 0) {
                const aggregateError = new Error('All promises were rejected');
                // @ts-ignore
                aggregateError.errors = [];
                reject(aggregateError);
                return;
            }
            let rejectedCount = 0;
            const errors: any[] = [];
            promisesArray.forEach((promise, index) => {
                Promise.resolve(promise).then(resolve).catch(error => {
                    errors[index] = error;
                    rejectedCount++;
                    if (rejectedCount === promisesArray.length) {
                        const aggregateError = new Error('All promises were rejected');
                        // @ts-ignore
                        aggregateError.errors = errors;
                        reject(aggregateError);
                    }
                });
            });
        });
    };

// Helper function to resolve video URLs from various social media platforms.
const _resolveVideoUrl = async (url: string): Promise<string> => {
    const fetchPromises: Promise<string>[] = [];
    const TIMEOUT_MS = 30000;
    const isTikTokUrl = /tiktok\.com/.test(url);

    const connectionAttempts = [
        { name: 'thingproxy', buildUrl: (target: string) => `https://thingproxy.freeboard.io/fetch/${target}` },
        { name: 'CodeTabs', buildUrl: (target: string) => `https://api.codetabs.com/v1/proxy?quest=${target}` },
        { name: 'Direct', buildUrl: (target: string) => target },
    ];
    
    if (isTikTokUrl) {
        const tikTokResolverUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
        for (const attempt of connectionAttempts) {
            const promise = new Promise<string>(async (resolve, reject) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
                try {
                    const fetchUrl = attempt.buildUrl(tikTokResolverUrl);
                    const response = await fetch(fetchUrl, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (!response.ok) return reject(new Error(`API failed with status ${response.status} via ${attempt.name}`));
                    const videoInfo = await response.json();
                    if (videoInfo.data && typeof videoInfo.data.play === 'string' && videoInfo.data.play.length > 0) {
                        resolve(videoInfo.data.play);
                    } else {
                        reject(new Error(`TikWM (${attempt.name}) returned: ${videoInfo.msg || 'invalid format'}`));
                    }
                } catch (error: any) {
                   clearTimeout(timeoutId);
                   reject(new Error(`Fetch failed for TikWM (${attempt.name}): ${error.message}`));
                }
            });
            fetchPromises.push(promise);
        }
    }
    
    const genericResolvers = [
        { name: 'Cobalt (wuk.sh)', url: 'https://co.wuk.sh/api/json' },
        { name: 'Cobalt (api)', url: 'https://api.cobalt.tools/api/json' },
    ];
    for (const resolver of genericResolvers) {
        for (const attempt of connectionAttempts) {
            const promise = new Promise<string>(async (resolve, reject) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
                try {
                    const fetchUrl = attempt.buildUrl(resolver.url);
                    const response = await fetch(fetchUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ url, vQuality: 'max' }),
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) return reject(new Error(`API failed for ${resolver.name} via ${attempt.name}`));
                    const videoInfo = await response.json();
                    if (videoInfo && typeof videoInfo.url === 'string' && videoInfo.url.length > 0) {
                        resolve(videoInfo.url);
                    } else {
                        reject(new Error(`${resolver.name} returned: ${videoInfo.text || 'invalid format'}`));
                    }
                } catch (error: any) {
                   clearTimeout(timeoutId);
                   reject(new Error(`Fetch failed for ${resolver.name} (${attempt.name}): ${error.message}`));
                }
            });
            fetchPromises.push(promise);
        }
    }

    if (fetchPromises.length === 0) {
        throw new Error('No valid download methods could be determined for this URL.');
    }

    return promiseAny(fetchPromises);
};

// Helper function to download a video from a URL, trying various proxies if direct download fails.
const _fetchVideoFile = async (finalVideoUrl: string, setFetchStatus: (status: string) => void): Promise<File> => {
    const downloadProxies = [
        { name: 'thingproxy', buildUrl: (target: string) => `https://thingproxy.freeboard.io/fetch/${target}` },
        { name: 'CodeTabs', buildUrl: (target: string) => `https://api.codetabs.com/v1/proxy?quest=${target}` },
        { name: 'AllOrigins', buildUrl: (target: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}` },
        { name: 'cors.bridged.cc', buildUrl: (target: string) => `https://cors.bridged.cc/${target}` },
    ];
    let videoBlob: Blob | null = null;
    
    try {
        setFetchStatus('Downloading video...');
        const res = await fetch(finalVideoUrl);
        if (res.ok) videoBlob = await res.blob();
    } catch (e) {
        console.warn('Direct download failed, trying proxies.');
    }

    if (!videoBlob) {
        for (let i = 0; i < downloadProxies.length; i++) {
            const attempt = downloadProxies[i];
            setFetchStatus(`Proxy attempt ${i + 1}/${downloadProxies.length} via ${attempt.name}`);
            try {
                const res = await fetch(attempt.buildUrl(finalVideoUrl));
                if (res.ok) {
                    videoBlob = await res.blob();
                    break;
                }
            } catch (error) {
                console.warn(`Proxy ${attempt.name} failed.`);
            }
        }
    }
    
    if (!videoBlob) {
        throw new Error("Couldn't download the video. It might be private or restricted.");
    }
    
    return new File([videoBlob], `video.mp4`, { type: 'video/mp4' });
};

interface OptimizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: OptimizationSettings;
    onSave: (settings: OptimizationSettings) => void;
}

const OptimizationSettingsModal: React.FC<OptimizationModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [tempSettings, setTempSettings] = useState(settings);

    useEffect(() => {
        if (isOpen) {
            setTempSettings(settings);
        }
    }, [settings, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(tempSettings);
        onClose();
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        const isNumeric = ['resolution', 'frameRate', 'quality'].includes(name);
        
        setTempSettings(prev => ({
            ...prev,
            [name]: isNumeric ? (value === 'original' ? value : Number(value)) : value
        }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" aria-modal="true" role="dialog">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold mb-2 text-gray-100">GIF Optimization Settings</h2>
                <p className="text-gray-400 mb-6 text-sm">Adjust settings to balance quality and file size. 360p (640px) is great for sharing.</p>
                
                <div className="space-y-4">
                    <div>
                        <label htmlFor="resolution" className="block text-sm font-medium text-gray-300 mb-1">Resolution (Max Dimension)</label>
                        <select name="resolution" id="resolution" value={tempSettings.resolution} onChange={handleSelectChange} className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-indigo-500 focus:border-indigo-500 transition-all">
                            <option value="original">Original (Huge File)</option>
                            <option value={1280}>720p (HD) - Large File</option>
                            <option value={960}>960px (qHD) - Sharp</option>
                            <option value={854}>480p (SD) - Good Quality</option>
                            <option value={640}>360p - Best Balance</option>
                            <option value={480}>480px - Smallest</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="frameRate" className="block text-sm font-medium text-gray-300 mb-1">Frame Rate (FPS)</label>
                         <select name="frameRate" id="frameRate" value={tempSettings.frameRate} onChange={handleSelectChange} className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-indigo-500 focus:border-indigo-500 transition-all">
                            <option value={15}>15 (High)</option>
                            <option value={12}>12 (Smooth)</option>
                            <option value={10}>10 (Standard)</option>
                            <option value={8}>8 (Optimized)</option>
                            <option value={5}>5 (Minimal)</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="quality" className="block text-sm font-medium text-gray-300 mb-1">Color Quality</label>
                        <select name="quality" id="quality" value={tempSettings.quality} onChange={handleSelectChange} className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-indigo-500 focus:border-indigo-500 transition-all">
                            <option value={1}>Best (Slowest)</option>
                            <option value={5}>High</option>
                            <option value={10}>Good</option>
                            <option value={20}>Optimized (Smallest File)</option>
                        </select>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-4 bg-gray-700/50 p-3 rounded-lg">
                        <input 
                            type="checkbox" 
                            id="dither" 
                            name="dither"
                            checked={tempSettings.dither}
                            onChange={(e) => setTempSettings(prev => ({ ...prev, dither: e.target.checked }))}
                            className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500 focus:ring-offset-gray-800 cursor-pointer"
                        />
                        <div>
                            <label htmlFor="dither" className="block text-sm font-medium text-white cursor-pointer">Enable Dithering</label>
                            <p className="text-xs text-gray-400">Reduces banding but increases file size. Keep off for smallest files.</p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition-all">
                        <X size={18} />
                        Cancel
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all">
                        <Check size={18} />
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    // General state
    const [activeTab, setActiveTab] = useState<AppTab>('url');
    const [url, setUrl] = useState('');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [baseName, setBaseName] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Video to GIF state
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [scenes, setScenes] = useState<GifScene[]>([]);
    const [isCombineModalOpen, setIsCombineModalOpen] = useState(false);
    const [fullVideoProgress, setFullVideoProgress] = useState(0);
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [fetchStatus, setFetchStatus] = useState<string>('');
    const [workerScriptUrl, setWorkerScriptUrl] = useState<string | null>(null);
    const [optimizationSettings, setOptimizationSettings] = useState<OptimizationSettings>({
        resolution: 640, // 640x360 (360p) - Significant size reduction.
        frameRate: 8,
        quality: 20, // Aggressive optimization.
        dither: false,
    });
    const [loadingStates, setLoadingStates] = useState({
        isZipping: false,
        isZippingAll: false,
        isConvertingFullVideo: false,
    });
    
    // Combine GIFs state
    const [parsedGifs, setParsedGifs] = useState<ParsedGifWithMeta[]>([]);
    const [isParsingGifs, setIsParsingGifs] = useState(false);
    const [isCombining, setIsCombining] = useState(false);
    const [gifParseError, setGifParseError] = useState<string | null>(null);
    
    // Library Sharing
    const [shareItem, setShareItem] = useState<{ blob: Blob, name: string } | null>(null);

    // Auth Observer
    useEffect(() => {
        const unsubscribe = subscribeToAuthChanges((user) => {
            setCurrentUser(user);
        });
        return () => unsubscribe();
    }, []);

    // Create the worker script URL from a Blob to avoid CORS issues.
    useEffect(() => {
        let objectUrl: string | null = null;
        const createWorkerUrl = async () => {
            try {
                const response = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js');
                if (!response.ok) throw new Error(`Network response was not ok`);
                const scriptText = await response.text();
                const blob = new Blob([scriptText], { type: 'application/javascript' });
                objectUrl = URL.createObjectURL(blob);
                setWorkerScriptUrl(objectUrl);
            } catch (err) {
                console.error("Failed to create worker script URL:", err);
                setFetchError("Failed to initialize GIF generator. Please refresh the page.");
            }
        };
        createWorkerUrl();
        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, []);

    const { 
        processedScenes, 
        isProcessing: isSplittingVideo, 
        progress, 
        error: processingError 
    } = useVideoProcessor(videoFile, workerScriptUrl, optimizationSettings, baseName);

    useEffect(() => {
        if (processedScenes.length > 0) {
            setScenes(processedScenes);
        }
    }, [processedScenes]);
    
    const resetVideoState = useCallback(() => {
        setVideoFile(null);
        setBaseName(null);
        setScenes([]);
        setFullVideoProgress(0);
        setIsFetching(false);
        setFetchError(null);
        setFetchStatus('');
        setIsCombineModalOpen(false);
        setLoadingStates({
            isZipping: false,
            isZippingAll: false,
            isConvertingFullVideo: false,
        });
    }, []);

    const handleFileSelect = useCallback((file: File) => {
        resetVideoState();
        setVideoFile(file);
        setActiveTab('upload');
    }, [resetVideoState]);
    
    const handleUrlSubmit = useCallback(async (url: string) => {
        resetVideoState();
        setIsFetching(true);
        setFetchError(null);
        
        const tiktokMatch = url.match(/tiktok\.com\/@([^/?#]+)/);
        if (tiktokMatch && tiktokMatch[1]) {
            setBaseName(tiktokMatch[1]);
        }
        
        try {
            const isDirectLink = /\.(mp4|webm|mov|ogg)$/i.test(url);
            let finalVideoUrl: string;

            if (isDirectLink) {
                finalVideoUrl = url;
            } else {
                setFetchStatus('Racing to find the fastest video source...');
                finalVideoUrl = await _resolveVideoUrl(url);
            }
            
            setFetchStatus('Downloading video...');
            const file = await _fetchVideoFile(finalVideoUrl, setFetchStatus);
            setVideoFile(file);
        } catch (error: any) {
            console.error("URL processing failed:", error);
            const errorMessage = error?.errors?.[0]?.message || error.message || 'Please try a different link or upload a file.';
            setFetchError(`Could not resolve video link. ${errorMessage}`);
        } finally {
            setIsFetching(false);
        }
    }, [resetVideoState]);
    
    const handleGifFilesSelect = async (files: File[]) => {
        resetCombineState();
        setIsParsingGifs(true);
        setGifParseError(null);
        try {
            const parsed = await Promise.all(
                files.map(async (file, index) => {
                    const parsedGif = await parseGifFile(file);
                    return {
                        ...parsedGif,
                        id: `${Date.now()}-${index}`,
                        name: file.name.replace(/\.gif$/i, '') || `GIF ${index + 1}`,
                        url: URL.createObjectURL(file),
                    };
                })
            );
            setParsedGifs(parsed);
            setIsCombining(true);
        } catch (error: any) {
            setGifParseError(error.message || 'An error occurred while parsing the GIFs.');
            console.error('GIF parsing failed:', error);
        } finally {
            setIsParsingGifs(false);
        }
    };

    const handleSelectScene = (id: string) => {
        setScenes(prev => prev.map(scene => scene.id === id ? { ...scene, isSelected: !scene.isSelected } : scene));
    };

    const handleNameChange = (id: string, newName: string) => {
        setScenes(prev => prev.map(scene => scene.id === id ? { ...scene, name: newName } : scene));
    };

    const handleDownloadSelected = async () => {
        const selectedScenes = scenes.filter(s => s.isSelected);
        if (selectedScenes.length === 0) return;

        setLoadingStates(s => ({...s, isZipping: true}));
        try {
            if (selectedScenes.length === 1) {
                const scene = selectedScenes[0];
                const response = await fetch(scene.dataUrl);
                const blob = await response.blob();
                const filename = `${sanitizeFilename(scene.name)}.gif`;
                triggerDownload(blob, filename);
            } else {
                const zip = new JSZip();
                await Promise.all(selectedScenes.map(async (scene) => {
                    const response = await fetch(scene.dataUrl);
                    const blob = await response.blob();
                    const filename = `${sanitizeFilename(scene.name)}.gif`;
                    zip.file(filename, blob);
                }));
                const content = await zip.generateAsync({ type: 'blob' });
                triggerDownload(content, 'gifs-selection.zip');
            }
        } catch (error) {
            console.error("Failed to download selected GIF(s):", error);
        } finally {
            setLoadingStates(s => ({...s, isZipping: false}));
        }
    };
    
    // New Share Handler
    const handleInitShare = async (blobOrUrl: Blob | string, name: string) => {
        try {
            let blob: Blob;
            if (typeof blobOrUrl === 'string') {
                const response = await fetch(blobOrUrl);
                blob = await response.blob();
            } else {
                blob = blobOrUrl;
            }
            setShareItem({ blob, name });
        } catch (e) {
            console.error("Failed to prepare share item", e);
            alert("Failed to prepare item for sharing.");
        }
    };
    
    const confirmShare = async (category: string) => {
        if (!shareItem) return;
        try {
            // Call firebase upload method which takes the blob directly
            await saveToLibrary(shareItem.blob, shareItem.name, category);
            setShareItem(null);
            // Switch to library tab to show the new item
            setActiveTab('library');
        } catch (error: any) {
            console.error("Failed to save to library:", error);
            throw error; // Re-throw for modal to handle
        }
    };
    
    const handleDownloadAll = async () => {
        if (scenes.length === 0) return;
        setLoadingStates(s => ({...s, isZippingAll: true}));
        try {
            const zip = new JSZip();
            await Promise.all(scenes.map(async (scene) => {
                const response = await fetch(scene.dataUrl);
                const blob = await response.blob();
                const filename = `${sanitizeFilename(scene.name)}.gif`;
                zip.file(filename, blob);
            }));
            const content = await zip.generateAsync({ type: 'blob' });
            triggerDownload(content, 'gifs-all.zip');
        } catch (error) {
            console.error("Failed to zip all GIFs:", error);
        } finally {
            setLoadingStates(s => ({...s, isZippingAll: false}));
        }
    };

    const handleDownloadFullVideoAsGif = async () => {
        if (!videoFile || !workerScriptUrl) return;

        setLoadingStates(s => ({...s, isConvertingFullVideo: true }));
        setFullVideoProgress(0);

        const video = document.createElement('video');
        video.muted = true;
        const videoSrc = URL.createObjectURL(videoFile);
        video.src = videoSrc;
        
        try {
            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => resolve();
                video.onerror = () => reject(new Error("Failed to load video metadata."));
            });

            let { videoWidth, videoHeight } = video;
            const { resolution, frameRate, quality, dither } = optimizationSettings;

            if (resolution !== 'original') {
                const largerDim = Math.max(videoWidth, videoHeight);
                if (largerDim > resolution) {
                    const scale = resolution / largerDim;
                    videoWidth = Math.floor(videoWidth * scale);
                    videoHeight = Math.floor(videoHeight * scale);
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = videoWidth;
            canvas.height = videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not get canvas context.");

            // Enable high-quality image smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const gif = new GIF({ 
                workers: 2, 
                quality, 
                dither: dither ? "FloydSteinberg" : false,
                workerScript: workerScriptUrl, 
                width: videoWidth, 
                height: videoHeight 
            });
            
            const totalFrames = Math.floor(video.duration * frameRate);
            for (let i = 0; i < totalFrames; i++) {
                const time = i / frameRate;
                await new Promise<void>((resolve, reject) => {
                    const seekTimeout = setTimeout(() => reject(new Error('Video seek timed out')), 5000);
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        clearTimeout(seekTimeout);
                        resolve();
                    };
                    video.addEventListener('seeked', onSeeked);
                    video.currentTime = time;
                });
                
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const frameImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                gif.addFrame(frameImageData, { delay: 1000 / frameRate });
                setFullVideoProgress(((i + 1) / totalFrames) * 100);
            }

            gif.on('finished', (blob: Blob) => {
                triggerDownload(blob, 'full-video.gif');
                setLoadingStates(s => ({...s, isConvertingFullVideo: false}));
            });
            gif.render();
        } catch (error: any) {
            console.error("Failed to convert full video to GIF:", error);
            alert(`An error occurred while converting the video: ${error.message}`);
            setLoadingStates(s => ({...s, isConvertingFullVideo: false}));
        } finally {
             URL.revokeObjectURL(videoSrc);
        }
    };
    
    const triggerDownload = (blob: Blob, fileName: string) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };

    const resetCombineState = () => {
        parsedGifs.forEach(gif => URL.revokeObjectURL(gif.url));
        setParsedGifs([]);
        setIsCombining(false);
        setGifParseError(null);
        setIsParsingGifs(false);
    };
    
    const resetAll = () => {
        resetVideoState();
        resetCombineState();
        setUrl('');
        setActiveTab('url');
    };

    const handleOptimizationSettingsChange = useCallback((settings: OptimizationSettings) => {
        setOptimizationSettings(settings);
    }, []);

    const handleCloseCombineModal = () => {
        setIsCombineModalOpen(false);
        // Deselect all scenes after combining/closing modal
        setScenes(prevScenes =>
            prevScenes.map(scene => ({ ...scene, isSelected: false }))
        );
    };

    const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.files && event.dataTransfer.files[0]) {
            const file = event.dataTransfer.files[0];
            if (file.type.startsWith('video/')) {
                handleFileSelect(file);
            } else {
                alert("Please drop a valid video file.");
            }
        }
    }, [handleFileSelect]);

    const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };
    
    const handleLocalFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            handleFileSelect(event.target.files[0]);
        }
    };

    const handleLocalUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url.trim()) {
            handleUrlSubmit(url.trim());
        }
    };

    const hasContent = scenes.length > 0 || isSplittingVideo || isFetching || isCombining || isParsingGifs || activeTab === 'library';
    const selectedCount = scenes.filter(s => s.isSelected).length;
    const isBusy = loadingStates.isZipping || loadingStates.isZippingAll || loadingStates.isConvertingFullVideo;

    const downloadSelectedText = selectedCount > 1 
        ? `Download ${selectedCount} Selected (Zip)`
        : `Download ${selectedCount} Selected`;

    const downloadingSelectedText = selectedCount > 1
        ? 'Zipping...'
        : 'Downloading...';

    const renderVideoTab = () => {
        return (
            <>
                {isFetching && !fetchError && (
                     <div className="text-center">
                        <Loader size="lg" />
                        <h3 className="text-2xl font-semibold text-gray-300 mt-4">{fetchStatus || 'Fetching video...'}</h3>
                    </div>
                )}
                {fetchError && (
                    <div className="text-center my-8 p-4 bg-red-900/50 border border-red-700 rounded-lg max-w-2xl mx-auto">
                        <p className="font-semibold">An Error Occurred</p>
                        <p className="text-red-300">{fetchError}</p>
                    </div>
                )}
                {isSplittingVideo && (
                    <div className="text-center">
                        <h3 className="text-2xl font-semibold mb-4 text-gray-300">Splitting Video into GIFs...</h3>
                        <div className="w-full max-w-md mx-auto bg-gray-700 rounded-full h-2.5">
                            <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                        <p className="mt-2 text-gray-400">{Math.round(progress)}% Complete</p>
                    </div>
                )}
                {processingError && (
                     <div className="text-center my-8 p-4 bg-red-900/50 border border-red-700 rounded-lg max-w-2xl mx-auto">
                        <p className="font-semibold">Video Processing Error</p>
                        <p className="text-red-300">{processingError}</p>
                    </div>
                )}

                {scenes.length > 0 && (
                    <div className="flex flex-col gap-8">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <h2 className="text-3xl font-bold text-gray-200">Generated Scenes</h2>
                            <div className="flex flex-wrap gap-3">
                                <button onClick={() => setIsCombineModalOpen(true)} disabled={selectedCount < 2 || isBusy} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all">
                                    <Merge size={18} />
                                    Combine {selectedCount} Selected
                                </button>
                                <button onClick={handleDownloadSelected} disabled={selectedCount === 0 || isBusy} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all">
                                    {loadingStates.isZipping ? <Loader size="sm" /> : <Download size={18} />}
                                    {loadingStates.isZipping ? downloadingSelectedText : downloadSelectedText}
                                </button>
                                <button onClick={handleDownloadAll} disabled={isBusy} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all">
                                    {loadingStates.isZippingAll ? <Loader size="sm" /> : <Clapperboard size={18} />}
                                    {loadingStates.isZippingAll ? 'Zipping...' : `Download All ${scenes.length} (Zip)`}
                                </button>
                                <button onClick={handleDownloadFullVideoAsGif} disabled={isBusy} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all">
                                    {loadingStates.isConvertingFullVideo ? <Loader size="sm" /> : <Film size={18} />}
                                    {loadingStates.isConvertingFullVideo ? `Converting... ${Math.round(fullVideoProgress)}%` : 'Download Full Video as GIF'}
                                </button>
                                {/* Save Single Selected */}
                                {selectedCount === 1 && (
                                    <button 
                                        onClick={() => {
                                            const selected = scenes.find(s => s.isSelected);
                                            if (selected) handleInitShare(selected.dataUrl, selected.name);
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-lg shadow-md hover:opacity-90 transition-all"
                                    >
                                        <Share2 size={18} />
                                        Save
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {scenes.map(scene => (
                                <GifCard key={scene.id} scene={scene} onSelect={handleSelectScene} onNameChange={handleNameChange} />
                            ))}
                        </div>
                    </div>
                )}
            </>
        )
    }
    
    const renderCombineTab = () => {
         return (
            <>
                {isParsingGifs && (
                    <div className="text-center">
                        <Loader size="lg" />
                        <h3 className="text-2xl font-semibold text-gray-300 mt-4">Parsing your GIFs...</h3>
                    </div>
                )}
                {gifParseError && (
                     <div className="text-center my-8 p-4 bg-red-900/50 border border-red-700 rounded-lg max-w-2xl mx-auto">
                        <p className="font-semibold">GIF Parsing Error</p>
                        <p className="text-red-300">{gifParseError}</p>
                    </div>
                )}
                {isCombining && parsedGifs.length > 0 && (
                    <GifCombiner 
                        gifs={parsedGifs} 
                        onBack={resetCombineState} 
                        onGifsUpdate={setParsedGifs}
                        onShare={handleInitShare}
                    />
                )}
            </>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <Header 
                onReset={resetAll} 
                hasContent={hasContent} 
                onNavigateToLibrary={() => setActiveTab('library')}
                activeTab={activeTab}
            />

            <main className={`flex-grow ${hasContent ? 'container mx-auto px-4 pb-12 pt-28' : 'flex items-center justify-center p-4'}`}>
                {!hasContent ? (
                    <div className="relative w-full max-w-6xl mt-20 lg:mt-0">
                        {/* LEFT CONTENT */}
                        <div className="relative z-10 flex flex-col max-w-xl mx-auto lg:mx-0 lg:-ml-[-120px]">
                            <img src="https://raw.githubusercontent.com/haddadkarl/2-Google-Gifit/main/public/gifit-logo.png" alt="GifIt Logo" className="w-full max-w-lg h-auto mb-8" />

                            {/* Tabs - Removed Library from here */}
                            <div className="flex items-center gap-8 mb-6 border-b border-[#2C2C2E]">
                                <button
                                    onClick={() => setActiveTab('url')}
                                    className={`text-base font-medium transition-colors relative pb-3 ${activeTab === 'url' ? 'text-white' : 'text-[#8E8E93] hover:text-white'}`}
                                >
                                    Import from URL
                                    {activeTab === 'url' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#A374FF] to-[#7E53FF] rounded-full"></div>}
                                </button>
                                <button
                                    onClick={() => setActiveTab('upload')}
                                    className={`text-base font-medium transition-colors relative pb-3 ${activeTab === 'upload' ? 'text-white' : 'text-[#8E8E93] hover:text-white'}`}
                                >
                                    Upload File
                                    {activeTab === 'upload' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#A374FF] to-[#7E53FF] rounded-full"></div>}
                                </button>
                                <button
                                    onClick={() => setActiveTab('combine')}
                                    className={`text-base font-medium transition-colors relative pb-3 ${activeTab === 'combine' ? 'text-white' : 'text-[#8E8E93] hover:text-white'}`}
                                >
                                    GIFs Combiner
                                    {activeTab === 'combine' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#A374FF] to-[#7E53FF] rounded-full"></div>}
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div className="mt-6 space-y-8">
                                {activeTab === 'url' && (
                                    <form onSubmit={handleLocalUrlSubmit} className="flex flex-col gap-6 items-start">
                                        <div className="relative p-px rounded-[2rem] w-full" style={{background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 100%)'}}>
                                            <div className="bg-[#0f1012] rounded-[calc(2rem-1px)] p-1">
                                                <input
                                                    type="url"
                                                    value={url}
                                                    onChange={(e) => setUrl(e.target.value)}
                                                    placeholder="Paste TikTok url here..."
                                                    className="w-full bg-transparent border-none py-3 px-5 text-white text-base placeholder:text-[#8E8E93] focus:outline-none focus:ring-0"
                                                    required
                                                    disabled={isFetching}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-start sm:flex-row sm:items-center gap-4 mt-2">
                                            <button
                                                type="submit"
                                                className="flex items-center justify-center gap-3 text-base font-bold text-white px-8 py-3 bg-gradient-to-r from-[#A374FF] to-[#7E53FF] rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isFetching || !url.trim()}
                                            >
                                                <PlayCircle size={20} />
                                                <span>{isFetching ? 'Fetching...' : 'Generate GIFs'}</span>
                                            </button>
                                            <button type="button" onClick={() => setIsSettingsModalOpen(true)} className="flex items-center justify-center gap-3 text-sm font-bold text-white px-8 py-3 bg-[#2C2C2E] rounded-full hover:bg-white/20 transition-colors">
                                                <Settings size={18} />
                                                <span>Optimization Settings</span>
                                            </button>
                                        </div>
                                    </form>
                                )}
                                {activeTab === 'upload' && (
                                    <div
                                        className="w-full max-w-full lg:max-w-[420px] mx-auto lg:mx-0 p-8 bg-[#1C1C1E] border-2 border-dashed border-[#434343] rounded-3xl text-center cursor-pointer hover:border-indigo-500 transition-all"
                                        onDrop={onDrop}
                                        onDragOver={onDragOver}
                                        onClick={() => document.getElementById('file-input')?.click()}
                                    >
                                        <input
                                        type="file"
                                        id="file-input"
                                        className="hidden"
                                        accept="video/*"
                                        onChange={handleLocalFileChange}
                                        />
                                        <UploadCloud size={48} className="mx-auto text-[#8E8E93] mb-4" />
                                        <h3 className="text-lg font-semibold text-white">Click to upload or drag and drop</h3>
                                        <p className="text-sm text-[#8E8E93]">MP4, MOV, WebM, Ogg (Max 100MB)</p>
                                    </div>
                                )}
                                {activeTab === 'combine' && (
                                    <GifFileUploader onGifFilesSelect={handleGifFilesSelect} />
                                )}
                                 {fetchError && (
                                    <div className="text-left my-4 p-4 bg-red-900/50 border border-red-700 rounded-lg max-w-2xl">
                                        <p className="font-semibold text-red-200">An Error Occurred</p>
                                        <p className="text-red-300">{fetchError}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* HERO IMAGE */}
                        <div className="mt-8 flex justify-center lg:mt-0 lg:pointer-events-none lg:absolute lg:right-[85px] lg:top-[-20px] lg:z-20">
                             <img
                               src="https://raw.githubusercontent.com/haddadkarl/2-Google-Gifit/main/public/gifit-hero.png"
                               className="w-56 sm:w-64 md:w-72 lg:w-[380px] max-w-full rounded-[32px] object-contain"
                               alt="A woman with blue hair wearing silver pants and unicorn slippers"
                             />
                        </div>
                    </div>
                ) : (
                    <div className="container mx-auto">
                        {activeTab === 'combine' ? renderCombineTab() : activeTab === 'library' ? <Library currentUser={currentUser} /> : renderVideoTab()}
                    </div>
                )}
            </main>
            <footer className="text-center text-sm text-[#8E8E93] py-4">
                © Gifffit — Made by Haddady
            </footer>
            {isCombineModalOpen && (
                <CombineModal
                    isOpen={isCombineModalOpen}
                    onClose={handleCloseCombineModal}
                    scenes={scenes.filter(s => s.isSelected)}
                    workerScriptUrl={workerScriptUrl}
                    onShare={handleInitShare}
                />
            )}
            <OptimizationSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                settings={optimizationSettings}
                onSave={handleOptimizationSettingsChange}
            />
            
            <ShareModal 
                isOpen={!!shareItem}
                onClose={() => setShareItem(null)}
                onConfirm={confirmShare}
                itemName={shareItem?.name || 'GIF'}
                shareBlob={shareItem?.blob}
                currentUser={currentUser}
            />
        </div>
    );
};

export default App;
