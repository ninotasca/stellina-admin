import React from 'react';

interface Props {
  /** Optional banner above the main content (used by preview mode). */
  banner?: React.ReactNode;
  children: React.ReactNode;
}

const PartnerPortalShell: React.FC<Props> = ({ banner, children }) => (
  <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <img
            src="/brand/stellina-logo-black.png"
            alt="Stellina Connections"
            className="h-20 sm:h-24 w-auto"
          />
          <div className="hidden sm:block border-l border-slate-200 pl-5">
            <div className="text-xs uppercase tracking-[0.22em] text-amber-700/80 font-semibold">
              Partner Portal
            </div>
            <div className="text-sm text-slate-500">RFP response &amp; document drop</div>
          </div>
        </div>
        <div className="text-[11px] text-slate-400 hidden md:block text-right">
          Need help?{' '}
          <a className="text-amber-700 hover:underline" href="mailto:raffy@stellinaconnections.com">
            raffy@stellinaconnections.com
          </a>
        </div>
      </div>
    </header>

    {banner}

    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {children}
    </main>

    <footer className="border-t border-slate-200 mt-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between text-[11px] text-slate-400">
        <span>© Stellina Connections</span>
        <span>Trusted partner for site selection &amp; meeting planning.</span>
      </div>
    </footer>
  </div>
);

export default PartnerPortalShell;
