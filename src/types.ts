import { ArtDetails } from './services/artService';
export type { ArtDetails };

export interface HistoryItem {
  id: string;
  image: string;
  additionalImages?: string[];
  details: ArtDetails;
  timestamp: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  lastLogin: number;
  isGalleryPublic: boolean;
  isBucketListPublic: boolean;
  level: number;
  totalXP: number;
  scansByMovement: Record<string, number>;
  badges: string[];
}

export interface MuseumStamp {
  id: string;
  museumId: string;
  museumName: string;
  timestamp: number;
  location: { lat: number; lng: number };
}

export interface QuizHistory {
  id: string;
  date: string;
  artworkId: string;
  isCorrect: boolean;
  xpEarned: number;
}

export interface DailyQuizQuestion {
  id: string;
  artworkTitle: string;
  imageUrl: string;
  type: 'artist' | 'movement' | 'period' | 'title';
  correctAnswer: string;
  options: string[];
  hint: string;
  isAiGenerated: boolean;
}

export interface DailyQuizSession {
  date: string;
  questions: DailyQuizQuestion[];
}
