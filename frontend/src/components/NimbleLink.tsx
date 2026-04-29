import React from 'react';
import { nimbleEntityUrl } from '../services/nimbleApi';

interface NimbleLinkProps {
  kind: 'contact' | 'deal';
  id: string | null | undefined;
  className?: string;
  title?: string;
}

const NimbleLink: React.FC<NimbleLinkProps> = ({ kind, id, className, title }) => {
  if (!id) return null;
  return (
    <a
      href={nimbleEntityUrl(kind, id)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center text-gray-400 hover:text-blue-600 ${className || ''}`}
      title={title || 'Open in Nimble'}
      aria-label="Open in Nimble"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
};

export default NimbleLink;
