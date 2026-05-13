import { ArtDetails } from './services/artService';

export interface HistoryItem {
  id: string;
  image: string;
  details: ArtDetails;
  timestamp: number;
}
