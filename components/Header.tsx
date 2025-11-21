
import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { subscribeToAuthChanges, loginWithGoogle, logoutUser } from '../utils/storage';

// We define a simplified User type to avoid importing the full Firebase Auth type in components
interface SimpleUser {
    displayName: string | null;
    photoURL: string | null;
    uid: string;
}

interface HeaderProps {
    onReset: () => void;
    hasContent: boolean;
    onNavigateToLibrary: () => void;
    activeTab: string;
}

const Header: React.FC<HeaderProps> = ({ onReset, hasContent, onNavigateToLibrary, activeTab }) => {
    const [user, setUser] = useState<SimpleUser | null>(null);

    useEffect(() => {
        // Subscribe to Firebase Auth state changes
        const unsubscribe = subscribeToAuthChanges((firebaseUser) => {
            if (firebaseUser) {
                setUser({
                    displayName: firebaseUser.displayName,
                    photoURL: firebaseUser.photoURL,
                    uid: firebaseUser.uid
                });
            } else {
                setUser(null);
            }
        });
        return () => unsubscribe();
    }, []);

    return (
        <header className="fixed top-0 left-0 right-0 bg-[#0f1012]/80 backdrop-blur-md z-50">
            <div className="container mx-auto px-4 py-6 flex justify-between items-center">
                <div className="flex items-center gap-6">
                    {hasContent && (
                        <button
                            onClick={onReset}
                            className="hover:opacity-80 transition-opacity"
                            title="Start Over"
                        >
                             <img 
                               src="https://raw.githubusercontent.com/haddadkarl/2-Google-Gifit/main/public/gifit-logo.png" 
                               alt="Gifit Logo" 
                               className="h-8 w-auto" 
                             />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-6">
                    {/* Library Link - Bold Purple Text */}
                    <button
                        onClick={onNavigateToLibrary}
                        className="text-sm font-bold text-[#A374FF] hover:text-[#7E53FF] transition-colors"
                    >
                        Library
                    </button>

                    {/* Auth Section */}
                    {user ? (
                         <div className="flex items-center gap-3 pl-2">
                            <div className="hidden sm:block text-right">
                                <p className="text-xs text-gray-400">Welcome,</p>
                                <p className="text-sm font-semibold text-white max-w-[100px] truncate">
                                    {user.displayName || 'User'}
                                </p>
                            </div>
                            <div className="relative group">
                                {user.photoURL ? (
                                    <img 
                                        src={user.photoURL} 
                                        alt={user.displayName || 'User'} 
                                        className="w-10 h-10 rounded-full border-2 border-indigo-500 cursor-pointer"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg border-2 border-indigo-400 cursor-pointer">
                                        {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
                                    </div>
                                )}
                                
                                {/* Dropdown Logout */}
                                <div className="absolute right-0 mt-2 w-48 bg-[#1C1C1E] border border-gray-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right">
                                    <button 
                                        onClick={logoutUser}
                                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-white/5 text-left first:rounded-t-xl last:rounded-b-xl"
                                    >
                                        <LogOut size={16} />
                                        Sign Out
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={loginWithGoogle}
                            className="text-[#8E8E93] font-medium hover:text-white transition-colors text-sm"
                        >
                            <span>Login</span>
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
