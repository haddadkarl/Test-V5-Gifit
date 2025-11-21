
import React, { useState, useEffect } from 'react';
import { X, Share2, CheckCircle, AlertCircle, LogIn, User as UserIcon, Tag, Sparkles, Save } from 'lucide-react';
import Loader from './Loader';
import { loginWithGoogle } from '../utils/storage';
import { categorizeGif } from '../services/geminiService';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (category: string) => Promise<void>;
    itemName: string;
    shareBlob?: Blob;
    currentUser: any; // We accept the user object from App.tsx
}

const CATEGORIES = [
    'Beauty', 'Fashion', 'M&E', 'Sport', 'Auto', 'Telco', 'Tech', 'Retail', 'Food', 'Beverage', 'Care', 'FinServ', 'Other'
];

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, onConfirm, itemName, shareBlob, currentUser }) => {
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[CATEGORIES.length - 1]);
    const [aiCategorized, setAiCategorized] = useState(false);

    useEffect(() => {
        if (isOpen && shareBlob) {
            // Reset states
            setSuccess(false);
            setError(null);
            setAiCategorized(false);
            
            // Start AI Analysis
            const analyze = async () => {
                setIsAnalyzing(true);
                try {
                    const category = await categorizeGif(shareBlob, CATEGORIES);
                    setSelectedCategory(category);
                    setAiCategorized(true);
                } catch (e) {
                    console.error("Categorization skipped or failed", e);
                } finally {
                    setIsAnalyzing(false);
                }
            };
            analyze();
        }
    }, [isOpen, shareBlob]);

    if (!isOpen) return null;

    const handleLogin = async () => {
        setError(null);
        try {
            await loginWithGoogle();
        } catch (err: any) {
            setError("Login failed. Please try again.");
        }
    };

    const handlePublish = async () => {
        setError(null);
        setIsUploading(true);
        try {
            // Pass selectedCategory to parent. 
            // The parent handles saving which now supports converting this single string into the initial array.
            await onConfirm(selectedCategory);
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setIsUploading(false);
            }, 1500);
        } catch (err: any) {
            setIsUploading(false);
            setError(err.message || "Upload failed. Please check your connection.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Share2 className="text-indigo-500" size={24} />
                            Share to Library
                        </h2>
                        <button onClick={onClose} disabled={isUploading} className="text-gray-400 hover:text-white transition-colors disabled:opacity-50">
                            <X size={24} />
                        </button>
                    </div>

                    {success ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in zoom-in duration-300">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle className="text-green-500" size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Saved!</h3>
                            <p className="text-gray-400">"{itemName}" has been added to the library.</p>
                        </div>
                    ) : isUploading ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Loader size="lg" />
                            <h3 className="text-xl font-bold text-white mt-4 mb-2">Uploading...</h3>
                            <p className="text-gray-400">Please wait while we save your GIF to the cloud.</p>
                        </div>
                    ) : (
                        <div>
                            {!currentUser ? (
                                <div className="flex flex-col items-center text-center py-4">
                                    <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
                                        <UserIcon className="text-gray-400" size={32} />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">Login Required</h3>
                                    <p className="text-gray-400 text-sm mb-6 max-w-xs">
                                        To ensure quality content, you must sign in with a Google account to upload GIFs to the community library.
                                    </p>
                                    <button
                                        onClick={handleLogin}
                                        className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors w-full justify-center"
                                    >
                                        <LogIn size={20} />
                                        Sign in with Google
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    <div className="bg-[#2C2C2E] rounded-lg p-4 flex items-center gap-3">
                                         {currentUser.photoURL ? (
                                            <img src={currentUser.photoURL} alt="User" className="w-10 h-10 rounded-full" />
                                         ) : (
                                            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white">
                                                {currentUser.displayName?.[0] || 'U'}
                                            </div>
                                         )}
                                         <div>
                                             <p className="text-xs text-gray-400">Posting as</p>
                                             <p className="text-sm font-bold text-white">{currentUser.displayName || 'Anonymous'}</p>
                                         </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                            {isAnalyzing ? <Sparkles size={14} className="animate-pulse text-yellow-400"/> : <Tag size={14} />}
                                            {isAnalyzing ? "AI is selecting category..." : "Category"}
                                            {aiCategorized && !isAnalyzing && <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full flex items-center gap-1"><Sparkles size={10}/> AI Selected</span>}
                                        </label>
                                        
                                        {isAnalyzing ? (
                                             <div className="w-full h-12 bg-[#0f1012] border border-gray-700 rounded-lg flex items-center px-3 gap-3 animate-pulse">
                                                 <div className="w-4 h-4 rounded-full bg-gray-600"></div>
                                                 <div className="h-4 bg-gray-600 rounded w-1/2"></div>
                                             </div>
                                        ) : (
                                            <select
                                                value={selectedCategory}
                                                onChange={(e) => setSelectedCategory(e.target.value)}
                                                className="w-full bg-[#0f1012] border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                            >
                                                {CATEGORIES.map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    
                                    <p className="text-sm text-gray-400">
                                        You are about to save <strong>"{itemName}"</strong> to the library.
                                    </p>
                                    
                                    <div className="flex justify-end gap-3 mt-2">
                                        <button
                                            onClick={onClose}
                                            className="px-4 py-2 bg-transparent hover:bg-white/5 text-gray-300 font-medium rounded-lg transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handlePublish}
                                            disabled={isAnalyzing}
                                            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Save size={18} />
                                            Save to Library
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {error && (
                                <div className="flex items-center gap-2 mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-sm">
                                    <AlertCircle size={16} />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShareModal;