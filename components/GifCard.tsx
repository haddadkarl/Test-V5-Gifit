
import React, { useState, useEffect, useRef } from 'react';
import type { GifScene } from '../types';
import { Edit2, Check } from 'lucide-react';

interface GifCardProps {
    scene: GifScene;
    onSelect: (id: string) => void;
    onNameChange: (id: string, newName: string) => void;
}

const GifCard: React.FC<GifCardProps> = ({ scene, onSelect, onNameChange }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [currentName, setCurrentName] = useState(scene.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);
    
    useEffect(() => {
        setCurrentName(scene.name);
    }, [scene.name]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCurrentName(e.target.value);
    };

    const handleSave = () => {
        if (currentName.trim() && currentName.trim() !== scene.name) {
            onNameChange(scene.id, currentName.trim());
        } else {
            setCurrentName(scene.name);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setCurrentName(scene.name);
            setIsEditing(false);
        }
    };

    const stopPropagation = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    return (
        <div
            className={`relative rounded-lg overflow-hidden border-2 transition-all duration-300 cursor-pointer group ${scene.isSelected ? 'border-indigo-500 scale-105 shadow-2xl shadow-indigo-500/30' : 'border-gray-700'}`}
            onClick={() => onSelect(scene.id)}
            role="button"
            aria-pressed={scene.isSelected}
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !isEditing && onSelect(scene.id)}
        >
            <img src={scene.dataUrl} alt={currentName} className="w-full h-auto block" />
            <div 
                className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-300"
                onClick={isEditing ? (e) => { e.stopPropagation(); handleSave(); } : undefined}
            ></div>

            <div className="absolute bottom-0 left-0 right-0 p-3" onClick={stopPropagation}>
                {isEditing ? (
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type="text"
                            value={currentName}
                            onChange={handleNameChange}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-gray-900/80 text-white text-sm font-semibold rounded-md border border-indigo-500 py-1 px-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                         <button onClick={handleSave} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white">
                            <Check size={16} />
                        </button>
                    </div>
                ) : (
                    <div className="flex justify-between items-center gap-2">
                        <p className="text-sm text-white font-semibold truncate" title={currentName}>
                            {currentName}
                        </p>
                        <button 
                            onClick={() => setIsEditing(true)} 
                            className="text-gray-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex-shrink-0"
                            aria-label={`Edit name for ${currentName}`}
                        >
                            <Edit2 size={14} />
                        </button>
                    </div>
                )}
            </div>

            <input
                type="checkbox"
                readOnly
                checked={scene.isSelected}
                className="absolute top-3 right-3 h-6 w-6 rounded border-2 border-gray-400/50 text-indigo-500 focus:ring-0 focus:ring-offset-0 bg-gray-800/50 cursor-pointer pointer-events-none"
                aria-label={`Select ${currentName}`}
            />
        </div>
    );
};

export default GifCard;