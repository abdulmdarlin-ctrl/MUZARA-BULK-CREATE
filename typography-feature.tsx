// Modern Typography Feature Component
import React from 'react';
import { useStore, FieldConfig } from '../store';
import { Type, AlignLeft, AlignCenter, AlignRight, Bold, Plus, Minus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

export function ModernTypography() {
  const { selectedFieldId, fields = [], updateField, removeField, customFonts = [] } = useStore();
  const selectedField = fields.find(f => f.id === selectedFieldId);

  if (!selectedField) {
    return (
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
          <Type className="w-3 h-3 text-blue-400" /> Typography
        </h3>
        <div className="bg-black/30 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-400">Select a field to edit typography</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
          <Type className="w-3 h-3 text-blue-400" /> Typography
        </h3>
        <button
          onClick={() => removeField(selectedField.id)}
          className="p-1.5 bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-lg transition-colors"
          title="Remove Field"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => updateField(selectedField.id, { fontSize: selectedField.fontSize + 1 })}
          className="flex items-center justify-center gap-2 py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-all"
        >
          <Plus className="w-3 h-3" />
          Increase Size
        </button>
        <button
          onClick={() => updateField(selectedField.id, { fontSize: Math.max(1, selectedField.fontSize - 1) })}
          className="flex items-center justify-center gap-2 py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-all"
        >
          <Minus className="w-3 h-3" />
          Decrease Size
        </button>
      </div>

      {/* Font Settings */}
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] text-gray-500 mb-1.5 font-medium">Font Family</label>
          <select 
            value={selectedField.fontFamily} 
            onChange={(e) => updateField(selectedField.id, { fontFamily: e.target.value })}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500/50 transition-colors"
          >
            <option value="CrashNumberingSerif">CrashNumberingSerif</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            {customFonts.map(font => (
              <option key={font.name} value={font.name}>{font.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="block text-[10px] text-gray-500 mb-1.5 font-medium">Size</label>
            <input 
              type="number" 
              value={isNaN(selectedField.fontSize) ? '' : selectedField.fontSize}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || (!isNaN(parseInt(value)) && parseInt(value) >= 0)) {
                  updateField(selectedField.id, { fontSize: value === '' ? 0 : parseInt(value) });
                }
              }}
              onBlur={(e) => {
                const value = parseInt(e.target.value);
                if (isNaN(value) || value < 0) {
                  updateField(selectedField.id, { fontSize: 12 });
                }
              }}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500/50 transition-colors"
              placeholder="12"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1.5 font-medium">Color</label>
            <div className="relative">
              <input 
                type="color" 
                value={selectedField.color} 
                onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                className="w-full h-9 bg-black/50 border border-white/10 rounded-lg cursor-pointer outline-none focus:border-blue-500/50 transition-colors"
              />
              <div 
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{ backgroundColor: selectedField.color, opacity: 0.2 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Text Alignment */}
      <div className="space-y-2">
        <label className="block text-[10px] text-gray-500 mb-1.5 font-medium">Alignment</label>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => updateField(selectedField.id, { align: 'left' })}
            className={clsx(
              "py-2 flex items-center justify-center rounded-lg text-xs font-medium transition-all border",
              selectedField.align === 'left' 
                ? "bg-blue-600 border-blue-500 text-white" 
                : "bg-black/50 border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <AlignLeft className="w-3 h-3" />
          </button>
          <button
            onClick={() => updateField(selectedField.id, { align: 'center' })}
            className={clsx(
              "py-2 flex items-center justify-center rounded-lg text-xs font-medium transition-all border",
              selectedField.align === 'center' 
                ? "bg-blue-600 border-blue-500 text-white" 
                : "bg-black/50 border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <AlignCenter className="w-3 h-3" />
          </button>
          <button
            onClick={() => updateField(selectedField.id, { align: 'right' })}
            className={clsx(
              "py-2 flex items-center justify-center rounded-lg text-xs font-medium transition-all border",
              selectedField.align === 'right' 
                ? "bg-blue-600 border-blue-500 text-white" 
                : "bg-black/50 border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <AlignRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Text Style */}
      <div className="space-y-2">
        <label className="block text-[10px] text-gray-500 mb-1.5 font-medium">Style</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updateField(selectedField.id, { bold: !selectedField.bold })}
            className={clsx(
              "py-2 flex items-center justify-center rounded-lg text-xs font-medium transition-all border",
              selectedField.bold 
                ? "bg-blue-600 border-blue-500 text-white" 
                : "bg-black/50 border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <Bold className="w-3 h-3 inline mr-2" />
            {selectedField.bold ? 'Bold' : 'Regular'}
          </button>
          <button
            onClick={() => updateField(selectedField.id, { 
              fontFamily: 'CrashNumberingSerif',
              fontSize: 16,
              color: '#000000',
              bold: false,
              align: 'left'
            })}
            className="py-2 px-3 bg-gray-600 hover:bg-gray-500 rounded-lg text-xs text-white transition-colors"
          >
            Reset to Default
          </button>
        </div>
      </div>

      {/* Field Info */}
      <div className="bg-black/30 rounded-lg p-3 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Type</span>
          <span className="text-gray-200 capitalize">{selectedField.type}</span>
        </div>
        {selectedField.dataKey && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Data Key</span>
            <span className="text-gray-200">{selectedField.dataKey}</span>
          </div>
        )}
        {selectedField.label && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Label</span>
            <span className="text-gray-200">{selectedField.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
