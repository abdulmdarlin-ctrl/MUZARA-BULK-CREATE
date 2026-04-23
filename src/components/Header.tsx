import { useStore } from '../store';
import { Printer, PanelLeftOpen, PanelRightOpen, X, Undo2, Redo2 } from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'motion/react';

interface HeaderProps {
  onToggleLeft: () => void;
  onToggleRight: () => void;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
}

export function Header({ onToggleLeft, onToggleRight, leftPanelOpen, rightPanelOpen }: HeaderProps) {
  const { bulkType, setBulkType } = useStore();
  const { undo, redo } = useStore.temporal.getState();

  const NAV_ITEMS = [
    { id: 'receipts', label: 'RECEIPT BOOKS' },
    { id: 'certificates', label: 'REPORT CARDS / CERTIFICATES' },
  ];

  return (
    <header className="px-4 py-3 sm:px-8 shrink-0 z-50 relative">
      {/* Premium Glassmorphism Container */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl border-b border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]" />
      
      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 max-w-[1800px] mx-auto">
        <div className="flex items-center gap-3 lg:gap-6">
          {/* Panel toggle — visible only on < lg screens */}
          <button
            onClick={onToggleLeft}
            className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5"
            title="Toggle Settings Panel"
          >
            {leftPanelOpen ? <X className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full group-hover:bg-blue-500/30 transition-all" />
              <Printer className="w-6 h-6 sm:w-7 sm:h-7 text-blue-400 relative drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] transform group-hover:scale-110 transition-transform" />
            </div>
            <h1 className="text-lg sm:text-xl font-black tracking-tighter">
              <span className="bg-gradient-to-r from-white via-white/90 to-blue-400/80 bg-clip-text text-transparent">MUZARA</span>
            </h1>
          </div>
        </div>

        {/* Main Tablet/Desktop Navigation */}
        <nav className="hidden md:flex items-center bg-white/5 border border-white/5 p-1 rounded-2xl">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setBulkType(item.id as any)}
              className={clsx(
                "px-5 py-2 text-[10px] sm:text-[11px] font-bold transition-all relative rounded-xl overflow-hidden group",
                bulkType === item.id 
                  ? "text-blue-400" 
                  : "text-gray-400 hover:text-white"
              )}
            >
              <span className="relative z-10">{item.label}</span>
              {bulkType === item.id && (
                <motion.div 
                  layoutId="nav_active"
                  className="absolute inset-0 bg-blue-500/10 border border-blue-500/20 rounded-xl"
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              {bulkType === item.id && (
                <motion.div 
                  layoutId="nav_glow"
                  className="absolute -bottom-1 left-1/4 right-1/4 h-[1px] bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.8)]"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 lg:gap-5">
          {/* Universal Controls */}
          <div className="hidden lg:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 shadow-inner">
            <button 
              onClick={() => undo()} 
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all active:scale-90"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-3 bg-white/5" />
            <button 
              onClick={() => redo()} 
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all active:scale-90"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Right panel toggle — visible only on < lg screens */}
          <button
            onClick={onToggleRight}
            className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5"
            title="Toggle Output Panel"
          >
            {rightPanelOpen ? <X className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </header>
  );
}
