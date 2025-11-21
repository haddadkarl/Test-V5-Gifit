
import React, { useEffect, useState, useMemo } from 'react';
import { getLibraryItems, isConfigured, updateItemCategories } from '../utils/storage';
import type { LibraryItem } from '../types';
import Loader from './Loader';
import { Download, Image as ImageIcon, AlertTriangle, Edit2, X, Check } from 'lucide-react';

const CATEGORIES = [
    'All', 'Beauty', 'Fashion', 'M&E', 'Sport', 'Auto', 'Telco', 'Tech', 'Retail', 'Food', 'Beverage', 'Care', 'FinServ'
];

// Available tags for editing (excluding 'All')
const TAGS = CATEGORIES.filter(c => c !== 'All');

interface LibraryProps {
    currentUser: any;
}

const Library: React.FC<LibraryProps> = ({ currentUser }) => {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);

    useEffect(() => {
        loadLibrary();
    }, []);

    const loadLibrary = async () => {
        try {
            const libraryItems = await getLibraryItems();
            setItems(libraryItems);
        } catch (error) {
            console.error("Failed to load library:", error);
            setError("Failed to load community GIFs. Please check your connection.");
        } finally {
            setLoading(false);
        }
    };

    const filteredItems = useMemo(() => {
        if (selectedCategory === 'All') return items;
        return items.filter(item => item.categories.includes(selectedCategory));
    }, [items, selectedCategory]);

    const handleDownload = async (item: LibraryItem) => {
        try {
            const response = await fetch(item.url);
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${item.name}.gif`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (e) {
            console.error("Download failed:", e);
            alert("Failed to download file.");
        }
    };

    const handleSaveCategories = async (itemId: string, newCategories: string[]) => {
        if (newCategories.length === 0) {
            alert("Please select at least one category.");
            return;
        }
        try {
            await updateItemCategories(itemId, newCategories);
            // Update local state
            setItems(prev => prev.map(item => 
                item.id === itemId 
                ? { ...item, categories: newCategories, category: newCategories[0] } 
                : item
            ));
            setEditingItem(null);
        } catch (err) {
            alert("Failed to update tags.");
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader size="lg" />
                <p className="mt-4 text-gray-400">Loading library...</p>
            </div>
        );
    }

    if (error) {
         return (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mb-6 border border-red-900/50">
                    <AlertTriangle className="text-red-500" size={40} />
                </div>
                <h3 className="text-2xl font-bold text-gray-300 mb-2">Error</h3>
                <p className="text-gray-500 max-w-lg">{error}</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex flex-col">
                     {!isConfigured() && (
                         <span className="text-xs text-yellow-500/80 mt-1 flex items-center gap-1">
                             <AlertTriangle size={12} /> 
                             Demo Mode (Mock Data)
                         </span>
                     )}
                </div>
            </div>
            
            {/* Category Navigation */}
            <div className="mb-8 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="flex gap-2">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                                selectedCategory === cat 
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md' 
                                : 'bg-[#1C1C1E] text-gray-400 hover:bg-white/10 hover:text-white border border-[#2C2C2E]'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>
            
            {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-4 border border-dashed border-gray-800 rounded-2xl">
                    <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                        <ImageIcon className="text-gray-600" size={40} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-300 mb-2">No GIFs Found</h3>
                    <p className="text-gray-500 max-w-md">
                        {selectedCategory === 'All' 
                            ? "No GIFs have been shared yet. Be the first!" 
                            : `No GIFs found in the ${selectedCategory} category.`}
                    </p>
                </div>
            ) : (
                /* Grid Layout with Fixed 9:16 Aspect Ratio */
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredItems.map((item) => (
                        <div key={item.id} className="group relative bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10">
                            <div className="w-full aspect-[9/16] bg-gray-900 relative">
                                <img 
                                    src={item.url} 
                                    alt={item.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover block"
                                />
                                
                                {/* Tags overlay (only shows first 2) */}
                                <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[90%] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                    {item.categories.slice(0, 2).map(tag => (
                                        <span key={tag} className="px-2 py-0.5 bg-black/60 backdrop-blur-md text-white text-[10px] rounded-full border border-white/10">
                                            {tag}
                                        </span>
                                    ))}
                                    {item.categories.length > 2 && (
                                        <span className="px-2 py-0.5 bg-black/60 backdrop-blur-md text-white text-[10px] rounded-full border border-white/10">
                                            +{item.categories.length - 2}
                                        </span>
                                    )}
                                </div>

                                {/* Action Overlay */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <div className="w-full h-full flex items-center justify-center">
                                        <button 
                                            onClick={() => handleDownload(item)}
                                            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-transform hover:scale-110"
                                            title="Download GIF"
                                        >
                                            <Download size={24} />
                                        </button>
                                    </div>
                                    
                                    {currentUser && (
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingItem(item);
                                            }}
                                            className="absolute bottom-2 right-2 p-1 bg-black/60 hover:bg-indigo-600 text-white rounded-full backdrop-blur-md transition-all hover:scale-110 border border-white/10 shadow-lg"
                                            title="Edit Categories"
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Minimal Edit Categories Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl shadow-2xl w-full max-w-sm p-5 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-white">Edit Categories</h3>
                            <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <EditCategoryContent item={editingItem} onSave={handleSaveCategories} />
                    </div>
                </div>
            )}
        </div>
    );
};

// Sub-component for the edit logic to keep main component clean
const EditCategoryContent: React.FC<{ item: LibraryItem, onSave: (id: string, cats: string[]) => void }> = ({ item, onSave }) => {
    const [selected, setSelected] = useState<string[]>(item.categories);

    const toggleTag = (tag: string) => {
        if (selected.includes(tag)) {
            setSelected(selected.filter(t => t !== tag));
        } else {
            setSelected([...selected, tag]);
        }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-6 max-h-[50vh] overflow-y-auto">
                {TAGS.map(tag => {
                    const isActive = selected.includes(tag);
                    return (
                        <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                isActive 
                                ? 'bg-indigo-600 border-indigo-500 text-white' 
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                            }`}
                        >
                            {tag}
                        </button>
                    );
                })}
            </div>
            <button 
                onClick={() => onSave(item.id, selected)}
                disabled={selected.length === 0}
                className="w-full py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
                <Check size={16} /> Save Changes
            </button>
        </div>
    );
};

export default Library;
