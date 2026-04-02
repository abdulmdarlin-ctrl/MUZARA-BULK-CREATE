/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileUp, FileText, Download, Printer, Plus, Hash, Image as ImageIcon, 
  MousePointer2, Upload, Database, Layout, Type, Trash2, Minus,
  AlignLeft, AlignCenter, AlignRight, Bold, ArrowLeft, Sparkles, Undo, Redo
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
  selectedFieldId, 
  setSelectedFieldId,
  selectedFieldIds,
  toggleFieldSelection,
  interactionMode,
  setInteractionMode,
  onAddField,
  updateField,
  updateMultipleFields,
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
  bulkType,
  snapToGrid,
  gridSize,
  zoomLevel,
  setZoomLevel,
  showCoordinates,
  showGrid,
  canvasDimensions,
}: {
  templateUrl: string | null;
  templateFile: File | null;
  fields: FieldConfig[];
  selectedFieldId: string | null;
  setSelectedFieldId: (id: string | null) => void;
  selectedFieldIds: string[];
  toggleFieldSelection: (id: string, isCtrlKey: boolean) => void;
  interactionMode: 'select' | 'place_point';
  setInteractionMode: (mode: 'select' | 'place_point') => void;
  onAddField: (type: 'text' | 'number' | 'image', position?: { x: number; y: number }) => void;
  updateField: (id: string, updates: Partial<FieldConfig>) => void;
  updateMultipleFields: (ids: string[], updates: Partial<FieldConfig>) => void;
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
  bulkType: 'receipts' | 'certificates' | 'idcards';
  snapToGrid: boolean;
  gridSize: number;
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  showCoordinates: boolean;
  showGrid: boolean;
  canvasDimensions: { width: number; height: number };
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ width: 595, height: 842 });
  const [pdfPage, setPdfPage] = useState<any>(null);
  
  // Modern placement features state
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [smartGuides, setSmartGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [nudgeDirection, setNudgeDirection] = useState<{ x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const pdfRenderTaskRef = useRef<any>(null);
  const isRenderingRef = useRef<boolean>(false);

  // Load PDF if template is PDF
  useEffect(() => {
    if (templateUrl && templateFile?.type === 'application/pdf') {
      const loadPdf = async () => {
        if (isRenderingRef.current && pdfRenderTaskRef.current) {
          try {
            pdfRenderTaskRef.current.cancel();
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (e) {}
        }
        if (isRenderingRef.current) return;
        isRenderingRef.current = true;
        try {
          const loadingTask = pdfjsLib.getDocument(templateUrl);
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          setPdfPage(page);
          // Force A4 dimensions for consistent coordinate system
          setImgSize({ width: 595, height: 842 });
          if (pdfCanvasRef.current) {
            const canvas = pdfCanvasRef.current;
            const context = canvas.getContext('2d');
            const renderViewport = page.getViewport({ scale: 1 });
            canvas.width = renderViewport.width;
            canvas.height = renderViewport.height;
            if (context) {
              const renderContext: any = { canvasContext: context, viewport: renderViewport };
              pdfRenderTaskRef.current = page.render(renderContext);
              await pdfRenderTaskRef.current.promise;
            }
          }
        } catch (err) {
          if ((err as any)?.name !== 'RenderingCancelled') {
            console.error("Error loading PDF for canvas:", err);
          }
        } finally {
          pdfRenderTaskRef.current = null;
          isRenderingRef.current = false;
        }
      };
      loadPdf();
    }
    return () => {
      if (pdfRenderTaskRef.current) {
        try { pdfRenderTaskRef.current.cancel(); } catch (e) {}
      }
    };
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

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (interactionMode !== 'place_point' || isSelecting) return;
    e.stopPropagation();
    
    const imgElement = canvasRef.current?.querySelector('img, canvas') as HTMLElement | null;
    const rect = imgElement?.getBoundingClientRect();
    if (!rect) return;
    
    // Calculate position in A4 space (595x842)
    const A4_WIDTH = 595;
    const A4_HEIGHT = 842;
    const scaleX = A4_WIDTH / rect.width;
    const scaleY = A4_HEIGHT / rect.height;
    let x = (e.clientX - rect.left) * scaleX;
    let y = (e.clientY - rect.top) * scaleY;
    
    // Apply grid snapping in A4 space
    x = snapToGridCoord(x);
    y = snapToGridCoord(y);
    
    // Store as relative coordinates (0-1 fraction of cell)
    const rx = x / A4_WIDTH;
    const ry = y / A4_HEIGHT;
    
    // Pass both absolute (for backward compat) and relative
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
    
    const imgElement = canvasRef.current?.querySelector('img, canvas') as HTMLElement | null;
    const rect = imgElement?.getBoundingClientRect();
    const field = fields.find(f => f.id === fieldId);
    if (rect && field && !isCtrlKey) {
      // Use A4 dimensions for drag offset calculation
      const A4_WIDTH = 595;
      const A4_HEIGHT = 842;
      const scaleX = A4_WIDTH / rect.width;
      const scaleY = A4_HEIGHT / rect.height;
      setDragOffset({
        x: (e.clientX - rect.left) * scaleX - field.x,
        y: (e.clientY - rect.top) * scaleY - field.y
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Track mouse position for placement reticle - use same calculation as placement
    if (interactionMode === 'place_point' && canvasRef.current) {
      const imgElement = canvasRef.current?.querySelector('img, canvas') as HTMLElement | null;
      const rect = imgElement?.getBoundingClientRect() || canvasRef.current.getBoundingClientRect();
      
      // Calculate position using A4 dimensions
      const A4_WIDTH = 595;
      const A4_HEIGHT = 842;
      const scaleX = A4_WIDTH / rect.width;
      const scaleY = A4_HEIGHT / rect.height;
      const templateX = (e.clientX - rect.left) * scaleX;
      const templateY = (e.clientY - rect.top) * scaleY;
      
      // Convert back to screen coordinates for the reticle
      setMousePos({
        x: templateX * zoomLevel,
        y: templateY * zoomLevel
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
    
    const imgElement = canvasRef.current?.querySelector('img, canvas') as HTMLElement | null;
    const rect = imgElement?.getBoundingClientRect();
    if (!rect) return;
    
    // Use A4 dimensions for dragging
    const A4_WIDTH = 595;
    const A4_HEIGHT = 842;
    const scaleX = A4_WIDTH / rect.width;
    const scaleY = A4_HEIGHT / rect.height;
    let x = (e.clientX - rect.left) * scaleX - dragOffset.x;
    let y = (e.clientY - rect.top) * scaleY - dragOffset.y;
    
    // Calculate smart guides
    const guides = calculateSmartGuides(x, y, isDragging);
    setSmartGuides(guides);
    
    // Snap to smart guides if close enough
    if (guides.x !== null && Math.abs(x - guides.x) < 5) x = guides.x;
    if (guides.y !== null && Math.abs(y - guides.y) < 5) y = guides.y;
    
    // Apply grid snapping
    x = snapToGridCoord(x);
    y = snapToGridCoord(y);
    
    // Calculate relative coordinates
    const rx = x / A4_WIDTH;
    const ry = y / A4_HEIGHT;
    
    updateField(isDragging, { x, y, rx, ry });
  };

  const handleMouseUp = () => {
    // Complete selection box
    if (isSelecting && selectionBox) {
      const imgElement = canvasRef.current?.querySelector('img, canvas') as HTMLElement | null;
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

  useEffect(() => {
    if (templateUrl && templateFile?.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => {
        // Force A4 dimensions for consistent coordinate system
        setImgSize({ width: 595, height: 842 });
      };
      img.src = templateUrl;
    }
  }, [templateUrl, templateFile]);

  if (!templateUrl) return null;

  const isMultiLeaflet = bulkType === 'receipts' && leafletsPerPage > 1;
  const leafletCols = columns || 2;
  const leafletRows = rows || 3;

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
                {Math.round(minDistance)}px from {nearestField.label}
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
          className={cn("inline-block", interactionMode === 'place_point' && !isSelecting && "cursor-crosshair")}
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="grid gap-1 bg-white p-1" style={{ gridTemplateColumns: `repeat(${leafletCols}, 595px)`, gridTemplateRows: `repeat(${leafletRows}, 842px)` }}>
            {Array.from({ length: leafletsPerPage }, (_, leafletIndex) => (
              <div key={leafletIndex} className="relative" style={{ width: 595, height: 842 }}>
                {templateFile?.type.startsWith('image/') ? (
                  <img src={templateUrl} alt={`Template ${leafletIndex + 1}`} className={cn("w-[595px] h-[842px] object-contain", templateBlackAndWhite && "grayscale")} style={{ filter: templateBlackAndWhite ? 'grayscale(100%) contrast(1.2)' : undefined }} draggable={false} />
                ) : templateFile?.type === 'application/pdf' ? (
                  <canvas className={cn("w-[595px] h-[842px] object-contain", templateBlackAndWhite && "grayscale")} style={{ filter: templateBlackAndWhite ? 'grayscale(100%) contrast(1.2)' : undefined }} />
                ) : null}
                
                {fields.map((field) => {
                  // Calculate position from relative coordinates
                  const A4_WIDTH = 595;
                  const A4_HEIGHT = 842;
                  const fieldX = (field.rx ?? field.x / A4_WIDTH) * A4_WIDTH;
                  const fieldY = (field.ry ?? field.y / A4_HEIGHT) * A4_HEIGHT;
                  
                  const leafletNumber = fromNumber + leafletIndex;
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
    );
  }

  // Single template view
  return (
    <div ref={containerRef} className="relative inline-block">
      <div 
        ref={canvasRef}
        className={cn("relative inline-block", interactionMode === 'place_point' && !isSelecting && "cursor-crosshair", isSelecting && "cursor-crosshair")}
        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
        onClick={handleCanvasClick}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {templateFile?.type.startsWith('image/') ? (
          <img src={templateUrl} alt="Template" className={cn("w-[595px] h-[842px] object-contain", templateBlackAndWhite && "grayscale")} style={{ filter: templateBlackAndWhite ? 'grayscale(100%) contrast(1.2)' : undefined }} draggable={false} />
        ) : templateFile?.type === 'application/pdf' ? (
          <canvas ref={pdfCanvasRef} className={cn("w-[595px] h-[842px] object-contain", templateBlackAndWhite && "grayscale")} style={{ filter: templateBlackAndWhite ? 'grayscale(100%) contrast(1.2)' : undefined }} />
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
                {field.type === 'number' && (() => {
                  // Get index of this number field among all number fields (continuous numbering)
                  const numberFields = fields.filter(f => f.type === 'number');
                  const fieldIndex = numberFields.findIndex(f => f.id === field.id);
                  const actualNumber = fromNumber + fieldIndex;
                  const baseNumber = String(actualNumber).padStart(zeroPadding, '0');
                  const displayText = `${numberingPrefix}${numberingSeparator}${numberingYear}${numberingSeparator}${baseNumber}`;
                  return (
                    <div className="px-2 py-1 flex items-center justify-center text-sm font-bold" style={{ fontFamily: field.fontFamily || 'CrashNumberingSerif', fontWeight: field.bold ? 'bold' : 'normal', color: field.color || '#FF0000', fontSize: field.fontSize }}>
                      {displayText}
                    </div>
                  );
                })()}
                {field.type === 'text' && (
                  <div className="bg-black/70 px-2 py-1 rounded text-white text-xs shadow-lg" style={{ color: field.color, fontSize: field.fontSize, fontFamily: field.fontFamily || 'CrashNumberingSerif', fontWeight: field.bold ? 'bold' : 'normal' }}>
                    {field.value || field.label}
                  </div>
                )}
                {field.type === 'image' && (
                  <div className="w-16 h-16 rounded-lg bg-gray-700 border-2 border-dashed border-blue-400 flex items-center justify-center shadow-lg">
                    <ImageIcon className="w-6 h-6 text-blue-400" />
                  </div>
                )}
              </div>
              
              {/* Coordinate tooltip */}
              {(showCoordinates && (isSelected || hoveredField === field.id)) && (
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

// Helper function to convert image to grayscale
function convertToGrayscale(imageBytes: Uint8Array, mimeType: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([imageBytes.buffer as ArrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Draw image with grayscale filter
      ctx.filter = 'grayscale(100%) contrast(1.2)';
      ctx.drawImage(img, 0, 0);
      
      // Convert back to bytes
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            resolve(new Uint8Array(reader.result as ArrayBuffer));
          };
          reader.readAsArrayBuffer(blob);
        } else {
          reject(new Error('Failed to convert image'));
        }
      }, mimeType);
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
    bulkType, csvData, setCsvData, setExtractedImages,
    fromNumber, toNumber, zeroPadding, numberingPrefix, numberingYear, numberingSeparator,
    setNumbering, setCustomNumbering,
    leafletsPerPage, columns, rows, orientation, setLayout,
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const url = URL.createObjectURL(file);
      setTemplate(file, url);
      setView('studio');
    }
  }, [setTemplate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    multiple: false,
    onDragEnter: () => {},
    onDragOver: () => {},
    onDragLeave: () => {}
  });

  const handleDataUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.zip')) {
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
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const csvText = event.target?.result as string;
        if (csvText) parseAndLoadCsv(csvText);
      };
      reader.readAsText(file);
    }
  };

  const parseAndLoadCsv = (csvText: string) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return;
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};
      headers.forEach((header, index) => row[header] = values[index] || '');
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
    
    const newField: FieldConfig = {
      id: `field-${Date.now()}`,
      type,
      label: type === 'number' ? `P${pointCounter}` : type === 'image' ? 'Photo' : 'Text',
      x,
      y,
      rx,
      ry,
      fontSize: 20,
      fontFamily: 'CrashNumberingSerif',
      color: '#FF0000',
      bold: true,
      align: 'left',
      value: type === 'number' ? `P${pointCounter}` : 'Sample Text',
      dataKey: type === 'number' ? `P${pointCounter}` : undefined,
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
        
        // If Black & White mode is enabled for PDF templates, convert to grayscale image
        if (templateBlackAndWhite) {
          try {
            // Load PDF with pdfjs for rendering
            const loadingTask = pdfjsLib.getDocument(URL.createObjectURL(new Blob([fileBytes], { type: 'application/pdf' })));
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            
            // Render to canvas at scale=1 to preserve original dimensions
            const canvas = document.createElement('canvas');
            const viewport = page.getViewport({ scale: 1 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              const renderContext: any = { canvasContext: ctx, viewport };
              await page.render(renderContext).promise;
              
              // Apply grayscale filter
              ctx.filter = 'grayscale(100%) contrast(1.2)';
              ctx.globalCompositeOperation = 'copy';
              ctx.drawImage(canvas, 0, 0);
              
              // Convert canvas to PNG bytes
              const pngUrl = canvas.toDataURL('image/png');
              const pngBytes = Uint8Array.from(atob(pngUrl.split(',')[1]), c => c.charCodeAt(0));
              
              // Embed as PNG image instead of using PDF source
              templateImage = await outputPdf.embedPng(pngBytes);
              pageWidth = templateImage.width;
              pageHeight = templateImage.height;
              sourcePdf = null; // Clear sourcePdf so we use image path
            }
          } catch (err) {
            console.error('Failed to convert PDF to grayscale:', err);
            // Fall back to original PDF if conversion fails
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
      const staticFields = fields.filter(f => f.type !== 'number');
      const itemsPerPage = numberFields.length;
      const shouldLoopReceipts = bulkType === 'receipts' && itemsPerPage > 0;
      const shouldLoopCertificates = bulkType === 'certificates' && csvData.length > 0;
      const isMultiLeaflet = bulkType === 'receipts' && leafletsPerPage > 1;
      const leafletCols = columns || 2;
      const leafletRows = rows || 3;
      
      // Calculate required pages for receipts mode
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
      
      let currentNumber = fromNumber;
      let csvRowIndex = 0;

      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        // Check if we should stop before creating a new page
        if (shouldLoopReceipts && currentNumber > toNumber) break;
        if (shouldLoopCertificates && csvRowIndex >= csvData.length) break;

        let page: any;
        
        if (isMultiLeaflet) {
          // Multi-leaflet layout: create a larger page with multiple templates
          // Use A4 dimensions for consistent coordinate system
          const A4_WIDTH = 595;
          const A4_HEIGHT = 842;
          const totalWidth = A4_WIDTH * leafletCols;
          const totalHeight = A4_HEIGHT * leafletRows;
          page = outputPdf.addPage([totalWidth, totalHeight]);
          
          // Draw template for each leaflet position (scaled to A4)
          for (let i = 0; i < leafletsPerPage; i++) {
            const col = i % leafletCols;
            const row = Math.floor(i / leafletCols);
            const offsetX = col * A4_WIDTH;
            const offsetY = totalHeight - (row + 1) * A4_HEIGHT; // PDF coords from bottom
            
            if (sourcePdf) {
              // For PDF templates, we need to embed and draw (scaled to A4)
              if (templateImage) {
                page.drawImage(templateImage, { x: offsetX, y: offsetY, width: A4_WIDTH, height: A4_HEIGHT });
              }
            } else if (templateImage) {
              page.drawImage(templateImage, { x: offsetX, y: offsetY, width: A4_WIDTH, height: A4_HEIGHT });
            }
          }
          
          // Draw fields on each leaflet
          for (let i = 0; i < leafletsPerPage; i++) {
            const col = i % leafletCols;
            const row = Math.floor(i / leafletCols);
            const offsetX = col * A4_WIDTH;
            const offsetY = totalHeight - (row + 1) * A4_HEIGHT;
            
            // Calculate the number for this leaflet position
            const leafletNumber = fromNumber + i + (pageNum * leafletsPerPage);
            if (leafletNumber > toNumber) continue;
            
            // Draw number fields on this leaflet
            for (const field of numberFields) {
              // Calculate position from relative coordinates
              const fieldX = (field.rx ?? field.x / A4_WIDTH) * A4_WIDTH;
              const fieldY = (field.ry ?? field.y / A4_HEIGHT) * A4_HEIGHT;
              
              // Use same continuous numbering as preview (field index based)
              const fieldIndex = numberFields.findIndex(f => f.id === field.id);
              const actualNumber = fromNumber + fieldIndex;
              
              if (actualNumber > toNumber) continue;
              
              const baseNumber = String(actualNumber).padStart(zeroPadding, '0');
              const text = `${numberingPrefix}${numberingSeparator}${numberingYear}${numberingSeparator}${baseNumber}`;
              const hex = field.color.replace('#', '');
              const r = parseInt(hex.substring(0, 2), 16) / 255;
              const g = parseInt(hex.substring(2, 4), 16) / 255;
              const b = parseInt(hex.substring(4, 6), 16) / 255;
              
              const font = getFont(field);
              const textWidth = font.widthOfTextAtSize(text, field.fontSize);
              
              // Center text on field position (matching preview transform: translate(-50%, -50%))
              const x = fieldX - textWidth / 2 + offsetX;
              const pdfY = offsetY + A4_HEIGHT - fieldY - field.fontSize / 2;
              
              page.drawText(text, {
                x: x,
                y: pdfY,
                size: field.fontSize,
                font: font,
                color: rgb(r, g, b),
              });
            }
            
            // Draw static fields for this leaflet
            for (const field of staticFields) {
              // Calculate position from relative coordinates
              const fieldX = (field.rx ?? field.x / A4_WIDTH) * A4_WIDTH;
              const fieldY = (field.ry ?? field.y / A4_HEIGHT) * A4_HEIGHT;
              
              let text = field.value || '';
              if (shouldLoopCertificates && field.dataKey && csvData[csvRowIndex]) {
                text = csvData[csvRowIndex][field.dataKey] || text;
              }
              if (field.type === 'text') {
                const hex = field.color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16) / 255;
                const g = parseInt(hex.substring(2, 4), 16) / 255;
                const b = parseInt(hex.substring(4, 6), 16) / 255;
                
                const font = getFont(field);
                const textWidth = font.widthOfTextAtSize(text, field.fontSize);
                
                // Center text on field position (matching preview transform: translate(-50%, -50%))
                const x = fieldX - textWidth / 2 + offsetX;
                const pdfY = offsetY + A4_HEIGHT - fieldY - field.fontSize / 2;
                
                page.drawText(text, {
                  x: x,
                  y: pdfY,
                  size: field.fontSize,
                  font: font,
                  color: rgb(r, g, b),
                });
              }
            }
            
            if (shouldLoopCertificates) csvRowIndex++;
          }
          
        } else {
          // Single leaflet per page - use A4 dimensions
          const A4_WIDTH = 595;
          const A4_HEIGHT = 842;
          
          if (sourcePdf) {
            const [copiedPage] = await outputPdf.copyPages(sourcePdf, [0]);
            page = outputPdf.addPage(copiedPage);
          } else {
            page = outputPdf.addPage([A4_WIDTH, A4_HEIGHT]);
            if (templateImage) page.drawImage(templateImage, { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT });
          }
          
          const currentDataRow = shouldLoopCertificates ? csvData[csvRowIndex] : null;

          // Draw number fields
          for (const field of numberFields) {
            // Calculate position from relative coordinates
            const fieldX = (field.rx ?? field.x / A4_WIDTH) * A4_WIDTH;
            const fieldY = (field.ry ?? field.y / A4_HEIGHT) * A4_HEIGHT;
            
            // Use same continuous numbering as preview (field index based)
            const fieldIndex = numberFields.findIndex(f => f.id === field.id);
            const actualNumber = fromNumber + fieldIndex;
            
            if (shouldLoopReceipts && actualNumber > toNumber) break;
            
            const baseNumber = String(actualNumber).padStart(zeroPadding, '0');
            const text = `${numberingPrefix}${numberingSeparator}${numberingYear}${numberingSeparator}${baseNumber}`;
            const hex = field.color.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            
            const font = getFont(field);
            const textWidth = font.widthOfTextAtSize(text, field.fontSize);
            
            // Center text on field position (matching preview transform: translate(-50%, -50%))
            const x = fieldX - textWidth / 2;
            const pdfY = A4_HEIGHT - fieldY - field.fontSize / 2;
            
            page.drawText(text, {
              x: x,
              y: pdfY,
              size: field.fontSize,
              font: font,
              color: rgb(r, g, b),
            });
          }

          // Draw static fields
          for (const field of staticFields) {
            // Calculate position from relative coordinates
            const fieldX = (field.rx ?? field.x / A4_WIDTH) * A4_WIDTH;
            const fieldY = (field.ry ?? field.y / A4_HEIGHT) * A4_HEIGHT;
            
            let text = field.value || '';
            if (shouldLoopCertificates && field.dataKey && currentDataRow) {
              text = currentDataRow[field.dataKey] || text;
            }
            if (field.type === 'text') {
              const hex = field.color.replace('#', '');
              const r = parseInt(hex.substring(0, 2), 16) / 255;
              const g = parseInt(hex.substring(2, 4), 16) / 255;
              const b = parseInt(hex.substring(4, 6), 16) / 255;
              
              const font = getFont(field);
              const textWidth = font.widthOfTextAtSize(text, field.fontSize);
              
              // Center text on field position (matching preview transform: translate(-50%, -50%))
              const x = fieldX - textWidth / 2;
              const pdfY = A4_HEIGHT - fieldY - field.fontSize / 2;
              
              page.drawText(text, {
                x: x,
                y: pdfY,
                size: field.fontSize,
                font: font,
                color: rgb(r, g, b),
              });
            }
          }
          
          if (shouldLoopCertificates) csvRowIndex++;
        }
      }

      const pdfBytes = await outputPdf.save();
      const blob = new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' });
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
      <div className="h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8 font-sans">
        <div className="text-center mb-12">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/20">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Document Generator
          </h1>
          <p className="text-gray-400 text-lg max-w-md">
            Upload your template to start creating bulk PDFs with automatic numbering
          </p>
        </div>

        <div 
          {...getRootProps()} 
          className={cn(
            "w-full max-w-2xl border-3 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300",
            isDragActive ? "border-blue-500 bg-blue-500/10 shadow-2xl shadow-blue-500/20 scale-105" : "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10"
          )}
        >
          <input {...getInputProps()} />
          <div className="w-24 h-24 rounded-3xl bg-white/10 flex items-center justify-center mb-6">
            <FileUp className={cn("w-12 h-12 transition-all", isDragActive ? "text-blue-400 scale-110" : "text-gray-400")} />
          </div>
          <h2 className="text-2xl font-semibold mb-3">{isDragActive ? 'Drop your template here' : 'Upload your template'}</h2>
          <p className="text-gray-400 mb-6">Drag and drop a PDF, PNG, or JPG file, or click to browse</p>
          <div className="flex gap-3">
            <span className="px-4 py-2 rounded-xl bg-white/10 text-sm font-medium">PDF</span>
            <span className="px-4 py-2 rounded-xl bg-white/10 text-sm font-medium">PNG</span>
            <span className="px-4 py-2 rounded-xl bg-white/10 text-sm font-medium">JPG</span>
          </div>
        </div>

        <div className="flex gap-8 mt-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center"><Hash className="w-6 h-6 text-blue-400" /></div>
            <span className="text-sm text-gray-400">Auto Numbering</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center"><Database className="w-6 h-6 text-purple-400" /></div>
            <span className="text-sm text-gray-400">CSV Import</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><Layout className="w-6 h-6 text-emerald-400" /></div>
            <span className="text-sm text-gray-400">Multi-Layout</span>
          </div>
        </div>
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
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center"><FileText className="w-4 h-4 text-blue-400" /></div>
            <span className="text-sm font-medium text-gray-200">Design Studio</span>
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
              {(bulkType === 'certificates' || bulkType === 'idcards') && (
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
                {(bulkType === 'certificates' || bulkType === 'idcards') && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2"><Database className="w-3 h-3 text-blue-400" /> CSV Data</h3>
                    {csvData.length === 0 ? (
                      <div className="relative">
                        <input type="file" accept=".csv,.zip" onChange={handleDataUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-white/5 border border-white/10 border-dashed rounded-lg text-sm">
                          <Upload className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-300">Upload CSV or ZIP</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-400">✓ {csvData.length} records</span>
                        <button onClick={() => setCsvData([], [])} className="text-xs text-red-400">Clear</button>
                      </div>
                    )}
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
      <div className="flex-1 flex flex-col bg-[#2a2a2a]">
        <div className="h-14 bg-[#1a1a1a] border-b border-white/10 flex items-center justify-between px-4">
          <span className="text-sm font-medium text-gray-300">Template Canvas</span>
          <span className="text-xs text-gray-500">{fields.length} fields placed</span>
        </div>
        <div className="flex-1 p-6 overflow-auto flex items-center justify-center">
          <TemplateCanvas
            templateUrl={templateUrl}
            templateFile={templateFile}
            fields={fields}
            selectedFieldId={selectedFieldId}
            setSelectedFieldId={setSelectedFieldId}
            selectedFieldIds={selectedFieldIds}
            toggleFieldSelection={toggleFieldSelection}
            interactionMode={interactionMode}
            setInteractionMode={setInteractionMode}
            onAddField={handleAddField}
            updateField={updateField}
            updateMultipleFields={updateMultipleFields}
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
            bulkType={bulkType}
            snapToGrid={snapToGrid}
            gridSize={gridSize}
            zoomLevel={zoomLevel}
            setZoomLevel={setZoomLevel}
            showCoordinates={showCoordinates}
            showGrid={showGrid}
            canvasDimensions={canvasDimensions}
          />
        </div>
      </div>

      {/* Right Panel - PDF Preview */}
      <div className="w-[400px] flex flex-col bg-[#f5f5f5] border-l border-gray-200">
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
