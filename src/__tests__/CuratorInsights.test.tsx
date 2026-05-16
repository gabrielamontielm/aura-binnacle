import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CuratorInsights } from '../components/CuratorInsights';
import { HistoryItem } from '../types';
import React from 'react';

// Mock Recharts to avoid issues in test environment
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
}));

describe('CuratorInsights', () => {
  const mockHistory: HistoryItem[] = [
    {
      id: '1',
      image: 'img1.jpg',
      timestamp: Date.now(),
      details: {
        title: 'Ancient Statue',
        artist: 'Unknown',
        year: '500 BCE',
        movement: 'Ancient Greek',
        medium: 'Marble',
        type: 'Sculpture',
        description: '...',
        historicalContext: '...'
      }
    },
    {
      id: '2',
      image: 'img2.jpg',
      timestamp: Date.now(),
      details: {
        title: 'Modernism',
        artist: 'Modern Artist',
        year: '1920',
        movement: 'Modernism',
        medium: 'Oil on Canvas',
        type: 'Painting',
        description: '...',
        historicalContext: '...'
      }
    }
  ];

  it('renders "no data" state when history is empty', () => {
    render(<CuratorInsights history={[]} />);
    expect(screen.getByText(/Add more art to see curator insights/i)).toBeDefined();
  });

  it('renders analytics charts when history is provided', () => {
    render(<CuratorInsights history={mockHistory} />);
    expect(screen.getByText(/Chronological Journey/i)).toBeDefined();
    expect(screen.getByText(/Movement Dominance/i)).toBeDefined();
    expect(screen.getByText(/Medium Composition/i)).toBeDefined();
  });

  it('displays BCE years correctly in the timeline', () => {
    render(<CuratorInsights history={mockHistory} />);
    expect(screen.getByText('500 BCE')).toBeDefined();
    expect(screen.getByText('1920')).toBeDefined();
  });
});
