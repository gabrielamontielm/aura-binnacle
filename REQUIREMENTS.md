# AURA - Requirements Document

## Overview
AURA is a mobile-first web application designed for art enthusiasts to scan, identify, and organize masterpieces. It leverages AI to provide deep insights into artworks and features a dynamic knowledge graph to visualize connections between artists, movements, museums, and locations.

## Target Audience
- Museum visitors
- Art history students
- Casual art enthusiasts
- Collectors

## Functional Requirements

### 1. Artwork Scanning & Identification
- **Image Upload:** Users can take a photo or upload an image of an artwork.
- **AI Analysis:** The app uses Gemini AI to identify the artwork, artist, year, movement, and medium.
- **Contextual Data:** Provide historical context and descriptive details for identified works.

### 2. Personal Gallery & Bucket List
- **Private Collection:** Users can save identified artworks to their personal gallery.
- **Planning:** A "Bucket List" feature allows users to save artworks they wish to see in person.
- **Organization:** Artworks are stored with full metadata and AI-generated insights.

### 3. Knowledge Graph
- **Relational Visualization:** A 3D/2D force-directed graph showing connections.
- **Entities:**
    - **Movements:** Art styles (e.g., Impressionism).
    - **Artists:** The creators of the works.
    - **Artworks:** The specific masterpieces.
    - **Museums:** Institutions housing the works.
    - **Locations:** Geographic cities/regions of the museums.
- **Hierarchical Mapping:** Locations link to Museums, and Museums link to Artworks.
- **Interactivity:** Clicking a node filters the gallery to show related works.

### 4. Social Sharing
- **Public Profiles:** Users can generate a unique sharing link.
- **Toggle Privacy:** Users can choose to make their Gallery or Bucket List public/private.
- **View-Only Mode:** Visitors using a shared link can browse the collection but cannot modify it.

## Technical Requirements

### Frontend
- **Framework:** React 18+ with Vite.
- **Styling:** Tailwind CSS for a modern, responsive "Artistic" aesthetic.
- **Animations:** Framer Motion for smooth transitions.
- **Graph Engine:** `react-force-graph` for high-performance visualization.

### Backend & Storage
- **Database:** Firebase Firestore for real-time data persistence.
- **Authentication:** Firebase Auth (Google Provider).
- **AI Integration:** Google Gemini API (`@google/genai`) for image recognition and data extraction.

### Deployment
- **Platform:** Cloud Run (via AI Studio Build).
- **Security:** Hardened Firestore Security Rules for data isolation.

## Design Aesthetic
- **Color Palette:** "Artistic Ink" (Deep charcoals, soft sands, and vibrant accents).
- **Typography:** Sophisticated sans-serif with high-contrast display fonts.
- **Layout:** Minimalist, mobile-first, focusing on high-quality art imagery.
