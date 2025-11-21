import React, { useCallback } from 'react';
import { UploadCloud } from 'lucide-react';

interface GifFileUploaderProps {
    onGifFilesSelect: (files: File[]) => void;
}

const GifFileUploader: React.FC<GifFileUploaderProps> = ({ onGifFilesSelect }) => {
    
    const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            const files = Array.from(event.dataTransfer.files).filter((file: File) => file.type === 'image/gif');
            if (files.length > 0) {
                onGifFilesSelect(files);
            } else {
                alert("Please drop valid GIF files.");
            }
        }
    }, [onGifFilesSelect]);

    const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const files = Array.from(event.target.files).filter(file => file.type === 'image/gif');
            if (files.length > 0) {
                onGifFilesSelect(files);
            } else {
                alert("Please select valid GIF files.");
            }
        }
    };

    return (
  <div
    className="w-full max-w-full lg:max-w-[420px] mx-auto lg:mx-0 px-6 py-6 sm:px-8 sm:py-8 bg-[#1C1C1E] border-2 border-dashed border-[#434343] rounded-3xl text-center cursor-pointer hover:border-indigo-500 transition-all"
    onDrop={onDrop}
    onDragOver={onDragOver}
    onClick={() => document.getElementById('gif-file-input')?.click()}
  >
    <input
      type="file"
      id="gif-file-input"
      className="hidden"
      accept="image/gif"
      multiple
      onChange={handleFileChange}
    />
    <UploadCloud size={48} className="mx-auto text-[#8E8E93] mb-4" />
    <h3 className="text-lg font-semibold text-white">
      Click to upload or drag and drop
    </h3>
    <p className="text-sm text-[#8E8E93]">Select multiple GIF files to combine</p>
  </div>
    );
};

export default GifFileUploader;