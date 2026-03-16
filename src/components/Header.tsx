import React from 'react';
import { useStore } from '../store';
import { Printer, PanelLeftOpen, PanelRightOpen, X } from 'lucide-react';

interface HeaderProps {
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
}

export function Header({ onToggleLeft, onToggleRight, leftPanelOpen, rightPanelOpen }: HeaderProps) {
  const bulkType = useStore((state) => state.bulkType);

  const getTitle = () => {
    switch (bulkType) {
      case 'receipts': return 'Receipt Book Section';
      case 'certificates': return 'Certificate Section';
      case 'idcards': return 'ID Card Section';
    }
  };

  return (
    <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-transparent shrink-0">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Panel toggle — visible only on < lg screens */}
        <button
          onClick={onToggleLeft}
          className="lg:hidden p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          title="Toggle Settings Panel"
        >
          {leftPanelOpen ? <X className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
        </button>

        <Printer className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        <h1 className="text-base sm:text-lg font-bold tracking-tight">
          <span className="hidden sm:inline bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">MUZARA DataSystems</span>
          <span className="sm:hidden bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">MUZARA</span>
        </h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="text-[10px] sm:text-xs font-semibold text-blue-400/80 uppercase tracking-widest hidden xs:flex items-center gap-2 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 backdrop-blur-md">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>
          {getTitle()}
        </div>

        {/* Right panel toggle — visible only on < lg screens */}
        <button
          onClick={onToggleRight}
          className="lg:hidden p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          title="Toggle Output Panel"
        >
          {rightPanelOpen ? <X className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}
