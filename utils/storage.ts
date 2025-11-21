
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import type { LibraryItem } from '../types';

// ------------------------------------------------------------------
// FIREBASE CONFIGURATION
// ------------------------------------------------------------------
const firebaseConfig = {
    apiKey: "REPLACE_WITH_YOUR_API_KEY",
    authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
    projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
    storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
    messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
    appId: "REPLACE_WITH_YOUR_APP_ID"
};

let db: any;
let storage: any;
let auth: any;
let isFirebaseInitialized = false;

// --- Mock Data & State for Demo Mode ---
const MOCK_LIBRARY_ITEMS: LibraryItem[] = [
    {
        id: '1',
        name: 'Summer Collection Showcase',
        url: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=600&q=80',
        category: 'Fashion',
        categories: ['Fashion'],
        createdAt: Date.now() - 10000000
    },
    {
        id: '2',
        name: 'Goal Highlight',
        url: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=600&q=80',
        category: 'Sport',
        categories: ['Sport'],
        createdAt: Date.now() - 20000000
    },
    {
        id: '3',
        name: 'Skincare Routine',
        url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=600&q=80',
        category: 'Beauty',
        categories: ['Beauty'],
        createdAt: Date.now() - 30000000
    },
    {
        id: '4',
        name: 'Tech Review',
        url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80',
        category: 'Tech',
        categories: ['Tech'],
        createdAt: Date.now() - 40000000
    },
    {
        id: '5',
        name: 'Delicious Burger',
        url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
        category: 'Food',
        categories: ['Food'],
        createdAt: Date.now() - 50000000
    },
    {
        id: '6',
        name: 'Luxury Car Show',
        url: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=600&q=80',
        category: 'Auto',
        categories: ['Auto'],
        createdAt: Date.now() - 60000000
    },
    {
        id: '7',
        name: 'Concert Vibes',
        url: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?auto=format&fit=crop&w=600&q=80',
        category: 'M&E',
        categories: ['M&E'],
        createdAt: Date.now() - 70000000
    },
    {
        id: '8',
        name: 'Financial Charts',
        url: 'https://images.unsplash.com/photo-1611974765270-ca1258634369?auto=format&fit=crop&w=600&q=80',
        category: 'FinServ',
        categories: ['FinServ'],
        createdAt: Date.now() - 80000000
    },
    {
        id: '9',
        name: 'Refreshing Drink',
        url: 'https://images.unsplash.com/photo-1543573852-1a71a6ce19bc?auto=format&fit=crop&w=600&q=80',
        category: 'Beverage',
        categories: ['Beverage'],
        createdAt: Date.now() - 90000000
    }
];

let localMockItems = [...MOCK_LIBRARY_ITEMS];
let mockUser: any = null;
const mockAuthListeners: ((user: any) => void)[] = [];

// Initialize Firebase
try {
    if (firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY") {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        storage = getStorage(app);
        auth = getAuth(app);
        isFirebaseInitialized = true;
    } else {
        console.warn("Firebase config is missing. Using Mock Mode for demonstration.");
    }
} catch (error) {
    console.error("Error initializing Firebase:", error);
}

const COLLECTION_NAME = 'community_library';

// --- Auth Functions ---

export const loginWithGoogle = async () => {
    if (isFirebaseInitialized && auth) {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Login failed:", error);
            throw error;
        }
    } else {
        // Mock Login
        mockUser = {
            uid: 'demo-user-123',
            displayName: 'Demo User',
            photoURL: null
        };
        mockAuthListeners.forEach(cb => cb(mockUser));
        return Promise.resolve();
    }
};

export const logoutUser = async () => {
    if (isFirebaseInitialized && auth) {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    } else {
        // Mock Logout
        mockUser = null;
        mockAuthListeners.forEach(cb => cb(null));
        return Promise.resolve();
    }
};

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
    if (isFirebaseInitialized && auth) {
        return onAuthStateChanged(auth, callback);
    } else {
        // Mock Subscription
        mockAuthListeners.push(callback);
        callback(mockUser); // Initial state
        return () => {
            const index = mockAuthListeners.indexOf(callback);
            if (index > -1) mockAuthListeners.splice(index, 1);
        };
    }
};

export const getCurrentUser = (): User | null => {
    if (isFirebaseInitialized && auth) {
        return auth?.currentUser || null;
    }
    return mockUser;
};

// --- Storage Functions ---

export const saveToLibrary = async (blob: Blob, name: string, category: string): Promise<void> => {
    const user = getCurrentUser();
    
    if (!user) {
        throw new Error("You must be logged in to save to the library.");
    }

    if (isFirebaseInitialized) {
        try {
            // 1. Upload File to Firebase Storage
            const filename = `gifs/${user.uid}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.gif`;
            const storageRef = ref(storage, filename);
            
            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);

            // 2. Save Metadata to Firestore
            await addDoc(collection(db, COLLECTION_NAME), {
                name: name,
                url: downloadURL,
                category: category, // Deprecated single field
                categories: [category], // New array field
                createdAt: Date.now(),
                userId: user.uid,
                userName: user.displayName || 'Anonymous',
                userPhoto: user.photoURL || null
            });

        } catch (error) {
            console.error("Error saving to library:", error);
            throw error;
        }
    } else {
        // Mock Save
        return new Promise(resolve => {
            setTimeout(() => {
                const newItem: LibraryItem = {
                    id: Date.now().toString(),
                    name,
                    url: URL.createObjectURL(blob), // Works for session
                    category,
                    categories: [category],
                    createdAt: Date.now()
                };
                localMockItems.unshift(newItem); // Add to top
                resolve();
            }, 1500);
        });
    }
};

export const getLibraryItems = async (): Promise<LibraryItem[]> => {
    if (isFirebaseInitialized) {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            
            const items: LibraryItem[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Backward compatibility: use 'categories' array if exists, otherwise wrap 'category'
                const categories = Array.isArray(data.categories) 
                    ? data.categories 
                    : (data.category ? [data.category] : ['Other']);

                items.push({
                    id: doc.id,
                    name: data.name || 'Untitled GIF',
                    url: data.url,
                    category: categories[0], // Primary category for legacy display
                    categories: categories,
                    createdAt: data.createdAt || 0
                });
            });
            
            return items;
        } catch (error) {
            console.error("Error fetching library items:", error);
            return [];
        }
    } else {
        // Mock Fetch
        return new Promise(resolve => {
            setTimeout(() => {
                resolve([...localMockItems]);
            }, 800);
        });
    }
};

export const updateItemCategories = async (itemId: string, newCategories: string[]): Promise<void> => {
    const user = getCurrentUser();
    if (!user) throw new Error("Must be logged in to edit.");

    if (isFirebaseInitialized) {
        try {
            const itemRef = doc(db, COLLECTION_NAME, itemId);
            // We update both the array and the primary legacy string
            await updateDoc(itemRef, {
                categories: newCategories,
                category: newCategories.length > 0 ? newCategories[0] : 'Other'
            });
        } catch (error) {
            console.error("Error updating categories:", error);
            throw error;
        }
    } else {
        // Mock Update
        return new Promise(resolve => {
            localMockItems = localMockItems.map(item => {
                if (item.id === itemId) {
                    return {
                        ...item,
                        categories: newCategories,
                        category: newCategories[0] || 'Other'
                    };
                }
                return item;
            });
            resolve();
        });
    }
};

export const isConfigured = () => isFirebaseInitialized;