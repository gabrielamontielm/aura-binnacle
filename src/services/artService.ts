
export interface ArtDetails {
  title: string;
  artist: string;
  year: string;
  movement: string;
  medium: string;
  description: string;
  historicalContext: string;
}

export async function identifyArtwork(base64Image: string, mimeType: string = "image/jpeg"): Promise<ArtDetails> {
  const response = await fetch("/api/identify-artwork", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Image, mimeType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to identify artwork");
  }

  return response.json();
}

export interface EntityDetails {
  name: string;
  type: 'artist' | 'movement';
  yearsOrPeriod: string;
  originOrRegion: string;
  significance: string;
  keyCharacteristics: string[];
  historicalImpact: string;
  curatorialSummary: string;
}

export async function getEntityDetails(name: string, type: 'artist' | 'movement'): Promise<EntityDetails> {
  const response = await fetch("/api/entity-details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, type }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch entity details");
  }

  return response.json();
}
