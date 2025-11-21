
import { useState, useEffect, useRef } from 'react';
import type { GifScene, OptimizationSettings } from '../types';

// This is a workaround for gif.js being loaded from a CDN.
declare const GIF: any;

// New constants for intelligent scene detection
const COMPARISON_CANVAS_WIDTH = 48; // Use a small canvas for fast frame comparison
const DIFFERENCE_THRESHOLD = 15;    // % difference threshold to detect a scene change. Tuned for sensitivity.
const MIN_SCENE_FRAMES = 10;        // A scene must have at least 10 frames (~1 sec at 10fps) to become a GIF.

/**
 * This function compares two low-res frames by converting them to grayscale
 * and calculating the average pixel difference. It's fast and effective.
 * @param data1 Pixel data of the first frame.
 * @param data2 Pixel data of the second frame.
 * @returns The difference as a percentage.
 */
const calculateFrameDifference = (data1: Uint8ClampedArray, data2: Uint8ClampedArray): number => {
    let diff = 0;
    // Simple grayscale conversion for performance. We only need to compare luminance.
    for (let i = 0; i < data1.length; i += 4) {
        const gray1 = 0.299 * data1[i] + 0.587 * data1[i + 1] + 0.114 * data1[i + 2];
        const gray2 = 0.299 * data2[i] + 0.587 * data2[i + 1] + 0.114 * data2[i + 2];
        diff += Math.abs(gray1 - gray2);
    }
    // Return the difference as a percentage of the max possible difference.
    return (diff / (255 * (data1.length / 4))) * 100;
};


export const useVideoProcessor = (videoFile: File | null, workerScriptUrl: string | null, settings: OptimizationSettings, baseName: string | null) => {
    const [processedScenes, setProcessedScenes] = useState<GifScene[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (!videoFile || !workerScriptUrl) return;

        const abortController = new AbortController();

        const processVideo = async () => {
            setIsProcessing(true);
            setError(null);
            // Clean up URLs from previous runs to prevent memory leaks
            setProcessedScenes(oldScenes => {
                oldScenes.forEach(s => URL.revokeObjectURL(s.dataUrl));
                return [];
            });
            setProgress(0);

            const video = document.createElement('video');
            videoRef.current = video;
            video.src = URL.createObjectURL(videoFile);
            video.muted = true;

            const highResCanvas = document.createElement('canvas');
            const highResCtx = highResCanvas.getContext('2d');
            
            const comparisonCanvas = document.createElement('canvas');
            // 'willReadFrequently' is a performance hint for the browser
            const comparisonCtx = comparisonCanvas.getContext('2d', { willReadFrequently: true });


            video.onloadedmetadata = async () => {
                try {
                    if (abortController.signal.aborted || !highResCtx || !comparisonCtx) return;

                    let { videoWidth, videoHeight } = video;
                    const { resolution, frameRate, quality, dither } = settings;

                    if (resolution !== 'original') {
                        const largerDim = Math.max(videoWidth, videoHeight);
                        if (largerDim > resolution) {
                            const scale = resolution / largerDim;
                            videoWidth = Math.floor(videoWidth * scale);
                            videoHeight = Math.floor(videoHeight * scale);
                        }
                    }

                    if (!videoWidth || !videoHeight || !isFinite(videoWidth) || !isFinite(videoHeight)) {
                        setError("Could not determine video dimensions. The file may be invalid.");
                        setIsProcessing(false);
                        return;
                    }
                    
                    highResCanvas.width = videoWidth;
                    highResCanvas.height = videoHeight;
                    
                    // Enable high-quality image smoothing
                    highResCtx.imageSmoothingEnabled = true;
                    highResCtx.imageSmoothingQuality = 'high';
                    
                    // Set comparison canvas dimensions while maintaining aspect ratio
                    const comparisonHeight = Math.round(COMPARISON_CANVAS_WIDTH * (videoHeight / videoWidth));
                    comparisonCanvas.width = COMPARISON_CANVAS_WIDTH;
                    comparisonCanvas.height = comparisonHeight;

                    const gifSettings = {
                        workers: 2,
                        quality: quality,
                        dither: dither ? "FloydSteinberg" : false,
                        workerScript: workerScriptUrl,
                        width: videoWidth,
                        height: videoHeight
                    };

                    const createGifFromFrames = async (frames: { data: ImageData, delay: number }[], sceneId: number): Promise<GifScene | null> => {
                        if (frames.length === 0) return null;
                        
                        const gif = new GIF(gifSettings);
                        frames.forEach(frame => gif.addFrame(frame.data, { delay: frame.delay }));
                        
                        return new Promise((resolve, reject) => {
                           const renderTimeout = setTimeout(() => reject(new Error(`GIF rendering timed out for Scene ${sceneId}`)), 20000);
                           gif.on('finished', (finishedBlob: Blob) => {
                               clearTimeout(renderTimeout);
                               const dataUrl = URL.createObjectURL(finishedBlob);
                               resolve({
                                   id: `${sceneId}`,
                                   dataUrl: dataUrl,
                                   frames: frames,
                                   isSelected: false, 
                                   name: baseName ? `${baseName} ${sceneId}` : `Scene ${sceneId}`
                               });
                           });
                           gif.render();
                        });
                    };

                    let lastFrameData: Uint8ClampedArray | null = null;
                    let currentSceneFrames: { data: ImageData, delay: number }[] = [];
                    const scenes: GifScene[] = [];
                    let sceneCount = 0;
                    
                    const totalFramesToProcess = Math.floor(video.duration * frameRate);

                    for (let i = 0; i < totalFramesToProcess; i++) {
                        if (abortController.signal.aborted) return;
                        
                        const time = i / frameRate;
                        
                        await new Promise<void>((resolve, reject) => {
                            const seekTimeout = setTimeout(() => reject(new Error(`Video seek timed out at ${time.toFixed(2)}s`)), 5000);
                            const onSeeked = () => {
                                video.removeEventListener('seeked', onSeeked);
                                clearTimeout(seekTimeout);
                                resolve();
                            };
                            video.addEventListener('seeked', onSeeked);
                            video.currentTime = time;
                        });

                        // Capture high-res frame for the GIF
                        highResCtx.drawImage(video, 0, 0, highResCanvas.width, highResCanvas.height);
                        const highResFrameData = highResCtx.getImageData(0, 0, highResCanvas.width, highResCanvas.height);

                        // Capture low-res frame for scene detection
                        comparisonCtx.drawImage(video, 0, 0, comparisonCanvas.width, comparisonCanvas.height);
                        const currentFrameData = comparisonCtx.getImageData(0, 0, comparisonCanvas.width, comparisonCanvas.height).data;
                        
                        let isSceneCut = false;
                        if (lastFrameData) {
                            const difference = calculateFrameDifference(currentFrameData, lastFrameData);
                            if (difference > DIFFERENCE_THRESHOLD) {
                                isSceneCut = true;
                            }
                        } else {
                             // The first frame always starts a new scene.
                            isSceneCut = true;
                        }

                        if (isSceneCut && currentSceneFrames.length >= MIN_SCENE_FRAMES) {
                            sceneCount++;
                            const newScene = await createGifFromFrames(currentSceneFrames, sceneCount);
                            if (newScene) {
                                scenes.push(newScene);
                                setProcessedScenes([...scenes]);
                            }
                            currentSceneFrames = [];
                        }

                        currentSceneFrames.push({ data: highResFrameData, delay: 1000 / frameRate });
                        lastFrameData = currentFrameData;
                        setProgress(((i + 1) / totalFramesToProcess) * 100);
                    }
                    
                    // Process the last remaining scene
                    if (currentSceneFrames.length >= MIN_SCENE_FRAMES) {
                         sceneCount++;
                         const newScene = await createGifFromFrames(currentSceneFrames, sceneCount);
                         if (newScene) {
                            scenes.push(newScene);
                            setProcessedScenes([...scenes]);
                         }
                    }

                    if (scenes.length === 0 && totalFramesToProcess > 0) {
                         setError("No scenes could be detected. The video might be too short or a single continuous scene. Try adjusting Optimization Settings.");
                    }

                } catch (e: any) {
                    console.error("Error during video processing:", e);
                    setError(e.message || "An error occurred while generating GIFs.");
                } finally {
                    setIsProcessing(false);
                }
            };
            video.onerror = () => {
                setError("Could not load video file. It may be corrupted or unsupported.");
                setIsProcessing(false);
            };
        };

        processVideo();
    
        return () => {
            abortController.abort();
            if (videoRef.current && videoRef.current.src) {
                URL.revokeObjectURL(videoRef.current.src);
            }
        };
    }, [videoFile, workerScriptUrl, settings, baseName]);

    return { processedScenes, isProcessing, progress, error };
};