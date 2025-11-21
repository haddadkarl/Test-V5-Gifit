import React, { useState, useCallback, useEffect } from 'react';
import { Link, PlayCircle, UploadCloud, Settings, Check, X } from 'lucide-react';
import type { OptimizationSettings } from '../types';

interface UploaderProps {
    onUrlSubmit: (url: string) => void;
    onFileSelect: (file: File) => void;
    isFetching: boolean;
    optimizationSettings: OptimizationSettings;
    onOptimizationSettingsChange: (settings: OptimizationSettings) => void;
}

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
                <p className="text-gray-400 mb-6 text-sm">Adjust settings to balance quality and file size. For large videos, lower settings are recommended to stay under 10MB.</p>
                
                <div className="space-y-4">
                    <div>
                        <label htmlFor="resolution" className="block text-sm font-medium text-gray-300 mb-1">Resolution</label>
                        <select name="resolution" id="resolution" value={tempSettings.resolution} onChange={handleSelectChange} className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-indigo-500 focus:border-indigo-500 transition-all">
                            <option value="original">Original</option>
                            <option value={720}>Max 720px</option>
                            <option value={480}>Max 480px (Recommended)</option>
                            <option value={360}>Max 360px</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="frameRate" className="block text-sm font-medium text-gray-300 mb-1">Frame Rate (FPS)</label>
                         <select name="frameRate" id="frameRate" value={tempSettings.frameRate} onChange={handleSelectChange} className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-indigo-500 focus:border-indigo-500 transition-all">
                            <option value={15}>15 (Smoothest)</option>
                            <option value={12}>12</option>
                            <option value={10}>10 (Standard)</option>
                            <option value={8}>8</option>
                            <option value={5}>5 (Smallest)</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="quality" className="block text-sm font-medium text-gray-300 mb-1">Color Quality</label>
                        <select name="quality" id="quality" value={tempSettings.quality} onChange={handleSelectChange} className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-indigo-500 focus:border-indigo-500 transition-all">
                            <option value={1}>Best (Larger file)</option>
                            <option value={10}>Good (Recommended)</option>
                            <option value={20}>Optimized (Smaller file)</option>
                        </select>
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


const FileUploader: React.FC<UploaderProps> = ({ onUrlSubmit, onFileSelect, isFetching, optimizationSettings, onOptimizationSettingsChange }) => {
    const [url, setUrl] = useState('');
    const [activeTab, setActiveTab] = useState<'upload' | 'url'>('url');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url.trim()) {
            onUrlSubmit(url.trim());
        }
    };

    const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.files && event.dataTransfer.files[0]) {
            const file = event.dataTransfer.files[0];
            if (file.type.startsWith('video/')) {
                onFileSelect(file);
            } else {
                alert("Please drop a valid video file.");
            }
        }
    }, [onFileSelect]);

    const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            onFileSelect(event.target.files[0]);
        }
    };

    const renderUrlInput = () => (
        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4 items-center">
            <div className="relative w-full">
                <Link className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="e.g., https://www.tiktok.com/@user/video/123..."
                    className="w-full bg-gray-800 border-2 border-gray-600 rounded-lg py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    required
                    disabled={isFetching}
                />
            </div>
            <button
                type="submit"
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-300"
                disabled={isFetching || !url.trim()}
            >
                <PlayCircle size={20} />
                {isFetching ? 'Fetching...' : 'Generate GIFs'}
            </button>
        </form>
    );

    const renderFileUpload = () => (
        <div 
            className="w-full p-8 border-2 border-dashed border-gray-600 rounded-lg text-center cursor-pointer hover:border-indigo-500 hover:bg-gray-800/50 transition-all"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => document.getElementById('file-input')?.click()}
        >
            <input 
                type="file" 
                id="file-input" 
                className="hidden" 
                accept="video/*"
                onChange={handleFileChange}
            />
            <UploadCloud size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-200">Click to upload or drag and drop</h3>
            <p className="text-sm text-gray-500">MP4, MOV, WebM, Ogg (Max 100MB)</p>
        </div>
    );

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
                    Create GIFs from any Video
                </h2>
            </div>

            <div className="flex justify-center mb-4 border-b border-gray-700">
                <button 
                    onClick={() => setActiveTab('url')}
                    className={`px-6 py-2 text-sm font-medium transition-colors ${activeTab === 'url' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Import from URL
                </button>
                <button 
                    onClick={() => setActiveTab('upload')}
                    className={`px-6 py-2 text-sm font-medium transition-colors ${activeTab === 'upload' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Upload File
                </button>
            </div>
            
            <div className="mt-6">
                {activeTab === 'upload' ? renderFileUpload() : renderUrlInput()}
            </div>
            
            <div className="flex items-center justify-center mt-6">
                <button onClick={() => setIsSettingsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors">
                    <Settings size={16} />
                    Optimization Settings
                </button>
            </div>

            <OptimizationSettingsModal 
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                settings={optimizationSettings}
                onSave={onOptimizationSettingsChange}
            />
        </div>
    );
};

export default FileUploader;