/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  FileUp, FileText, Download, Printer, Hash, Image as ImageIcon,
  MousePointer2, Upload, Database, Layout, Type, Trash2,
  AlignLeft, AlignCenter, AlignRight, Bold, ArrowLeft, Undo, Redo,
  Receipt, GraduationCap, ChevronRight, CheckCircle2
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { useStore, FieldConfig } from './store';
import { clsx, type ClassValue } from 'clsx';
import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Canvas component for template preview with field placement
function TemplateCanvas({
  templateUrl,
  templateFile,
  fields,
  selectedFieldIds,
  toggleFieldSelection,
  interactionMode,
  onAddField,
  updateField,
  removeField,
  templateBlackAndWhite,
  fromNumber,
  zeroPadding,
  numberingPrefix,
  numberingYear,
  numberingSeparator,
  leafletsPerPage,
  columns,
  rows,
  orientation,
  bindingMargin,
  bulkType,
  snapToGrid,
  gridSize,
  zoomLevel,
  setZoomLevel,
  showGrid,
  isSpacePanning,
}: {
  templateUrl: string | null;
  templateFile: File | null;
  fields: FieldConfig[];
  selectedFieldIds: string[];
  toggleFieldSelection: (id: string, isCtrlKey: boolean) => void;
  interactionMode: 'select' | 'place_point';
  onAddField: (type: 'text' | 'number' | 'image', position?: { x: number; y: number; rx?: number; ry?: number }) => void;
  updateField: (id: string, updates: Partial<FieldConfig>) => void;
  removeField: (id: string) => void;
  templateBlackAndWhite: boolean;
  fromNumber: number;
  zeroPadding: number;
  numberingPrefix: string;
  numberingYear: string;
  numberingSeparator: string;
  leafletsPerPage: number;
  columns: number;
  rows: number;
  orientation: 'portrait' | 'landscape';
  bindingMargin: number;
  bulkType: 'receipts' | 'certificates';
  snapToGrid: boolean;
  gridSize: number;
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  showGrid: boolean;
  isSpacePanning: boolean;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfSize, setPdfSize] = useState<{ width: number; height: number } | null>(null);

  // Modern placement features state
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [smartGuides, setSmartGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [nudgeDirection, setNudgeDirection] = useState<{ x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const { csvData, currentPage } = useStore();


  // Load PDF — render to data URL (used by both single and multi-leaflet views)
  useEffect(() => {
    if (!templateUrl || templateFile?.type !== 'application/pdf') return;
    let cancelled = false;
    setPdfDataUrl(null);
    setPdfSize(null);
    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(templateUrl).promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        // Render at 2× into an offscreen canvas → data URL shared by all cells
        const offscreen = document.createElement('canvas');
        const ctx = offscreen.getContext('2d');
        const vp = page.getViewport({ scale: 2 });
        const vp1 = page.getViewport({ scale: 1 });
        offscreen.width = vp.width;
        offscreen.height = vp.height;
        if (ctx) {
          await (page.render({ canvasContext: ctx, viewport: vp } as any).promise);
          if (!cancelled) {
            setPdfDataUrl(offscreen.toDataURL('image/png'));
            setPdfSize({ width: vp1.width, height: vp1.height });
          }
        }

      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') console.error('PDF load error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [templateUrl, templateFile]);

  // Keyboard nudging with arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedFieldIds.length === 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const step = e.shiftKey ? 10 : 1; // Shift for faster movement
      let updates: Partial<FieldConfig> | null = null;
      
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          updates = { y: -step };
          setNudgeDirection({ x: 0, y: -1 });
          break;
        case 'ArrowDown':
          e.preventDefault();
          updates = { y: step };
          setNudgeDirection({ x: 0, y: 1 });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          updates = { x: -step };
          setNudgeDirection({ x: -1, y: 0 });
          break;
        case 'ArrowRight':
          e.preventDefault();
          updates = { x: step };
          setNudgeDirection({ x: 1, y: 0 });
          break;
        case '+':
        case '=':
          e.preventDefault();
          setZoomLevel(Math.min(3, zoomLevel + 0.1));
          return;
        case '-':
        case '_':
          e.preventDefault();
          setZoomLevel(Math.max(0.5, zoomLevel - 0.1));
          return;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoomLevel(1);
            return;
          }
          break;
      }
      
      if (updates) {
        // Update all selected fields
        selectedFieldIds.forEach(id => {
          const field = fields.find(f => f.id === id);
          if (field) {
            let newX = field.x + (updates?.x || 0);
            let newY = field.y + (updates?.y || 0);
            
            // Apply grid snapping if enabled
            if (snapToGrid) {
              newX = Math.round(newX / gridSize) * gridSize;
              newY = Math.round(newY / gridSize) * gridSize;
            }
            
            updateField(id, { x: newX, y: newY });
          }
        });
        
        // Clear nudge direction after animation
        setTimeout(() => setNudgeDirection(null), 150);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFieldIds, fields, snapToGrid, gridSize, zoomLevel, updateField, setZoomLevel]);


  // Helper to snap coordinates to grid
  const snapToGridCoord = (value: number) => {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  };

  // Calculate smart alignment guides
  const calculateSmartGuides = (x: number, y: number, excludeId?: string) => {
    const tolerance = 5; // pixels
    let guideX: number | null = null;
    let guideY: number | null = null;
    
    for (const field of fields) {
      if (field.id === excludeId) continue;
      
      if (Math.abs(field.x - x) < tolerance) {
        guideX = field.x;
      }
      if (Math.abs(field.y - y) < tolerance) {
        guideY = field.y;
      }
    }
    
    return { x: guideX, y: guideY };
  };

  // Get the template image/canvas element for the leaflet cell under the mouse event
  const getRefElement = (e: React.MouseEvent | MouseEvent): HTMLElement | null => {
    // In multi-leaflet mode, find the specific cell being clicked
    const cell = (e.target as HTMLElement).closest('[data-leaflet-cell]') as HTMLElement | null;
    if (cell) {
      return cell.querySelector('img, canvas') as HTMLElement | null;
    }
    return canvasRef.current?.querySelector('img, canvas') as HTMLElement | null;
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (interactionMode !== 'place_point' || isSelecting) return;
    e.stopPropagation();

    const imgElement = getRefElement(e);
    const rect = imgElement?.getBoundingClientRect();
    if (!rect) return;
    
    // Compute rx/ry as pure fractions (0–1) of the cell the user clicked in.
    // rect is the bounding box of the cell's img — its size is CELL_W*zoom × CELL_H*zoom.
    let rx = (e.clientX - rect.left) / rect.width;
    let ry = (e.clientY - rect.top)  / rect.height;
    rx = Math.max(0, Math.min(1, rx));
    ry = Math.max(0, Math.min(1, ry));

    // Absolute coords in canonical 595×842 space (used by single-view canvas & backward compat)
    const x = snapToGridCoord(rx * 595);
    const y = snapToGridCoord(ry * 842);
    rx = x / 595;
    ry = y / 842;

    onAddField('number', { x, y, rx, ry });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (interactionMode !== 'select') return;
    if (e.button !== 0) return; // Only left click
    
    // Start selection box if clicking on empty canvas area
    const target = e.target as HTMLElement;
    if (target.closest('[data-field]')) return; // Don't start if clicking on a field
    
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionBox({ start: { x, y }, end: { x, y } });
    setIsSelecting(true);
  };

  const handleFieldMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    if (interactionMode !== 'select') return;
    
    const isCtrlKey = e.ctrlKey || e.metaKey;
    toggleFieldSelection(fieldId, isCtrlKey);
    
    if (!isCtrlKey) {
      setIsDragging(fieldId);
    }
    
    const imgElement = getRefElement(e);
    const rect = imgElement?.getBoundingClientRect();
    const field = fields.find(f => f.id === fieldId);
    if (rect && field && !isCtrlKey) {
      // Convert mouse position to 595×842 canonical space, then subtract field position
      setDragOffset({
        x: ((e.clientX - rect.left) / rect.width) * 595 - field.x,
        y: ((e.clientY - rect.top)  / rect.height) * 842 - field.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Track mouse position for placement reticle - use same calculation as placement
    if (interactionMode === 'place_point' && canvasRef.current) {
      const imgElement = getRefElement(e);
      const rect = imgElement?.getBoundingClientRect() || canvasRef.current.getBoundingClientRect();
      // Reticle position in screen-px relative to the canvasRef container
      const containerRect = canvasRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top,
      });
    }
    
    // Handle selection box
    if (isSelecting && selectionBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setSelectionBox({ ...selectionBox, end: { x, y } });
      }
      return;
    }
    
    // Handle field dragging
    if (!isDragging || !canvasRef.current) return;

    const imgElement = getRefElement(e);
    const rect = imgElement?.getBoundingClientRect();
    if (!rect) return;

    // Map mouse to canonical 595×842 space, subtract stored drag offset
    let x = ((e.clientX - rect.left) / rect.width) * 595 - dragOffset.x;
    let y = ((e.clientY - rect.top)  / rect.height) * 842 - dragOffset.y;

    // Smart guides + snapping
    const guides = calculateSmartGuides(x, y, isDragging);
    setSmartGuides(guides);
    if (guides.x !== null && Math.abs(x - guides.x) < 5) x = guides.x;
    if (guides.y !== null && Math.abs(y - guides.y) < 5) y = guides.y;
    x = snapToGridCoord(x);
    y = snapToGridCoord(y);

    updateField(isDragging, { x, y, rx: x / 595, ry: y / 842 });
  };

  const handleMouseUp = () => {
    // Complete selection box
    if (isSelecting && selectionBox) {
      // For selection box, use first cell's image as reference
      const firstCell = canvasRef.current?.querySelector('[data-leaflet-cell]') as HTMLElement | null;
      const imgElement = (firstCell ?? canvasRef.current)?.querySelector('img, canvas') as HTMLElement | null;
      const rect = imgElement?.getBoundingClientRect();
      if (rect) {
        // Use A4 dimensions for selection
        const A4_WIDTH = 595;
        const A4_HEIGHT = 842;
        const scaleX = A4_WIDTH / rect.width;
        const scaleY = A4_HEIGHT / rect.height;
        
        // Calculate selection box in template coordinates
        const left = Math.min(selectionBox.start.x, selectionBox.end.x) * scaleX;
        const right = Math.max(selectionBox.start.x, selectionBox.end.x) * scaleX;
        const top = Math.min(selectionBox.start.y, selectionBox.end.y) * scaleY;
        const bottom = Math.max(selectionBox.start.y, selectionBox.end.y) * scaleY;
        
        // Select fields within the box
        const selectedIds = fields
          .filter(f => f.x >= left && f.x <= right && f.y >= top && f.y <= bottom)
          .map(f => f.id);
        
        if (selectedIds.length > 0) {
          selectedIds.forEach(id => toggleFieldSelection(id, true));
        }
      }
      
      setIsSelecting(false);
      setSelectionBox(null);
    }
    
    setIsDragging(null);
    setSmartGuides({ x: null, y: null });
  };

  useEffect(() => {
    const loadFont = async () => {
      try {
        const fontFace = new FontFace('CrashNumberingSerif', 'url(/CrashNumberingSerif.otf)');
        await fontFace.load();
        document.fonts.add(fontFace);
      } catch (e) {
        console.error('Failed to load CrashNumberingSerif font for canvas:', e);
      }
    };
    loadFont();
  }, []);


  if (!templateUrl) return null;

  const isMultiLeaflet = bulkType === 'receipts' && leafletsPerPage > 1;
  const leafletCols = columns || 2;
  const leafletRows = rows || 3;
  // Base page dimensions stay fixed; binding margin is carved out, shrinking each cell equally
  const BASE_W = orientation === 'landscape' ? 842 : 595;
  const CELL_H = orientation === 'landscape' ? 595 : 842;
  const CELL_W = Math.floor((BASE_W * leafletCols - bindingMargin) / leafletCols);
  const TOTAL_W = CELL_W * leafletCols + bindingMargin;

  // Render grid overlay
  const renderGrid = () => {
    if (!showGrid) return null;
    const lines = [];
    const scaledGridSize = gridSize;
    const A4_WIDTH = 595;
    const A4_HEIGHT = 842;
    
    for (let x = 0; x <= A4_WIDTH; x += scaledGridSize) {
      lines.push(
        <div key={`v-${x}`} className="absolute bg-blue-400/20" style={{ left: x * zoomLevel, top: 0, width: 1, height: A4_HEIGHT * zoomLevel }} />
      );
    }
    for (let y = 0; y <= A4_HEIGHT; y += scaledGridSize) {
      lines.push(
        <div key={`h-${y}`} className="absolute bg-blue-400/20" style={{ left: 0, top: y * zoomLevel, width: A4_WIDTH * zoomLevel, height: 1 }} />
      );
    }
    return lines;
  };

  // Render smart guides
  const renderSmartGuides = () => {
    if (!smartGuides.x && !smartGuides.y) return null;
    const A4_WIDTH = 595;
    const A4_HEIGHT = 842;
    return (
      <>
        {smartGuides.x !== null && (
          <div className="absolute bg-blue-500/50 z-10 pointer-events-none" style={{ left: smartGuides.x * zoomLevel, top: 0, width: 1, height: A4_HEIGHT * zoomLevel }} />
        )}
        {smartGuides.y !== null && (
          <div className="absolute bg-blue-500/50 z-10 pointer-events-none" style={{ left: 0, top: smartGuides.y * zoomLevel, width: A4_WIDTH * zoomLevel, height: 1 }} />
        )}
      </>
    );
  };

  // Render placement reticle for precise targeting
  const renderPlacementReticle = () => {
    if (interactionMode !== 'place_point' || !mousePos) return null;
    
    const size = 30;
    const centerX = mousePos.x;
    const centerY = mousePos.y;
    const templateX = Math.round(mousePos.x / zoomLevel);
    const templateY = Math.round(mousePos.y / zoomLevel);
    
    // Calculate snap indicators
    const snapThreshold = 3;
    const isSnappedX = snapToGrid && Math.abs(templateX % gridSize) < snapThreshold;
    const isSnappedY = snapToGrid && Math.abs(templateY % gridSize) < snapThreshold;
    
    // Find nearest field for distance measurement
    let nearestField: FieldConfig | null = null;
    let minDistance = Infinity;
    let nearestX = 0;
    let nearestY = 0;
    
    fields.forEach(f => {
      const dx = f.x - templateX;
      const dy = f.y - templateY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance && dist > 0) {
        minDistance = dist;
        nearestField = f;
        nearestX = f.x * zoomLevel;
        nearestY = f.y * zoomLevel;
      }
    });
    
    const nearFieldX = fields.some(f => Math.abs(f.x - templateX) < 5);
    const nearFieldY = fields.some(f => Math.abs(f.y - templateY) < 5);
    
    const snapColor = (isSnappedX || isSnappedY) ? '#10b981' : '#3b82f6';
    const isFullySnapped = isSnappedX && isSnappedY;
    
    // Generate preview text
    const nextNumber = fromNumber + fields.filter(f => f.type === 'number').length;
    const previewText = `${numberingPrefix}${numberingSeparator}${numberingYear}${numberingSeparator}${String(nextNumber).padStart(zeroPadding, '0')}`;
    
    return (
      <div className="absolute inset-0 pointer-events-none z-50 overflow-visible">
        {/* Background dim for better visibility */}
        <div 
          className="absolute rounded-full"
          style={{ 
            left: centerX - 40, 
            top: centerY - 40,
            width: 80,
            height: 80,
            background: 'radial-gradient(circle, rgba(0,0,0,0.1) 0%, transparent 70%)'
          }} 
        />
        
        {/* Rotating outer ring */}
        <div 
          className="absolute rounded-full border-2 border-dashed"
          style={{ 
            left: centerX - 24, 
            top: centerY - 24,
            width: 48,
            height: 48,
            borderColor: isFullySnapped ? '#10b981' : '#3b82f6',
            animation: 'spin 4s linear infinite',
            opacity: 0.6
          }} 
        />
        
        {/* Pulsing inner ring */}
        <div 
          className="absolute rounded-full border-2 animate-ping"
          style={{ 
            left: centerX - 16, 
            top: centerY - 16,
            width: 32,
            height: 32,
            borderColor: snapColor,
            opacity: 0.4
          }} 
        />
        
        {/* Solid outer ring */}
        <div 
          className="absolute rounded-full border-2"
          style={{ 
            left: centerX - 16, 
            top: centerY - 16,
            width: 32,
            height: 32,
            borderColor: snapColor,
            boxShadow: `0 0 0 1px white, 0 0 25px ${snapColor}60, inset 0 0 10px ${snapColor}20`
          }} 
        />
        
        {/* Center crosshair dot */}
        <div 
          className="absolute w-3 h-3 rounded-full"
          style={{ 
            left: centerX - 6, 
            top: centerY - 6,
            backgroundColor: snapColor,
            boxShadow: '0 0 0 2px white, 0 0 0 5px ' + snapColor + '60, 0 0 15px ' + snapColor
          }} 
        />
        
        {/* Crosshair with ruler marks */}
        <svg 
          className="absolute inset-0 w-full h-full"
          style={{ overflow: 'visible' }}
        >
          {/* Horizontal ruler line */}
          <line 
            x1={centerX - size} 
            y1={centerY} 
            x2={centerX + size} 
            y2={centerY}
            stroke={snapColor}
            strokeWidth={isSnappedY ? 3 : 2}
          />
          {/* Vertical ruler line */}
          <line 
            x1={centerX} 
            y1={centerY - size} 
            x2={centerX} 
            y2={centerY + size}
            stroke={snapColor}
            strokeWidth={isSnappedX ? 3 : 2}
          />
          
          {/* Ruler tick marks - horizontal */}
          {[-20, -10, 10, 20].map((offset, i) => (
            <line 
              key={`h-${i}`}
              x1={centerX + offset} 
              y1={centerY - 4} 
              x2={centerX + offset} 
              y2={centerY + 4}
              stroke={snapColor}
              strokeWidth={1}
              opacity={0.7}
            />
          ))}
          
          {/* Ruler tick marks - vertical */}
          {[-20, -10, 10, 20].map((offset, i) => (
            <line 
              key={`v-${i}`}
              x1={centerX - 4} 
              y1={centerY + offset} 
              x2={centerX + 4} 
              y2={centerY + offset}
              stroke={snapColor}
              strokeWidth={1}
              opacity={0.7}
            />
          ))}
          
          {/* Extended alignment guides to nearest field */}
          {nearestField && minDistance < 100 && (
            <>
              <line 
                x1={centerX} 
                y1={centerY} 
                x2={nearestX} 
                y2={nearestY}
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="5 3"
                opacity={0.6}
              />
              <circle 
                cx={nearestX}
                cy={nearestY}
                r={4}
                fill="#f59e0b"
                opacity={0.8}
              />
            </>
          )}
        </svg>
        
        {/* Distance measurement to nearest field */}
        {nearestField && minDistance < 100 && (
          <div 
            className="absolute text-[9px] font-mono bg-amber-500/80 text-white px-1.5 py-0.5 rounded"
            style={{ 
              left: (centerX + nearestX) / 2 + 10, 
              top: (centerY + nearestY) / 2 - 10
            }} 
          >
            {Math.round(minDistance)}px
          </div>
        )}
        
        {/* Ghost preview - centered on crosshair */}
        <div 
          className="absolute pointer-events-none"
          style={{ 
            left: centerX, 
            top: centerY,
            transform: 'translate(-50%, -50%)',
            fontFamily: 'CrashNumberingSerif',
            fontWeight: 'bold',
            color: '#FF0000',
            fontSize: 20,
            opacity: 0.35,
            textShadow: '0 0 6px white, 0 0 12px white'
          }} 
        >
          {previewText}
        </div>
        
        {/* Enhanced coordinate tooltip */}
        <div 
          className="absolute flex flex-col gap-0.5"
          style={{ 
            left: centerX + 25, 
            top: centerY - 35
          }} 
        >
          <div 
            className="text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap font-mono font-bold"
            style={{ 
              backgroundColor: isFullySnapped ? '#10b981' : snapColor, 
              color: 'white',
              boxShadow: `0 0 10px ${isFullySnapped ? '#10b981' : snapColor}60`
            }}
          >
            X:{templateX} Y:{templateY}
          </div>
          
          {/* Status indicators */}
          <div className="flex flex-col gap-0.5">
            {isFullySnapped && (
              <div className="text-[9px] text-emerald-400 font-semibold bg-black/50 px-1.5 rounded">
                ✓ Grid locked
              </div>
            )}
            {nearFieldX && (
              <div className="text-[9px] text-blue-400 font-semibold bg-black/50 px-1.5 rounded">
                ↔ Align X
              </div>
            )}
            {nearFieldY && (
              <div className="text-[9px] text-blue-400 font-semibold bg-black/50 px-1.5 rounded">
                ↕ Align Y
              </div>
            )}
            {nearestField && minDistance < 50 && (
              <div className="text-[9px] text-amber-400 font-semibold bg-black/50 px-1.5 rounded">
                {Math.round(minDistance)}px from {(nearestField as FieldConfig).label}
              </div>
            )}
          </div>
        </div>
        
        {/* Corner bracket marks for precision */}
        <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
          {/* Top left bracket */}
          <path 
            d={`M ${centerX - size - 2} ${centerY - size + 8} L ${centerX - size - 2} ${centerY - size - 2} L ${centerX - size + 8} ${centerY - size - 2}`}
            stroke={snapColor}
            strokeWidth={2}
            fill="none"
          />
          {/* Top right bracket */}
          <path 
            d={`M ${centerX + size + 2} ${centerY - size + 8} L ${centerX + size + 2} ${centerY - size - 2} L ${centerX + size - 8} ${centerY - size - 2}`}
            stroke={snapColor}
            strokeWidth={2}
            fill="none"
          />
          {/* Bottom left bracket */}
          <path 
            d={`M ${centerX - size - 2} ${centerY + size - 8} L ${centerX - size - 2} ${centerY + size + 2} L ${centerX - size + 8} ${centerY + size + 2}`}
            stroke={snapColor}
            strokeWidth={2}
            fill="none"
          />
          {/* Bottom right bracket */}
          <path 
            d={`M ${centerX + size + 2} ${centerY + size - 8} L ${centerX + size + 2} ${centerY + size + 2} L ${centerX + size - 8} ${centerY + size + 2}`}
            stroke={snapColor}
            strokeWidth={2}
            fill="none"
          />
        </svg>
        
        {/* Add keyframe animation for rotation */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  };

  if (isMultiLeaflet) {
    return (
      <div ref={containerRef} className="relative inline-block">
        <div 
          ref={canvasRef}
          className={cn("inline-block", !isSpacePanning && interactionMode === 'place_point' && !isSelecting && "cursor-crosshair")}
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="bg-white flex" style={{ width: TOTAL_W, height: CELL_H * leafletRows }}>
            {/* Binding margin strip */}
            {bindingMargin > 0 && <div style={{ width: bindingMargin, height: CELL_H * leafletRows, flexShrink: 0, background: '#e5e7eb', borderRight: '1px solid #d1d5db' }} />}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${leafletCols}, ${CELL_W}px)`, gridTemplateRows: `repeat(${leafletRows}, ${CELL_H}px)`, width: CELL_W * leafletCols, height: CELL_H * leafletRows }}>
            {Array.from({ length: leafletsPerPage }, (_, leafletIndex) => (
              <div key={leafletIndex} className="relative" style={{ width: CELL_W, height: CELL_H }} data-leaflet-cell>
                {templateFile?.type.startsWith('image/') ? (
                  <img src={templateUrl!} alt={`Template ${leafletIndex + 1}`} className={cn("absolute inset-0 w-full h-full object-fill", templateBlackAndWhite && "grayscale")} style={{ filter: templateBlackAndWhite ? 'grayscale(100%)' : undefined }} draggable={false} />
                ) : templateFile?.type === 'application/pdf' && pdfDataUrl ? (
                  <img src={pdfDataUrl} alt={`Template ${leafletIndex + 1}`} className={cn("absolute inset-0 w-full h-full object-fill", templateBlackAndWhite && "grayscale")} style={{ filter: templateBlackAndWhite ? 'grayscale(100%)' : undefined }} draggable={false} />
                ) : templateFile?.type === 'application/pdf' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400 text-xs">Loading PDF…</div>
                ) : null}
                
                {fields.map((field) => {
                  // Calculate position from relative coordinates, scaled to cell dimensions
                  const fieldX = (field.rx ?? field.x / 595) * CELL_W;
                  const fieldY = (field.ry ?? field.y / 842) * CELL_H;

                  // Number right-to-left within each row
                  const col = leafletIndex % leafletCols;
                  const row = Math.floor(leafletIndex / leafletCols);
                  const rtlIndex = row * leafletCols + (leafletCols - 1 - col);
                  const leafletNumber = fromNumber + rtlIndex;
                  const isNumberField = field.type === 'number';
                  let displayText = '';
                  if (isNumberField) {
                    const baseNumber = String(leafletNumber).padStart(zeroPadding, '0');
                    displayText = `${numberingPrefix}${numberingSeparator}${numberingYear}${numberingSeparator}${baseNumber}`;
                  } else {
                    displayText = field.value || field.label;
                  }
                  const isSelected = selectedFieldIds.includes(field.id);
                  
                  return (
                    <div
                      key={`${field.id}-${leafletIndex}`}
                      data-field
                      className={cn("absolute select-none transition-shadow", isSelected && "z-20", interactionMode === 'place_point' && "pointer-events-none")}
                      style={{ left: fieldX, top: fieldY, transform: 'translate(-50%, -50%)' }}
                      onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                      onMouseEnter={() => setHoveredField(field.id)}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      {field.type === 'number' && (
                        <div className="text-sm font-bold whitespace-nowrap" style={{ fontFamily: field.fontFamily || 'CrashNumberingSerif', fontWeight: field.bold ? 'bold' : 'normal', color: field.color || '#FF0000', fontSize: field.fontSize }}>
                          {displayText}
                        </div>
                      )}
                      {field.type === 'text' && (
                        <div className="text-xs whitespace-nowrap" style={{ color: field.color, fontSize: field.fontSize, fontFamily: field.fontFamily || 'CrashNumberingSerif', fontWeight: field.bold ? 'bold' : 'normal' }}>
                          {displayText}
                        </div>
                      )}
                      {field.type === 'image' && (
                        <div className="w-16 h-16 rounded-lg bg-gray-700 border-2 border-dashed border-blue-400 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-blue-400" />
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Crosshair for placement mode */}
                {renderPlacementReticle()}
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>
    );
  }

  // Single template view
  return (
    <div ref={containerRef} className="relative inline-block">
      <div
        ref={canvasRef}
        className={cn("relative inline-block", !isSpacePanning && interactionMode === 'place_point' && !isSelecting && "cursor-crosshair", !isSpacePanning && isSelecting && "cursor-crosshair")}
        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
        onClick={handleCanvasClick}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {templateFile?.type.startsWith('image/') ? (
          <img src={templateUrl} alt="Template" className={cn("block", templateBlackAndWhite && "grayscale")} style={{ width: 595, height: 842, objectFit: 'fill', filter: templateBlackAndWhite ? 'grayscale(100%)' : undefined }} draggable={false} />
        ) : templateFile?.type === 'application/pdf' ? (
          pdfDataUrl
            ? <img src={pdfDataUrl} alt="Template" className={cn("block", templateBlackAndWhite && "grayscale")} style={{ width: pdfSize?.width ?? 595, height: pdfSize?.height ?? 842, display: 'block', filter: templateBlackAndWhite ? 'grayscale(100%)' : undefined }} draggable={false} />
            : <div className="w-[595px] h-[842px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Loading PDF…</div>
        ) : (
          <div className="w-[595px] h-[842px] bg-gray-800 flex items-center justify-center"><p className="text-gray-500">Template Preview</p></div>
        )}
        
        {/* Grid overlay */}
        {showGrid && renderGrid()}
        
        {/* Smart guides */}
        {renderSmartGuides()}
        
        {fields.map((field) => {
          // Calculate position from relative coordinates
          const A4_WIDTH = 595;
          const A4_HEIGHT = 842;
          const fieldX = (field.rx ?? field.x / A4_WIDTH) * A4_WIDTH;
          const fieldY = (field.ry ?? field.y / A4_HEIGHT) * A4_HEIGHT;
          
          const isSelected = selectedFieldIds.includes(field.id);
          const isBeingNudged = isSelected && nudgeDirection;
          
          return (
            <div
              key={field.id}
              data-field
              className={cn(
                "absolute select-none",
                isSelected && "z-20",
                isDragging === field.id && "z-30",
                interactionMode === 'place_point' && "pointer-events-none"
              )}
              style={{ 
                left: fieldX, 
                top: fieldY,
                transform: isBeingNudged 
                  ? `translate(-50%, -50%) translate(${nudgeDirection.x * 2}px, ${nudgeDirection.y * 2}px)` 
                  : 'translate(-50%, -50%)',
                transition: isBeingNudged ? 'transform 0.1s ease-out' : undefined
              }}
              onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
              onMouseEnter={() => setHoveredField(field.id)}
              onMouseLeave={() => setHoveredField(null)}
            >
              {/* Minimal modern selection controls - handles fit to content */}
              {isSelected && (
                <>
                  {/* Selection border touching content */}
                  <div className="absolute inset-0 border border-blue-400/60 rounded-sm pointer-events-none" />
                  
                  {/* Corner handles - touching the number content */}
                  <div className="absolute top-0 left-0 w-2 h-2 bg-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-nw-resize hover:scale-150 transition-transform" />
                  <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full translate-x-1/2 -translate-y-1/2 cursor-ne-resize hover:scale-150 transition-transform" />
                  <div className="absolute bottom-0 left-0 w-2 h-2 bg-blue-500 rounded-full -translate-x-1/2 translate-y-1/2 cursor-sw-resize hover:scale-150 transition-transform" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 rounded-full translate-x-1/2 translate-y-1/2 cursor-se-resize hover:scale-150 transition-transform" />
                  
                  {/* Delete button - close to content */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                    className="absolute -top-3 -right-3 w-4 h-4 bg-red-500/90 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm z-50 transition-all hover:scale-110"
                    title="Delete"
                  >
                    ×
                  </button>
                </>
              )}
              
              <div className={cn("relative cursor-move inline-block", isSelected && "ring-1 ring-blue-400/30 rounded")}>
                {field.type === 'image' ? (
                  <div className="w-16 h-16 rounded-lg bg-gray-700 border-2 border-dashed border-blue-400 flex items-center justify-center shadow-lg">
                    <ImageIcon className="w-6 h-6 text-blue-400" />
                  </div>
                ) : (() => {
                  // Certificates: show CSV value for the current preview row
                  // Receipts: show auto-number
                  let displayText = '';
                  const mode = bulkType as string;
                  if (mode === 'certificates') {
                    const previewRow = csvData[currentPage - 1] ?? {};
                    displayText = field.dataKey
                      ? String(previewRow[field.dataKey] ?? '')
                      : `[${field.label}]`;
                  } else {
                    // receipts mode — keep existing number display
                    const numberFields = fields.filter(f => f.type === 'number');
                    const fieldIndex = numberFields.findIndex(f => f.id === field.id);
                    const actualNumber = fromNumber + fieldIndex;
                    const baseNumber = String(actualNumber).padStart(zeroPadding, '0');
                    displayText = `${numberingPrefix}${numberingSeparator}${numberingYear}${numberingSeparator}${baseNumber}`;
                  }
                  const isCert = mode === 'certificates';
                  return (
                    <div
                      className={cn("px-2 py-0.5 whitespace-nowrap", isCert ? "rounded" : "font-bold")}
                      style={{
                        fontFamily: field.fontFamily || (isCert ? 'Times New Roman' : 'CrashNumberingSerif'),
                        fontWeight: field.bold ? 'bold' : 'normal',
                        color: field.color || (isCert ? '#000000' : '#FF0000'),
                        fontSize: field.fontSize,
                        background: isCert ? 'rgba(139,92,246,0.15)' : undefined,
                        outline: isCert ? '1px dashed rgba(139,92,246,0.5)' : undefined,
                      }}
                    >
                      {displayText || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>{field.label}</span>}
                    </div>
                  );
                })()}
              </div>
              
              {/* Coordinate tooltip */}
              {(isSelected || hoveredField === field.id) && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none z-50">
                  {Math.round(field.x)}, {Math.round(field.y)}
                </div>
              )}
            </div>
          );
        })}
        
        {/* Selection box */}
        {selectionBox && (
          <div
            className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-40"
            style={{
              left: Math.min(selectionBox.start.x, selectionBox.end.x),
              top: Math.min(selectionBox.start.y, selectionBox.end.y),
              width: Math.abs(selectionBox.end.x - selectionBox.start.x),
              height: Math.abs(selectionBox.end.y - selectionBox.start.y),
            }}
          />
        )}
        
        {/* Placement reticle */}
        {renderPlacementReticle()}
      </div>
    </div>
  );
}

// Helper function to convert image to high-quality grayscale
function convertToGrayscale(imageBytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([imageBytes.buffer as ArrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 3× upscale so the embedded PNG has enough pixels for crisp print output
      const scale = 3;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        // BT.709 luminance — perceptually accurate grayscale
        const gray = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }

      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) { reject(new Error('toBlob failed')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all",
        active ? "text-white bg-gradient-to-b from-white/10 to-white/5 border-t border-x border-white/20" : "text-gray-400 hover:text-white hover:bg-white/5 border-t border-x border-transparent"
      )}
    >
      {active && <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-purple-500/10 rounded-t-lg" />}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

export default function App() {
  const store = useStore();
  const {
    templateUrl, templateFile, setTemplate,
    generatedPdfUrl, setGeneratedPdfUrl,
    fields, addField, removeField, updateField, selectedFieldId, setSelectedFieldId,
    selectedFieldIds, toggleFieldSelection, clearFieldSelection, updateMultipleFields, selectAllNumberFields,
    bulkType, csvData, csvHeaders, setCsvData, extractedImages, setExtractedImages,
    fromNumber, toNumber, zeroPadding, numberingPrefix, numberingYear, numberingSeparator,
    setNumbering, setCustomNumbering,
    leafletsPerPage, columns, rows, orientation, setLayout, bindingMargin, setBindingMargin,
    templateBlackAndWhite, setTemplateBlackAndWhite,
    pagesToGenerate, setPagesToGenerate,
    customFonts,
    pointCounter, setPointCounter,
    interactionMode, setInteractionMode,
    snapToGrid, setSnapToGrid, gridSize, setGridSize,
    zoomLevel, setZoomLevel, showCoordinates, setShowCoordinates,
    showGrid, setShowGrid,
    canvasDimensions
  } = store;

  const { undo, redo } = useStore.temporal.getState();

  const [view, setView] = useState<'landing' | 'studio'>('landing');
  const [activeTab, setActiveTab] = useState<'data' | 'typography' | 'layout'>('data');
  const [isGenerating, setIsGenerating] = useState(false);

  // Canvas scroll container ref for pan + wheel zoom
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const canvasPanStart = useRef<{ mx: number; my: number; sl: number; st: number } | null>(null);
  const zoomRef = useRef(zoomLevel);
  zoomRef.current = zoomLevel;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); setSpaceDown(true); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { setSpaceDown(false); setIsSpacePanning(false); canvasPanStart.current = null; }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  // Auto-fit zoom whenever layout or view changes, then re-center
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el || view !== 'studio') return;
    const isMulti = leafletsPerPage > 1;
    const cellW = orientation === 'landscape' ? 842 : 595;
    const cellH = orientation === 'landscape' ? 595 : 842;
    const leafletCols_ = isMulti ? (columns || 2) : 1;
    const shrunkCellW = isMulti ? Math.floor((cellW * leafletCols_ - bindingMargin) / leafletCols_) : cellW;
    const totalW = shrunkCellW * leafletCols_ + (isMulti ? bindingMargin : 0);
    const totalH = cellH * (isMulti ? (rows || 3) : 1);
    const padding = 80;
    const fitZoom = Math.min(
      (el.clientWidth - padding) / totalW,
      (el.clientHeight - padding) / totalH,
      1 // never zoom in beyond 100%
    );
    setZoomLevel(Math.max(0.1, fitZoom));
  }, [view, leafletsPerPage, columns, rows, orientation]);

  // Center the canvas in the scroll viewport whenever zoom changes
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el || view !== 'studio') return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop  = (el.scrollHeight - el.clientHeight) / 2;
  }, [view, zoomLevel]);

  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoomLevel(Math.min(3, Math.max(0.5, zoomLevel + delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomLevel]);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const selectedField = fields.find(f => f.id === selectedFieldId);
  const selectedFields = fields.filter(f => selectedFieldIds.includes(f.id));
  const hasMultipleSelection = selectedFieldIds.length > 1;
  const firstSelectedField = selectedFields[0];

  useEffect(() => {
    if (generatedPdfUrl) {
      const loadPdf = async () => {
        try {
          const loadingTask = pdfjsLib.getDocument(generatedPdfUrl);
          const pdf = await loadingTask.promise;
          setPdfDocument(pdf);
          setNumPages(pdf.numPages);
        } catch (err) {
          console.error("Error loading PDF:", err);
        }
      };
      loadPdf();
    }
  }, [generatedPdfUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const onDropForMode = useCallback((mode: 'receipts' | 'certificates', acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      if (templateUrl) URL.revokeObjectURL(templateUrl);
      const file = acceptedFiles[0];
      const url = URL.createObjectURL(file);
      store.setBulkType(mode);
      setTemplate(file, url);
      setView('studio');
    }
  }, [setTemplate, templateUrl, store]);

  const { getRootProps: getReceiptRootProps, getInputProps: getReceiptInputProps, isDragActive: isReceiptDragActive } = useDropzone({
    onDrop: (files) => onDropForMode('receipts', files),
    accept: { 'image/*': ['.png', '.jpg', '.jpeg'], 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
    onDragEnter: () => {}, onDragOver: () => {}, onDragLeave: () => {},
  });

  const { getRootProps: getCertRootProps, getInputProps: getCertInputProps, isDragActive: isCertDragActive } = useDropzone({
    onDrop: (files) => onDropForMode('certificates', files),
    accept: { 'image/*': ['.png', '.jpg', '.jpeg'], 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
    onDragEnter: () => {}, onDragOver: () => {}, onDragLeave: () => {},
  });

  const handleDataUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file);
        const images: Record<string, ArrayBuffer> = {};
        let csvContent: string | null = null;
        for (const [path, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue;
          if (path.endsWith('.csv') && !csvContent) csvContent = await zipEntry.async('text');
          if (/\.(jpg|jpeg|png|gif|webp)$/i.test(path)) {
            const fileName = path.split('/').pop()?.toLowerCase() || '';
            images[fileName] = await zipEntry.async('arraybuffer');
          }
        }
        if (csvContent) {
          setExtractedImages(images);
          parseAndLoadCsv(csvContent);
        } else {
          alert('No CSV file found inside the ZIP.');
        }
      } catch (err) {
        console.error('Failed to read ZIP file:', err);
        alert('Failed to read ZIP file. Please ensure it is a valid ZIP archive.');
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const csvText = event.target?.result as string;
        if (csvText) parseAndLoadCsv(csvText);
      };
      reader.onerror = () => alert('Failed to read the CSV file.');
      reader.readAsText(file);
    }
  };

  const parseAndLoadCsv = (csvText: string) => {
    // Tokenize one CSV line, respecting RFC 4180 quoted fields
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let i = 0;
      while (i < line.length) {
        if (line[i] === '"') {
          // Quoted field
          let field = '';
          i++; // skip opening quote
          while (i < line.length) {
            if (line[i] === '"' && line[i + 1] === '"') {
              field += '"'; i += 2; // escaped quote
            } else if (line[i] === '"') {
              i++; break; // closing quote
            } else {
              field += line[i++];
            }
          }
          result.push(field);
          if (line[i] === ',') i++; // skip comma after field
        } else {
          // Unquoted field
          const end = line.indexOf(',', i);
          if (end === -1) {
            result.push(line.slice(i).trim());
            break;
          } else {
            result.push(line.slice(i, end).trim());
            i = end + 1;
          }
        }
      }
      return result;
    };

    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return; // need at least header + one data row
    const headers = parseLine(lines[0]);
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      const row: any = {};
      headers.forEach((header, index) => { row[header] = values[index] ?? ''; });
      data.push(row);
    }
    setCsvData(data, headers);
  };

  const handleAddField = (type: 'text' | 'number' | 'image', position?: { x: number; y: number; rx?: number; ry?: number }) => {
    const A4_WIDTH = 595;
    const A4_HEIGHT = 842;
    
    // Use relative coordinates if provided, otherwise calculate from absolute or use defaults
    const rx = position?.rx ?? (position?.x ? position.x / A4_WIDTH : 0.168); // 100/595 ≈ 0.168
    const ry = position?.ry ?? (position?.y ? position.y / A4_HEIGHT : 0.119); // 100/842 ≈ 0.119
    
    // Calculate absolute for backward compatibility
    const x = position?.x ?? rx * A4_WIDTH;
    const y = position?.y ?? ry * A4_HEIGHT;
    
    const isCertMode = bulkType === 'certificates';
    const newField: FieldConfig = {
      id: `field-${Date.now()}`,
      type,
      label: type === 'number' ? `P${pointCounter}` : type === 'image' ? 'Photo' : 'Text',
      x,
      y,
      rx,
      ry,
      fontSize: isCertMode ? 14 : 20,
      fontFamily: isCertMode ? 'Times New Roman' : 'CrashNumberingSerif',
      color: isCertMode ? '#000000' : '#FF0000',
      bold: false,
      align: 'left',
      value: type === 'number' ? `P${pointCounter}` : 'Sample Text',
      dataKey: undefined, // user maps via the panel
      width: type === 'image' ? 100 : undefined,
      height: type === 'image' ? 100 : undefined,
    };
    addField(newField);
    if (type === 'number') setPointCounter(pointCounter + 1);
    setSelectedFieldId(newField.id);
  };

  const handleGenerate = async () => {
    if (!templateFile) return;
    setIsGenerating(true);
    try {
      const outputPdf = await PDFDocument.create();
      outputPdf.registerFontkit(fontkit);
      const fileBytes = await templateFile.arrayBuffer();
      let pageWidth = 595.28, pageHeight = 841.89;
      let templateImage: any = null;
      let sourcePdf: any = null;

      if (templateFile.type === 'application/pdf') {
        sourcePdf = await PDFDocument.load(fileBytes);
        const firstPage = sourcePdf.getPages()[0];
        const { width, height } = firstPage.getSize();
        pageWidth = width; pageHeight = height;

        // Always render PDF page to a PNG image so it can be tiled into multi-leaflet cells.
        // (sourcePdf page-copy only works for single-per-page mode.)
        {
          const blobUrl = URL.createObjectURL(new Blob([fileBytes], { type: 'application/pdf' }));
          try {
            const pdfJs = await pdfjsLib.getDocument(blobUrl).promise;
            const pg = await pdfJs.getPage(1);
            const vp = pg.getViewport({ scale: 2 }); // 2× for sharpness
            const offscreen = document.createElement('canvas');
            offscreen.width = vp.width;
            offscreen.height = vp.height;
            const ctx = offscreen.getContext('2d');
            if (ctx) {
              await (pg.render({ canvasContext: ctx, viewport: vp } as any).promise);
              const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
                offscreen.toBlob((blob) => {
                  if (!blob) { reject(new Error('toBlob failed')); return; }
                  const reader = new FileReader();
                  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
                  reader.onerror = reject;
                  reader.readAsArrayBuffer(blob);
                }, 'image/png');
              });
              templateImage = await outputPdf.embedPng(pngBytes);
            }
          } catch (err) {
            console.error('Failed to render PDF to image for multi-leaflet:', err);
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        }

        // If Black & White mode is enabled for PDF templates, override with grayscale image
        if (templateBlackAndWhite) {
          const blobUrl = URL.createObjectURL(new Blob([fileBytes], { type: 'application/pdf' }));
          try {
            const loadingTask = pdfjsLib.getDocument(blobUrl);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);

            // Render at 3× for print-quality resolution (~216 DPI at A4 size)
            const viewport = page.getViewport({ scale: 3 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (ctx) {
              const renderContext: any = { canvasContext: ctx, viewport };
              await page.render(renderContext).promise;

              // BT.709 grayscale — no contrast manipulation to preserve design quality
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const data = imageData.data;

              for (let i = 0; i < data.length; i += 4) {
                const gray = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
              }

              ctx.putImageData(imageData, 0, 0);

              // Convert to PNG for lossless quality
              const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
                canvas.toBlob((blob) => {
                  if (!blob) { reject(new Error('toBlob failed')); return; }
                  const reader = new FileReader();
                  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
                  reader.onerror = reject;
                  reader.readAsArrayBuffer(blob);
                }, 'image/png');
              });

              // Embed as PNG image instead of using PDF source
              templateImage = await outputPdf.embedPng(pngBytes);
              pageWidth = templateImage.width;
              pageHeight = templateImage.height;
              sourcePdf = null; // Clear sourcePdf so we use image path
            }
          } catch (err) {
            console.error('Failed to convert PDF to grayscale:', err);
            // Fall back to original PDF if conversion fails
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        }
      } else if (templateFile.type.startsWith('image/')) {
        let imageBytes = new Uint8Array(fileBytes);
        // Apply grayscale conversion if Black & White mode is enabled
        if (templateBlackAndWhite) {
          try {
            const grayscaleResult = await convertToGrayscale(imageBytes, templateFile.type);
            imageBytes = new Uint8Array(grayscaleResult);
          } catch (err) {
            console.error('Failed to convert to grayscale:', err);
          }
        }
        if (templateFile.type === 'image/jpeg') templateImage = await outputPdf.embedJpg(imageBytes);
        else templateImage = await outputPdf.embedPng(imageBytes);
        pageWidth = templateImage.width; pageHeight = templateImage.height;
      }

      const helvetica = await outputPdf.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await outputPdf.embedFont(StandardFonts.HelveticaBold);
      const timesRoman = await outputPdf.embedFont(StandardFonts.TimesRoman);
      const timesRomanBold = await outputPdf.embedFont(StandardFonts.TimesRomanBold);
      const courier = await outputPdf.embedFont(StandardFonts.Courier);
      const courierBold = await outputPdf.embedFont(StandardFonts.CourierBold);

      // Load and embed CrashNumberingSerif custom font
      let crashNumberingSerifFont = helvetica;
      let crashNumberingSerifBoldFont = helveticaBold;
      try {
        const fontResponse = await fetch('/CrashNumberingSerif.otf');
        if (fontResponse.ok) {
          const fontBytes = await fontResponse.arrayBuffer();
          crashNumberingSerifFont = await outputPdf.embedFont(fontBytes);
          crashNumberingSerifBoldFont = crashNumberingSerifFont; // Use same font, bold is handled via field.bold flag
        }
      } catch (e) {
        console.error('Failed to load CrashNumberingSerif font:', e);
      }

      // Helper to get font based on field settings
      const getFont = (field: any) => {
        const fontFamily = field.fontFamily || 'Helvetica';
        const isBold = field.bold || false;
        
        switch (fontFamily) {
          case 'CrashNumberingSerif':
            return isBold ? crashNumberingSerifBoldFont : crashNumberingSerifFont;
          case 'Times New Roman':
            return isBold ? timesRomanBold : timesRoman;
          case 'Courier New':
            return isBold ? courierBold : courier;
          case 'Helvetica':
          default:
            return isBold ? helveticaBold : helvetica;
        }
      };

      const numberFields = fields.filter(f => f.type === 'number');
      const shouldLoopReceipts = bulkType === 'receipts' && numberFields.length > 0;
      const shouldLoopCertificates = bulkType === 'certificates' && csvData.length > 0;
      const isMultiLeaflet = bulkType === 'receipts' && leafletsPerPage > 1;
      const leafletCols = columns || 2;
      const leafletRows = rows || 3;

      // Validate certificates mode
      if (bulkType === 'certificates') {
        if (csvData.length === 0) {
          alert('No data rows found in CSV. Please upload a CSV with at least one data row.');
          setIsGenerating(false);
          return;
        }
        if (fields.length === 0) {
          alert('No fields placed on the template. Use "Place Merge Point" to add fields, then map them to CSV columns.');
          setIsGenerating(false);
          return;
        }
        const unmapped = fields.filter(f => !f.dataKey);
        if (unmapped.length > 0) {
          const names = unmapped.map(f => f.label).join(', ');
          const proceed = window.confirm(`${unmapped.length} field(s) are not mapped to a CSV column (${names}). They will appear blank. Continue anyway?`);
          if (!proceed) { setIsGenerating(false); return; }
        }
      }

      // Calculate page count
      let maxPages = pagesToGenerate;
      if (!maxPages && shouldLoopReceipts) {
        const totalReceipts = toNumber - fromNumber + 1;
        const leafletsPerSheet = isMultiLeaflet ? leafletsPerPage : 1;
        maxPages = Math.ceil(totalReceipts / leafletsPerSheet);
      } else if (!maxPages && shouldLoopCertificates) {
        maxPages = csvData.length;
      } else if (!maxPages) {
        maxPages = 1;
      }

      // Helper: draw a text field onto a PDF page cell.
      // rx/ry are 0–1 fractions of the cell. pageW/pageH are the cell dimensions in PDF points.
      // offsetX/offsetY shift the origin for multi-leaflet cells (PDF Y is from bottom-left).
      const drawTextField = (page: any, field: typeof fields[0], text: string, pageW: number, pageH: number, offsetX = 0, offsetY = 0) => {
        // Recover cell-relative position from stored fractions
        const rx = field.rx ?? field.x / 595;
        const ry = field.ry ?? field.y / 842;
        const cellX = rx * pageW;
        const cellY = ry * pageH;

        const safeText = String(text ?? '').trim();
        if (!safeText) return;

        const font = getFont(field);
        const textWidth = font.widthOfTextAtSize(safeText, field.fontSize);

        const hex = (field.color || '#000000').replace('#', '').padEnd(6, '0');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        // Canvas: outer div centered at (cellX, cellY) via translate(-50%,-50%).
        // Line-height ≈ 1.2 * fontSize. Baseline from top of line box ≈ fontSize * 0.8 (ascender).
        // Baseline from page top = cellY - (1.2*fontSize)/2 + fontSize*0.8
        //                        = cellY - fontSize*0.6 + fontSize*0.8
        //                        = cellY + fontSize * 0.2
        // PDF y is measured from page bottom:
        const pdfX = cellX - textWidth / 2 + offsetX;
        const pdfY = pageH - cellY - field.fontSize * 0.2 + offsetY;

        page.drawText(safeText, {
          x: Math.max(0, pdfX),
          y: Math.max(0, pdfY),
          size: field.fontSize,
          font,
          color: rgb(r, g, b),
        });
      };

      let currentNumber = fromNumber;
      let csvRowIndex = 0;

      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        if (shouldLoopReceipts && currentNumber > toNumber) break;
        if (shouldLoopCertificates && csvRowIndex >= csvData.length) break;

        // ── CERTIFICATES: one page per CSV row ──────────────────────────────────
        if (shouldLoopCertificates) {
          const A4_WIDTH = 595;
          const A4_HEIGHT = 842;
          let page: any;

          if (sourcePdf) {
            const [copiedPage] = await outputPdf.copyPages(sourcePdf, [0]);
            page = outputPdf.addPage(copiedPage);
          } else {
            page = outputPdf.addPage([A4_WIDTH, A4_HEIGHT]);
            if (templateImage) {
              page.drawImage(templateImage, { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT });
            }
          }

          const { width: pageW, height: pageH } = page.getSize();
          const dataRow = csvData[csvRowIndex] ?? {};

          // Every field is CSV-driven: look up value by dataKey
          for (const field of fields) {
            const csvValue = field.dataKey ? String(dataRow[field.dataKey] ?? '').trim() : '';
            const fallback = field.value || field.label || '';
            const text = csvValue || fallback;

            if (field.type === 'image') {
              // Image fields: look up extracted image by filename stored in CSV cell
              const filename = csvValue.toLowerCase();
              const imgBuffer = filename ? extractedImages[filename] : null;
              if (imgBuffer) {
                try {
                  const fieldX = (field.rx !== undefined ? field.rx : field.x / pageW) * pageW;
                  const fieldY = (field.ry !== undefined ? field.ry : field.y / pageH) * pageH;
                  const w = field.width ?? 80;
                  const h = field.height ?? 80;
                  const embeddedImg = filename.endsWith('.jpg') || filename.endsWith('.jpeg')
                    ? await outputPdf.embedJpg(new Uint8Array(imgBuffer))
                    : await outputPdf.embedPng(new Uint8Array(imgBuffer));
                  page.drawImage(embeddedImg, {
                    x: fieldX - w / 2,
                    y: pageH - fieldY - h / 2,
                    width: w,
                    height: h,
                  });
                } catch (e) {
                  console.warn(`Could not embed image "${filename}":`, e);
                }
              }
            } else {
              // text and number field types both render text from CSV
              drawTextField(page, field, text, pageW, pageH);
            }
          }

          csvRowIndex++;

        // ── RECEIPTS: multi-leaflet ──────────────────────────────────────────────
        } else if (isMultiLeaflet) {
          const BASE_W = orientation === 'landscape' ? 842 : 595;
          const CELL_H = orientation === 'landscape' ? 595 : 842;
          const BIND = bindingMargin;
          const CELL_W = Math.floor((BASE_W * leafletCols - BIND) / leafletCols);
          const totalWidth = CELL_W * leafletCols + BIND;
          const totalHeight = CELL_H * leafletRows;
          const page = outputPdf.addPage([totalWidth, totalHeight]);

          for (let i = 0; i < leafletsPerPage; i++) {
            const col = i % leafletCols;
            const row = Math.floor(i / leafletCols);
            // All cells shifted right by binding margin
            const offsetX = BIND + col * CELL_W;
            const offsetY = totalHeight - (row + 1) * CELL_H;

            if (templateImage) {
              page.drawImage(templateImage, { x: offsetX, y: offsetY, width: CELL_W, height: CELL_H });
            }

            // Number right-to-left within each row
            const rtlIndex = row * leafletCols + (leafletCols - 1 - col);
            const leafletNumber = fromNumber + rtlIndex + pageNum * leafletsPerPage;
            if (leafletNumber > toNumber) continue;

            for (const field of numberFields) {
              const fieldIndex = numberFields.indexOf(field);
              const actualNumber = leafletNumber + fieldIndex;
              if (actualNumber > toNumber) continue;
              const text = `${numberingPrefix}${numberingSeparator}${numberingYear}${numberingSeparator}${String(actualNumber).padStart(zeroPadding, '0')}`;
              drawTextField(page, field, text, CELL_W, CELL_H, offsetX, offsetY);
            }
          }
          currentNumber += numberFields.length;

        // ── RECEIPTS: single per page ────────────────────────────────────────────
        } else {
          const A4_WIDTH = 595;
          const A4_HEIGHT = 842;
          let page: any;

          if (sourcePdf) {
            const [copiedPage] = await outputPdf.copyPages(sourcePdf, [0]);
            page = outputPdf.addPage(copiedPage);
          } else {
            page = outputPdf.addPage([A4_WIDTH, A4_HEIGHT]);
            if (templateImage) page.drawImage(templateImage, { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT });
          }

          const { width: pageW, height: pageH } = page.getSize();

          for (const field of numberFields) {
            const fieldIndex = numberFields.indexOf(field);
            const actualNumber = currentNumber + fieldIndex;
            if (actualNumber > toNumber) break;
            const text = `${numberingPrefix}${numberingSeparator}${numberingYear}${numberingSeparator}${String(actualNumber).padStart(zeroPadding, '0')}`;
            drawTextField(page, field, text, pageW, pageH, 0, 0);
          }
          currentNumber += numberFields.length;
        }
      }

      const pdfBytes = await outputPdf.save();
      const blob = new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' });
      // Revoke previous generated PDF blob to avoid memory leaks
      const prevUrl = useStore.getState().generatedPdfUrl;
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      const url = URL.createObjectURL(blob);
      setGeneratedPdfUrl(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (generatedPdfUrl) {
      const printWindow = window.open(generatedPdfUrl);
      if (printWindow) printWindow.onload = () => printWindow.print();
    }
  };

  // --- LANDING PAGE ---
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8 font-sans">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-blue-500/25">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            MUZARA Bulk Creator
          </h1>
          <p className="text-gray-400 text-base max-w-sm mx-auto">
            Choose a document type, upload your designed template, and generate in bulk.
          </p>
        </div>

        {/* Two mode cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">

          {/* ── RECEIPTS ── */}
          <div
            {...getReceiptRootProps()}
            className={cn(
              "relative group flex flex-col rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 overflow-hidden",
              isReceiptDragActive
                ? "border-blue-400 bg-blue-500/10 shadow-2xl shadow-blue-500/20 scale-[1.02]"
                : "border-white/15 bg-white/[0.03] hover:border-blue-500/50 hover:bg-blue-500/5"
            )}
          >
            <input {...getReceiptInputProps()} />

            {/* colour bar */}
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-cyan-400" />

            <div className="p-8 flex flex-col flex-1">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                  <Receipt className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">Receipts</h2>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Auto-number your receipt template from any range. Supports multi-per-page layouts (2, 4, 6 per sheet).
                  </p>
                </div>
              </div>

              <ul className="space-y-2 mb-8">
                {['Sequential numbering with custom prefix & year', 'Multi-leaflet layouts (2–6 per page)', 'Black & white conversion', 'Custom padding & separator format'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className={cn(
                "mt-auto flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-medium transition-all",
                isReceiptDragActive
                  ? "bg-blue-500 border-blue-400 text-white"
                  : "bg-white/5 border-white/10 text-gray-300 group-hover:bg-blue-500/10 group-hover:border-blue-500/40 group-hover:text-blue-300"
              )}>
                <FileUp className="w-4 h-4" />
                {isReceiptDragActive ? 'Drop template here…' : 'Upload Receipt Template'}
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </div>
            </div>
          </div>

          {/* ── REPORT CARDS / CERTIFICATES ── */}
          <div
            {...getCertRootProps()}
            className={cn(
              "relative group flex flex-col rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 overflow-hidden",
              isCertDragActive
                ? "border-purple-400 bg-purple-500/10 shadow-2xl shadow-purple-500/20 scale-[1.02]"
                : "border-white/15 bg-white/[0.03] hover:border-purple-500/50 hover:bg-purple-500/5"
            )}
          >
            <input {...getCertInputProps()} />

            {/* colour bar */}
            <div className="h-1 w-full bg-gradient-to-r from-purple-500 to-pink-400" />

            <div className="p-8 flex flex-col flex-1">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">Report Cards &amp; Certificates</h2>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Merge CSV data into your template — one page per student/recipient. Supports photos from a ZIP.
                  </p>
                </div>
              </div>

              <ul className="space-y-2 mb-8">
                {['CSV data merge (names, scores, remarks)', 'Photo fields from ZIP archive', 'One page generated per CSV row', 'Map any CSV column to any field'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className={cn(
                "mt-auto flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-medium transition-all",
                isCertDragActive
                  ? "bg-purple-500 border-purple-400 text-white"
                  : "bg-white/5 border-white/10 text-gray-300 group-hover:bg-purple-500/10 group-hover:border-purple-500/40 group-hover:text-purple-300"
              )}>
                <FileUp className="w-4 h-4" />
                {isCertDragActive ? 'Drop template here…' : 'Upload Report Card Template'}
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <p className="mt-10 text-xs text-gray-600">
          Accepts PDF, PNG, JPG — your template stays unchanged; fields are overlaid on top.
        </p>
      </div>
    );
  }

  // --- DESIGN STUDIO ---
  return (
    <div className="h-screen bg-[#1a1a1a] text-white flex overflow-hidden font-sans">
      {/* Left Sidebar - Tools */}
      <div className="w-[380px] flex flex-col border-r border-white/10 bg-[#1a1a1a]">
        {/* Header */}
        <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('landing')} className="p-2 hover:bg-white/10 rounded-lg"><ArrowLeft className="w-4 h-4 text-gray-400" /></button>
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", bulkType === 'receipts' ? "bg-blue-500/20" : "bg-purple-500/20")}>
              {bulkType === 'receipts' ? <Receipt className="w-4 h-4 text-blue-400" /> : <GraduationCap className="w-4 h-4 text-purple-400" />}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-200">Design Studio</span>
              <span className="text-[10px] text-gray-500">{bulkType === 'receipts' ? 'Receipts' : 'Report Cards / Certificates'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => undo()} className="p-2 hover:bg-white/10 rounded-lg"><Undo className="w-4 h-4 text-gray-400" /></button>
            <button onClick={() => redo()} className="p-2 hover:bg-white/10 rounded-lg"><Redo className="w-4 h-4 text-gray-400" /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* File Info */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{templateFile?.name}</p>
                <p className="text-xs text-gray-500">Template loaded</p>
              </div>
              <button onClick={() => setView('landing')} className="text-xs text-blue-400 hover:text-blue-300">Change</button>
            </div>
          </div>

          {/* Add Elements */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MousePointer2 className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Add Elements</h2>
            </div>
            <div className="space-y-2">
              <button 
                onClick={() => setInteractionMode(interactionMode === 'place_point' ? 'select' : 'place_point')}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm border transition-all",
                  interactionMode === 'place_point' 
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 ring-2 ring-amber-500/30" 
                    : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                )}
              >
                <MousePointer2 className={cn("w-4 h-4", interactionMode === 'place_point' && "animate-pulse")} />
                {interactionMode === 'place_point' ? 'Click to Deactivate' : 'Place Merge Point (P1, P2...)'}
              </button>
              {(bulkType === 'certificates') && (
                <button 
                  onClick={() => {
                    setInteractionMode('select');
                    handleAddField('image');
                  }} 
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 hover:bg-white/10"
                >
                  <ImageIcon className="w-4 h-4" /> Add Photo Field
                </button>
              )}
            </div>
          </div>

          {/* Template Display */}
          {bulkType === 'receipts' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-white">Template Display</h2>
              </div>
              <button
                onClick={() => setTemplateBlackAndWhite(!templateBlackAndWhite)}
                className={cn(
                  "w-full flex items-center justify-between py-2.5 px-3 rounded-xl text-sm border transition-all",
                  templateBlackAndWhite ? "bg-purple-500/10 border-purple-500/30 text-purple-300" : "bg-white/5 border-white/10 text-gray-300"
                )}
              >
                <span className="flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Black & White</span>
                <span className={cn("px-2 py-0.5 rounded text-[10px]", templateBlackAndWhite ? "bg-purple-500/20" : "bg-white/10")}>
                  {templateBlackAndWhite ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          )}

          {/* Pages to Generate */}
          {bulkType === 'receipts' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Pages to Generate</h2>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  placeholder="All"
                  value={pagesToGenerate || ''}
                  onChange={(e) => setPagesToGenerate(e.target.value === '' ? null : parseInt(e.target.value))}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
                />
                <button onClick={() => setPagesToGenerate(null)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm">All</button>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="relative flex gap-1 border-b border-white/10 pb-1">
              <TabButton active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={<Database className="w-4 h-4" />} label="Data" />
              <TabButton active={activeTab === 'typography'} onClick={() => setActiveTab('typography')} icon={<Type className="w-4 h-4" />} label="Typography" />
              {bulkType === 'receipts' && <TabButton active={activeTab === 'layout'} onClick={() => setActiveTab('layout')} icon={<Layout className="w-4 h-4" />} label="Layout" />}
            </div>

            {/* Data Tab */}
            {activeTab === 'data' && (
              <div className="space-y-4">
                {bulkType === 'receipts' && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2"><Hash className="w-3 h-3 text-blue-400" /> Numbering</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">From</label>
                        <input type="number" value={fromNumber} onChange={(e) => setNumbering(parseInt(e.target.value) || 1, toNumber, zeroPadding)} className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">To</label>
                        <input type="number" value={toNumber} onChange={(e) => setNumbering(fromNumber, parseInt(e.target.value) || 100, zeroPadding)} className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Padding</label>
                        <input type="number" value={zeroPadding} onChange={(e) => setNumbering(fromNumber, toNumber, parseInt(e.target.value) || 3)} className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs" />
                      </div>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <h4 className="text-[10px] font-medium text-gray-400">Custom Format</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <input type="text" value={numberingPrefix} onChange={(e) => setCustomNumbering(e.target.value, numberingYear, numberingSeparator)} className="bg-black/50 border border-white/10 rounded px-2 py-1 text-xs" placeholder="Prefix" />
                        <input type="text" value={numberingYear} onChange={(e) => setCustomNumbering(numberingPrefix, e.target.value, numberingSeparator)} className="bg-black/50 border border-white/10 rounded px-2 py-1 text-xs" placeholder="Year" />
                        <select value={numberingSeparator} onChange={(e) => setCustomNumbering(numberingPrefix, numberingYear, e.target.value)} className="bg-black/50 border border-white/10 rounded px-2 py-1 text-xs">
                          <option value="">None</option>
                          <option value="/">/</option>
                          <option value="-">-</option>
                          <option value="_">_</option>
                          <option value=".">.</option>
                          <option value=" ">Space</option>
                        </select>
                      </div>
                      <div className="bg-black/30 rounded p-2">
                        <div className="text-[10px] text-gray-500">Preview:</div>
                        <div className="text-xs text-blue-400 font-mono">
                          {numberingPrefix}{numberingSeparator}{numberingYear}{numberingSeparator}{String(fromNumber).padStart(zeroPadding, '0')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {bulkType === 'certificates' && (
                  <div className="space-y-4">
                    {/* ── Step 1: Upload CSV / ZIP ── */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 text-[9px] flex items-center justify-center font-bold">1</span>
                        Upload Data File
                      </h3>
                      {csvData.length === 0 ? (
                        <label className="block cursor-pointer">
                          <input type="file" accept=".csv,.zip" onChange={handleDataUpload} className="hidden" />
                          <div className="flex flex-col items-center gap-2 py-5 px-4 bg-white/5 border-2 border-dashed border-white/10 rounded-xl hover:border-purple-500/40 hover:bg-purple-500/5 transition-all text-center">
                            <Upload className="w-6 h-6 text-gray-400" />
                            <div>
                              <p className="text-sm text-gray-300 font-medium">Upload CSV or ZIP</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">CSV for data · ZIP for data + photos</p>
                            </div>
                          </div>
                        </label>
                      ) : (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-emerald-400" />
                            <div>
                              <p className="text-xs font-medium text-emerald-300">{csvData.length} records loaded</p>
                              <p className="text-[10px] text-gray-500">{csvHeaders.length} columns: {csvHeaders.slice(0, 3).join(', ')}{csvHeaders.length > 3 ? '…' : ''}</p>
                            </div>
                          </div>
                          <button onClick={() => setCsvData([], [])} className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-all">Clear</button>
                        </div>
                      )}
                    </div>

                    {/* ── Step 2: Place fields on canvas ── */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 text-[9px] flex items-center justify-center font-bold">2</span>
                        Place Fields on Template
                      </h3>
                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        Use <span className="text-amber-400">Place Merge Point</span> above to click where each value should appear. Then map each field to a CSV column below.
                      </p>
                    </div>

                    {/* ── Step 3: Map fields → CSV columns ── */}
                    {fields.length > 0 && csvHeaders.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 text-[9px] flex items-center justify-center font-bold">3</span>
                          Map Fields → CSV Columns
                        </h3>
                        <div className="space-y-1.5">
                          {fields.map((field) => (
                            <div key={field.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                              <div className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                field.type === 'number' ? "bg-blue-400" : field.type === 'image' ? "bg-emerald-400" : "bg-purple-400"
                              )} />
                              <span className="text-[11px] text-gray-300 font-medium w-16 shrink-0 truncate">{field.label}</span>
                              <select
                                value={field.dataKey || ''}
                                onChange={(e) => updateField(field.id, { dataKey: e.target.value || undefined })}
                                className="flex-1 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px] text-gray-200 min-w-0"
                              >
                                <option value="">— not mapped —</option>
                                {csvHeaders.map((h) => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>

                        {/* Mapping summary */}
                        <div className="flex items-center justify-between text-[10px] pt-1">
                          <span className="text-gray-500">
                            {fields.filter(f => f.dataKey).length}/{fields.length} fields mapped
                          </span>
                          {fields.filter(f => f.dataKey).length === fields.length && fields.length > 0 && (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Placeholder when no fields yet */}
                    {fields.length === 0 && (
                      <div className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-4 text-center">
                        <p className="text-[11px] text-gray-500">No fields placed yet.<br/>Use "Place Merge Point" to add fields.</p>
                      </div>
                    )}

                    {/* Preview row selector */}
                    {csvData.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-white/10">
                        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 text-[9px] flex items-center justify-center font-bold">4</span>
                          Preview Row
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => store.setCurrentPage(Math.max(1, store.currentPage - 1))}
                            className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs hover:bg-white/10 disabled:opacity-30"
                            disabled={store.currentPage <= 1}
                          >‹</button>
                          <span className="flex-1 text-center text-xs text-gray-300">
                            Row {store.currentPage} of {csvData.length}
                          </span>
                          <button
                            onClick={() => store.setCurrentPage(Math.min(csvData.length, store.currentPage + 1))}
                            className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs hover:bg-white/10 disabled:opacity-30"
                            disabled={store.currentPage >= csvData.length}
                          >›</button>
                        </div>
                        {/* Show current row data */}
                        <div className="bg-black/30 rounded-lg p-2 space-y-1 max-h-28 overflow-y-auto">
                          {csvHeaders.slice(0, 6).map((h) => (
                            <div key={h} className="flex gap-2 text-[10px]">
                              <span className="text-gray-500 w-20 shrink-0 truncate">{h}:</span>
                              <span className="text-gray-300 truncate">{csvData[store.currentPage - 1]?.[h] ?? '—'}</span>
                            </div>
                          ))}
                          {csvHeaders.length > 6 && <p className="text-[9px] text-gray-600">+{csvHeaders.length - 6} more columns…</p>}
                        </div>
                      </div>
                    )}

                    {/* Pages to Generate (certificates) */}
                    <div className="space-y-1.5 pt-2 border-t border-white/10">
                      <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 text-[9px] flex items-center justify-center font-bold">5</span>
                        Pages to Generate
                      </h3>
                      <p className="text-[10px] text-gray-500">
                        Default: all {csvData.length || '—'} rows. Limit to generate a subset.
                      </p>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          min="1"
                          max={csvData.length || undefined}
                          placeholder={`All (${csvData.length || '—'})`}
                          value={pagesToGenerate || ''}
                          onChange={(e) => setPagesToGenerate(e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1))}
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-600"
                        />
                        {pagesToGenerate && (
                          <button
                            onClick={() => setPagesToGenerate(null)}
                            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] text-gray-400 hover:text-white hover:bg-white/10 transition-all whitespace-nowrap"
                          >
                            All
                          </button>
                        )}
                      </div>
                      {pagesToGenerate && csvData.length > 0 && (
                        <p className="text-[10px] text-purple-400">
                          Will generate rows 1–{Math.min(pagesToGenerate, csvData.length)} of {csvData.length}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Typography Tab */}
            {activeTab === 'typography' && (
              <div className="space-y-4">
                {selectedFieldIds.length > 0 && firstSelectedField ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                          <Type className="w-3 h-3 text-blue-400" /> 
                          Typography
                        </h3>
                        {hasMultipleSelection && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                            {selectedFieldIds.length} selected
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {hasMultipleSelection && (
                          <button 
                            onClick={clearFieldSelection} 
                            className="p-1.5 bg-gray-500/10 border border-gray-500/30 text-gray-400 rounded-lg text-xs"
                            title="Clear selection"
                          >
                            Clear
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            if (Array.isArray(selectedFieldIds)) {
                              selectedFieldIds.forEach(id => removeField(id));
                            } else {
                              removeField(selectedFieldIds);
                            }
                          }} 
                          className="p-1.5 bg-red-500/10 border border-red-500/50 text-red-400 rounded-lg"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Select All Number Fields Button */}
                    {fields.filter(f => f.type === 'number').length > 0 && !hasMultipleSelection && (
                      <button 
                        onClick={selectAllNumberFields}
                        className="w-full py-2 px-3 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-lg text-xs hover:bg-blue-500/20 transition-colors"
                      >
                        Select All Number Fields ({fields.filter(f => f.type === 'number').length})
                      </button>
                    )}
                    
                    {/* Bulk Typography Controls */}
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1.5">Font Family</label>
                      <select 
                        value={firstSelectedField?.fontFamily || 'CrashNumberingSerif'} 
                        onChange={(e) => updateMultipleFields(selectedFieldIds, { fontFamily: e.target.value })} 
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="CrashNumberingSerif">CrashNumberingSerif</option>
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                        {customFonts.map(font => <option key={font.name} value={font.name}>{font.name}</option>)}
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[10px] text-gray-500 mb-1.5">Size</label>
                        <input 
                          type="number" 
                          value={firstSelectedField?.fontSize || 20} 
                          onChange={(e) => updateMultipleFields(selectedFieldIds, { fontSize: parseInt(e.target.value) || 12 })} 
                          className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1.5">Color</label>
                        <input 
                          type="color" 
                          value={firstSelectedField?.color || '#FF0000'} 
                          onChange={(e) => updateMultipleFields(selectedFieldIds, { color: e.target.value })} 
                          className="w-full h-9 bg-black/50 border border-white/10 rounded-lg" 
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1.5">Alignment</label>
                      <div className="grid grid-cols-3 gap-1">
                        <button 
                          onClick={() => updateMultipleFields(selectedFieldIds, { align: 'left' })} 
                          className={cn("py-2 flex items-center justify-center rounded-lg text-xs border", firstSelectedField?.align === 'left' ? "bg-blue-600" : "bg-black/50 border-white/10")}
                        >
                          <AlignLeft className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => updateMultipleFields(selectedFieldIds, { align: 'center' })} 
                          className={cn("py-2 flex items-center justify-center rounded-lg text-xs border", firstSelectedField?.align === 'center' ? "bg-blue-600" : "bg-black/50 border-white/10")}
                        >
                          <AlignCenter className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => updateMultipleFields(selectedFieldIds, { align: 'right' })} 
                          className={cn("py-2 flex items-center justify-center rounded-lg text-xs border", firstSelectedField?.align === 'right' ? "bg-blue-600" : "bg-black/50 border-white/10")}
                        >
                          <AlignRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => updateMultipleFields(selectedFieldIds, { bold: !(firstSelectedField?.bold ?? true) })} 
                      className={cn("w-full py-2 flex items-center justify-center rounded-lg text-xs border", firstSelectedField?.bold ? "bg-blue-600" : "bg-black/50 border-white/10")}
                    >
                      <Bold className="w-3 h-3 mr-1" /> {firstSelectedField?.bold ? 'Bold' : 'Regular'}
                    </button>
                    
                    {hasMultipleSelection && (
                      <p className="text-[10px] text-gray-500 text-center">
                        Changes apply to all {selectedFieldIds.length} selected fields
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Type className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No field selected</p>
                    <p className="text-xs text-gray-500 mt-1">Click a field on the canvas</p>
                    <p className="text-xs text-gray-600 mt-2">Hold Ctrl/Cmd to multi-select</p>
                  </div>
                )}
              </div>
            )}

            {/* Layout Tab */}
            {activeTab === 'layout' && bulkType === 'receipts' && (
              <div className="space-y-4">
                {/* Leaflets Per Page */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-gray-400">Leaflets Per Page</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 4, 6].map((num) => {
                      const cols = num === 1 ? 1 : num === 2 ? 2 : num === 4 ? 2 : 2;
                      const rows = num === 1 ? 1 : num === 2 ? 1 : num === 4 ? 2 : 3;
                      return (
                        <button key={num} onClick={() => setLayout(num, cols, rows, orientation)} className={cn("py-2 px-1 rounded-xl text-xs font-semibold", leafletsPerPage === num ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400")}>
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Orientation */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-gray-400">Orientation</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setLayout(leafletsPerPage, columns, rows, 'portrait')} className={cn("flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs", orientation === 'portrait' ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400")}>
                      <div className="w-3 h-4 border-2 border-current rounded-sm" /> Portrait
                    </button>
                    <button onClick={() => setLayout(leafletsPerPage, columns, rows, 'landscape')} className={cn("flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs", orientation === 'landscape' ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400")}>
                      <div className="w-4 h-3 border-2 border-current rounded-sm" /> Landscape
                    </button>
                  </div>
                </div>

                {/* Binding Margin */}
                {leafletsPerPage > 1 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-gray-400">Binding Margin (left, pt)</h4>
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min={0} max={72} step={1}
                        value={bindingMargin}
                        onChange={e => setBindingMargin(Number(e.target.value))}
                        className="flex-1 accent-blue-500"
                      />
                      <span className="text-xs text-gray-300 w-8 text-right">{bindingMargin}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Generate Button */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <button 
            onClick={handleGenerate}
            disabled={isGenerating || !templateUrl}
            className={cn(
              "w-full font-semibold py-3.5 rounded-xl transition-all text-sm",
              isGenerating ? "bg-gradient-to-r from-blue-600 to-purple-600" : "bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            )}
          >
            {isGenerating ? 'Generating...' : 'Generate PDF'}
          </button>
        </div>
      </div>

      {/* Center - Template Canvas */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#2a2a2a]">
        <div className="h-14 bg-[#1a1a1a] border-b border-white/10 flex items-center justify-between px-4">
          <span className="text-sm font-medium text-gray-300">Template Canvas</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{fields.length} fields</span>
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-1 py-0.5">
              <button
                onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded transition-all text-sm font-bold"
                title="Zoom out (−)"
              >−</button>
              <button
                onClick={() => setZoomLevel(1)}
                className="min-w-[46px] text-center text-xs font-mono text-gray-300 hover:text-white hover:bg-white/10 rounded px-1 py-0.5 transition-all"
                title="Reset zoom"
              >{Math.round(zoomLevel * 100)}%</button>
              <button
                onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded transition-all text-sm font-bold"
                title="Zoom in (+)"
              >+</button>
            </div>
          </div>
        </div>
        <div
          className="flex-1 overflow-hidden"
          ref={canvasScrollRef}
          style={{ cursor: isSpacePanning ? 'grabbing' : spaceDown ? 'grab' : undefined }}
          onMouseDown={(e) => {
            if (!spaceDown) return;
            e.preventDefault();
            const el = canvasScrollRef.current!;
            setIsSpacePanning(true);
            canvasPanStart.current = { mx: e.clientX, my: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
          }}
          onMouseMove={(e) => {
            if (!isSpacePanning || !canvasPanStart.current) return;
            const el = canvasScrollRef.current!;
            el.scrollLeft = canvasPanStart.current.sl - (e.clientX - canvasPanStart.current.mx);
            el.scrollTop  = canvasPanStart.current.st - (e.clientY - canvasPanStart.current.my);
          }}
          onMouseUp={() => { setIsSpacePanning(false); canvasPanStart.current = null; }}
          onMouseLeave={() => { setIsSpacePanning(false); canvasPanStart.current = null; }}
        >
          <div
            style={{
              width:  (() => { const bw = orientation === 'landscape' ? 842 : 595; const cols = leafletsPerPage > 1 ? (columns || 2) : 1; const cw = leafletsPerPage > 1 ? Math.floor((bw * cols - bindingMargin) / cols) : bw; return (cw * cols + (leafletsPerPage > 1 ? bindingMargin : 0)) * zoomLevel + 1200; })(),
              height: Math.max(842, (orientation === 'landscape' ? 595 : 842) * (leafletsPerPage > 1 ? (rows || 3) : 1)) * zoomLevel + 1200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TemplateCanvas
              templateUrl={templateUrl}
              templateFile={templateFile}
              fields={fields}
              selectedFieldIds={selectedFieldIds}
              toggleFieldSelection={toggleFieldSelection}
              interactionMode={interactionMode}
              onAddField={handleAddField}
              updateField={updateField}
              removeField={removeField}
              templateBlackAndWhite={templateBlackAndWhite}
              fromNumber={fromNumber}
              zeroPadding={zeroPadding}
              numberingPrefix={numberingPrefix}
              numberingYear={numberingYear}
              numberingSeparator={numberingSeparator}
              leafletsPerPage={leafletsPerPage}
              columns={columns}
              rows={rows}
              orientation={orientation}
              bindingMargin={bindingMargin}
              bulkType={bulkType}
              snapToGrid={snapToGrid}
              gridSize={gridSize}
              zoomLevel={zoomLevel}
              setZoomLevel={setZoomLevel}
              showGrid={showGrid}
              isSpacePanning={spaceDown || isSpacePanning}
            />
          </div>
        </div>
      </div>

      {/* Right Panel - PDF Preview */}
      <div className="w-[400px] shrink-0 flex flex-col bg-[#f5f5f5] border-l border-gray-200">
        <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">{generatedPdfUrl ? 'Generated' : 'Preview'}</span>
            {numPages > 0 && <span className="text-xs text-gray-500 bg-gray-100 px-2 rounded">{numPages} pages</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} disabled={!generatedPdfUrl} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"><Printer className="w-5 h-5 text-gray-600" /></button>
            <a href={generatedPdfUrl || '#'} download="muzara-export.pdf" className={cn("p-2 hover:bg-gray-100 rounded-lg", !generatedPdfUrl && "opacity-50 pointer-events-none")}><Download className="w-5 h-5 text-gray-600" /></a>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-[#e8e8e8]">
          {generatedPdfUrl && pdfDocument ? (
            <div className="flex flex-col items-center pb-8 space-y-4">
              {Array.from(new Array(numPages), (_, index) => (
                <div key={index} className="bg-white shadow-lg rounded-sm p-2 w-full max-w-[350px]">
                  <PdfPage pdf={pdfDocument} pageNumber={index + 1} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-sm text-center">Click "Generate PDF" to see preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// PdfPage component for rendering individual PDF pages
function PdfPage({ pdf, pageNumber }: { pdf: any; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let isCancelled = false;
    let renderTask: any = null;

    const render = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (isCancelled) return;
        const desiredWidth = 350;
        const viewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          canvas.height = scaledViewport.height;
          canvas.width = scaledViewport.width;
          if (context) {
            renderTask = page.render({ canvasContext: context, viewport: scaledViewport });
            await renderTask.promise;
          }
        }
      } catch (err) {
        if (!isCancelled) setError("Failed to render page.");
      }
    };
    render();
    return () => { 
      isCancelled = true; 
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, pageNumber]);

  if (error) return <div className="text-red-500 text-xs p-2">{error}</div>;
  return <canvas ref={canvasRef} className="w-full" />;
}
