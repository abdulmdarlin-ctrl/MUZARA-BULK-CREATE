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
    <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-[#0a0a0a] border-b border-white/10 shrink-0">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Panel toggle — visible only on < lg screens */}
        <button
          onClick={onToggleLeft}
          className="lg:hidden p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          title="Toggle Settings Panel"
        >
          {leftPanelOpen ? <X className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
        </button>

        <Printer className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
        <h1 className="text-base sm:text-xl font-bold tracking-tight">
          <span className="hidden sm:inline">MUZARA DataSystems</span>
          <span className="sm:hidden">MUZARA</span>
        </h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="text-xs sm:text-sm font-medium text-gray-400 uppercase tracking-widest hidden xs:block">
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
