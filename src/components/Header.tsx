import React from 'react';
import { useStore } from '../store';
import { Printer } from 'lucide-react';

export function Header() {
  const bulkType = useStore((state) => state.bulkType);

  const getTitle = () => {
    switch (bulkType) {
      case 'receipts': return 'Receipt Book Section';
      case 'certificates': return 'Certificate Section';
      case 'idcards': return 'ID Card Section';
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-[#0a0a0a] border-b border-white/10 shrink-0">
      <div className="flex items-center gap-3">
        <Printer className="w-6 h-6 text-blue-400" />
        <h1 className="text-xl font-bold tracking-tight">MUZARA DataSystems</h1>
      </div>
      <div className="text-sm font-medium text-gray-400 uppercase tracking-widest">
        {getTitle()}
      </div>
    </header>
  );
}
