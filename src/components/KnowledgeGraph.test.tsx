import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KnowledgeGraph } from './KnowledgeGraph';
import { ArtDetails } from '../services/artService';

// Mock the graph library since it's hard to test 2D canvas in JSDOM
vi.mock('react-force-graph-2d', () => ({
  default: vi.fn(() => <div data-testid="force-graph" />)
}));

const mockItems = [
  {
    id: '1',
    image: 'test.jpg',
    details: {
      title: 'Starry Night',
      artist: 'Vincent van Gogh',
      year: '1889',
      movement: 'Post-Impressionism',
      medium: 'Oil on canvas',
      description: 'A masterpiece.',
      historicalContext: 'Context'
    } as ArtDetails,
    timestamp: Date.now()
  }
];

describe('KnowledgeGraph Component', () => {
  it('renders the "No connections" message when items list is empty', () => {
    render(<KnowledgeGraph items={[]} onArtworkClick={vi.fn()} />);
    expect(screen.getByText(/No Neural Connections Detected/i)).toBeInTheDocument();
  });

  it('renders the graph component when items are provided', () => {
    render(<KnowledgeGraph items={mockItems} onArtworkClick={vi.fn()} />);
    expect(screen.getByTestId('force-graph')).toBeInTheDocument();
  });

  it('displays the legend showing graph node types', () => {
    render(<KnowledgeGraph items={mockItems} onArtworkClick={vi.fn()} />);
    expect(screen.getByText(/Styles/i)).toBeInTheDocument();
    expect(screen.getByText(/Artists/i)).toBeInTheDocument();
    expect(screen.getByText(/Museums/i)).toBeInTheDocument();
    expect(screen.getByText(/Types/i)).toBeInTheDocument();
  });
});
