import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';

export function Footer() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-[#0a0a0a] border-t border-white/10 shrink-0 z-10">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Info className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-gray-300">Instructions & Status</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> System Ready
          </div>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      <div className={clsx(
        "overflow-hidden transition-all duration-300 ease-in-out",
        isExpanded ? "max-h-64 border-t border-white/5" : "max-h-0"
      )}>
        <div className="p-6 grid grid-cols-3 gap-8 text-sm">
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-300 uppercase tracking-wider text-xs">Step-by-Step Workflow</h4>
            <ol className="list-decimal list-inside text-gray-400 space-y-1">
              <li>Select bulk type (Receipts, Certificates, ID Cards)</li>
              <li>Upload your base template (PDF/PNG/JPG)</li>
              <li>Add text, number, or photo fields</li>
              <li>Drag fields to position them on the template</li>
              <li>Upload CSV data or configure numbering</li>
              <li>Click Generate Print-Ready PDF</li>
            </ol>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-300 uppercase tracking-wider text-xs">CSV Format Guide</h4>
            <p className="text-gray-400">Ensure your CSV has headers in the first row. Example:</p>
            <div className="bg-black/50 p-3 rounded border border-white/5 font-mono text-xs text-gray-500">
              Name,ID Number,Title<br/>
              John Doe,ID-001,Manager<br/>
              Jane Smith,ID-002,Developer
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-gray-300 uppercase tracking-wider text-xs">Status Logs</h4>
            <div className="bg-black/50 p-3 rounded border border-white/5 h-24 overflow-y-auto font-mono text-xs space-y-1">
              <div className="text-emerald-400">[10:00:00] System initialized successfully.</div>
              <div className="text-blue-400">[10:00:05] Waiting for template upload...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
