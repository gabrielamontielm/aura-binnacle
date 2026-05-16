# 🖋️ Design Specification: ArtLens AI

ArtLens AI is a sophisticated web application designed to bridge the gap between physical art observation and digital knowledge archiving. This document outlines the technical architecture, feature behavior, and design principles of the system.

---

## 🏗️ 1. System Architecture

The application is built using a modern full-stack serverless architecture.

- **Frontend**: React 18+ with Vite, utilizing functional components and hooks.
- **Styling**: Tailwind CSS with an "Artistic/Minimalist" theme (Ivory backgrounds, Charcoal ink, Coral accents).
- **AI Engine**: Google Gemini 1.5 Pro/Flash integration for image identification and contextual entity extraction.
- **Persistence**: Firebase Firestore for user history, bucket lists, and public sharing.
- **Authentication**: Firebase Authentication (Google Login).

---

## 🖼️ 2. Core Feature Specifications

### 2.1 Artwork Identification (AI Lens)
- **Input**: User-uploaded image files (JPG, PNG, HEIC) or image URLs.
- **Processing**: 
    - HEIC files are transcoded on the fly using `heic2any`.
    - Images are sent to `artService.ts` which uses the `@google/genai` SDK.
    - **Prompt Engineering**: Uses structured JSON output prompts to ensure consistent data extraction (Artist, Title, Year, Medium, Description, Movement).
- **Feedback**: A multi-stage loading experience (0-100%) with randomized "neural analysis" status messages to maintain engagement during API latency.

### 2.2 Advanced Gallery & Filtering
- **Grid View**: A responsive masonry-style layout for browsing scanned items.
- **Multi-select Filters**:
    - **Medium**: Dynamic list based on items in the user's collection.
    - **Museum/Location**: Categorizes items by their current exhibition site.
    - **Temporal Range**: Supports BCE and CE dates with a numeric range selector.
- **Filtering Logic**: Implemented via a memoized `filterItem` function in `App.tsx` that performs logical AND across active categories.

### 2.3 Interactive Knowledge Graph
The graph visualizes the "Art Genome"—how movements, artists, and artworks are intertwined.
- **Node Entities**: Movements (🎨), Artists (👨‍🎨), Artworks (🖼️), Locations (📍), Types (🏺), Museums (🏛️).
- **Directional Links**: Edges include labels (e.g., "Created", "Influences") and arrows indicating the flow of influence or location.
- **Recursive Collapsing**:
    - Right-clicking a node allows "Collapsing Connections".
    - **Behavior**: Hides incoming edges to the target node. Upstream nodes that become disconnected from the rest of the visible graph are recursively hidden to reduce clutter.
- **Focus & Highlighting**:
    - Single-click on a node dims the rest of the graph (opacity 15%) and highlights direct neighbors and connecting edges in Coral (#FF4B4B).
- **Adaptive Rendering**: Labels use a `linkCanvasObject` to render text that aligns with edges and adjusts size based on zoom level.

### 2.4 Curator Analytics & Timeline
- **Analytics Visualization**: Utilizes `recharts` to provide responsive, high-performance data visualizations.
    - **Movement Dominance**: A bar chart mapping collection count to art movements.
    - **Medium Composition**: A pie chart visualizing the breadth of artistic mediums (Oil, Sculpture, etc.).
    - **Curatorial Diversity**: Interactive "Diversity Score" cards based on asset type classification.
- **Chronological Timeline**: 
    - **Algorithm**: Extracts years from artwork metadata using a regex-based parser that normalizes BCE and AD dates into a signed integer timeline.
    - **UI**: A motion-enhanced, horizontal-scrollable timeline that allows users to traverse their collection through human history.

### 2.5 User Profiles & Privacy
- **Granular Privacy**: Users can independently toggle public visibility for "Gallery" and "Bucket List" sections via `isGalleryPublic` and `isBucketListPublic` flags in Firestore.
- **Auto-Sync to Public Docs**: Toggling privacy triggers a background process that clones/deletes items between the private user space and the high-performance `public_profiles`, `public_items`, and `public_bucketlist` collections.
- **Deep Linking**: Shared profile links automatically set the app to **View-Only mode**, hiding administrative curator controls and replacing "Add" actions with non-interactive status indicators.

### 2.5 Canonical Entity Normalization
- **Normalization Engine**: All extracted names (Artists, Movements, Museums) are processed through `normalizeName` to ensure consistent casing and spacing.
- **Canonical IDs**: Slugs are generated using `sanitizeId` to provide a stable, unique document ID for each entity across the system.
- **Auto-Syncing**: Every artwork scan triggers a background `syncArtworkEntities` process that:
    - Identifies all referenced entities.
    - Transparently seeds or updates the global metadata collections (e.g., `metadata_artists`).
    - **Overwrite Policy**: Unconditionally overwrites metadata records with the latest AI analysis to ensure the global knowledge base remains fresh and accurate.

---

## 📊 3. Data Models

### 3.1 HistoryItem / HistoryItem
```typescript
interface HistoryItem {
  id: string;
  timestamp: string;
  imageUrl: string;
  details: ArtDetails;
}

interface ArtDetails {
  title: string;
  artist: string;
  year: string;
  movement: string;
  medium: string;
  description: string;
  location: string;
  museum?: string;
  type?: string;
}
```

### 3.2 Firestore Structure
- `/users/{uid}/history/{itemId}`: Primary collection for scans.
- `/users/{uid}/bucketList/{itemId}`: User-marked items for future viewing.
- `/users/{uid}/profile/public`: Metadata for sharing permissions.

---

## 🎨 4. Interaction Principles

1. **Waitless Feeling**: Even during long AI processes, the UI provides constant feedback through transitions and progress bars.
2. **Context-First**: No action is hidden behind deep menus; right-clicks and tooltips provide info-on-demand.
3. **Responsive Density**: On desktop, the graph utilizes full screen-space; on mobile, it optimizes zoom levels and touch targets.

---

## 🔒 5. Security Model

- **Firestore Rules**: Strictly enforced ownership. Users can only write to their own `/users/{uid}` path.
- **Public Read Access**: `sharedProfile` logic bypasses private ownership ONLY if the `isPublic` flag is explicitly true on the target document.
