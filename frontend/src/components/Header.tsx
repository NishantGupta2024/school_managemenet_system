import React from 'react';
import { School, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-brand-600 p-2.5 rounded-xl text-white shadow-sm shadow-brand-500/30">
            <School className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              School Fee Management System
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Multi-Tenant Architecture • Phase 1 Foundation
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Phase 1: Foundation Ready</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-800 block">Greenwood Intl Academy</span>
            <span className="text-[11px] text-slate-500 font-mono">SCH001</span>
          </div>
        </div>
      </div>
    </header>
  );
};
