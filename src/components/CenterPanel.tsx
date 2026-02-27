import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import * as fabric from 'fabric';
import { ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight, Move } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { clsx } from 'clsx';

// Set worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export function CenterPanel() {
  const { templateUrl, templateFile, fields, updateField, setSelectedFieldId, currentPage, setCurrentPage, extractedImages, setCanvasDimensions, templateBlackAndWhite } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Helper function to create image placeholder
  const createImagePlaceholder = (canvas: fabric.Canvas, field: any, isSelectable: boolean) => {
    const rect = new fabric.Rect({
      left: field.x,
      top: field.y,
      width: field.width || 100,
      height: field.height || 120,
      fill: '#f0f0f0',
      stroke: '#ccc',
      strokeWidth: 1,
      id: field.id,
      selectable: isSelectable,
      evented: isSelectable,
    } as any);
    
    const label = new fabric.Text('📷 Photo', {
      left: field.x + (field.width || 100) / 2,
      top: field.y + (field.height || 120) / 2,
      fontSize: 12,
      fontFamily: 'Helvetica',
      fill: '#666',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });
    
    // Group the rect and label
    const group = new fabric.Group([rect, label], {
      left: field.x,
      top: field.y,
      id: field.id,
      selectable: isSelectable,
      evented: isSelectable,
    } as any);
    
    canvas.add(group);
  };

  // Initialize Canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const c = new fabric.Canvas(canvasRef.current, {
      width: 500, // Initial width, will be updated based on template
      height: 700, // Initial height
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });

    setCanvas(c);

    // Event Listeners
    c.on('object:modified', (e) => {
      const obj = e.target;
      if (obj && (obj as any).id) {
        updateField((obj as any).id as string, {
          x: obj.left || 0,
          y: obj.top || 0,
          width: obj.scaleX ? (obj.width || 0) * obj.scaleX : obj.width,
          height: obj.scaleY ? (obj.height || 0) * obj.scaleY : obj.height,
        });
      }
    });

    c.on('selection:created', (e) => {
      if (e.selected && e.selected.length > 0) {
        setSelectedFieldId((e.selected[0] as any).id as string);
      }
    });

    c.on('selection:updated', (e) => {
      if (e.selected && e.selected.length > 0) {
        setSelectedFieldId((e.selected[0] as any).id as string);
      }
    });

    c.on('selection:cleared', () => {
      setSelectedFieldId(null);
    });

    // Handle Mouse Down for Placement
    c.on('mouse:down', (e) => {
      const { interactionMode, pointCounter, addField, bulkType, zeroPadding, fromNumber } = useStore.getState();
      
      // Fabric v6 uses scenePoint instead of pointer
      const pointer = (e as any).scenePoint || (e as any).pointer;

      if (interactionMode === 'place_point' && pointer) {
        const id = `P${pointCounter}`;
        const isReceipt = bulkType === 'receipts';
        
        // Calculate the preview number based on fromNumber and pointCounter
        const previewNumber = fromNumber + (pointCounter - 1);
        
        addField({
          id: Math.random().toString(36).substr(2, 9),
          type: isReceipt ? 'number' : 'text',
          label: id,
          x: pointer.x,
          y: pointer.y,
          width: 100,
          height: 20,
          fontSize: 18,
          fontFamily: 'CrashNumberingSerif',
          color: '#ef4444', // Red-500 for visibility
          bold: true,
          align: 'left',
          value: isReceipt ? String(previewNumber).padStart(zeroPadding, '0') : id,
          dataKey: id,
        });
        
        // Increment counter
        useStore.setState({ pointCounter: pointCounter + 1 });
      }
    });

    // Handle Mouse Wheel Zoom (Zoom to Cursor)
    c.on('mouse:wheel', function(opt) {
      const delta = opt.e.deltaY;
      opt.e.preventDefault();
      opt.e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = opt.e.clientX - rect.left - rect.width / 2;
      const mouseY = opt.e.clientY - rect.top - rect.height / 2;

      const oldZoom = zoomRef.current;
      let newZoom = oldZoom * (0.999 ** delta);
      
      // Clamp zoom
      if (newZoom > 5) newZoom = 5;
      if (newZoom < 0.1) newZoom = 0.1;

      const oldPan = panOffsetRef.current;
      
      // Calculate new pan to keep mouse position stable
      const scaleRatio = newZoom / oldZoom;
      const newPanX = mouseX * (1 - scaleRatio) + oldPan.x * scaleRatio;
      const newPanY = mouseY * (1 - scaleRatio) + oldPan.y * scaleRatio;

      setZoom(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    });

    return () => {
      c.dispose();
    };
  }, []);

  // Render Template and Fields
  useEffect(() => {
    if (!canvas) return;

    const renderCanvas = async () => {
      setError(null);
      canvas.clear();
      canvas.backgroundColor = '#ffffff';

      if (templateUrl && templateFile) {
        try {
          let imageSrc = templateUrl;
          let width = 500;
          let height = 700;

          // Handle PDF files
          if (templateFile.type === 'application/pdf') {
            try {
              const loadingTask = pdfjsLib.getDocument(templateUrl);
              const pdf = await loadingTask.promise;
              const page = await pdf.getPage(1); // Render first page
              
              const viewport = page.getViewport({ scale: 1.5 }); // Higher scale for better quality
              const canvasEl = document.createElement('canvas');
              const context = canvasEl.getContext('2d');
              canvasEl.height = viewport.height;
              canvasEl.width = viewport.width;

              if (context) {
                await page.render({
                  canvasContext: context,
                  viewport: viewport,
                  canvas: canvasEl
                }).promise;
                imageSrc = canvasEl.toDataURL('image/png');
                
                // Update dimensions based on PDF viewport (scaled down to fit 500px width if needed, or keep original ratio)
                // Let's stick to a fixed width of 500 for the canvas UI, but scale height accordingly
                const ratio = viewport.width / viewport.height;
                width = 500;
                height = 500 / ratio;
              }
            } catch (pdfErr) {
              console.error("Error rendering PDF:", pdfErr);
              throw new Error("Failed to render PDF template. Please check if the file is valid.");
            }
          }

          // Load image (either from PDF render or direct URL)
          const imgElement = document.createElement('img');
          imgElement.src = imageSrc;
          
          await new Promise((resolve, reject) => {
            imgElement.onload = resolve;
            imgElement.onerror = (e) => {
              console.error("HTMLImageElement failed to load", e);
              reject(new Error("Failed to load image. The file format might not be supported."));
            };
          });

          const img = new fabric.Image(imgElement);
          
          // Apply black and white filter if enabled
          const { templateBlackAndWhite } = useStore.getState();
          if (templateBlackAndWhite) {
            const filter = new fabric.filters.Grayscale();
            img.filters = [filter];
            img.applyFilters();
          }
          
          // If it wasn't a PDF (so it was a direct image upload), calculate dimensions now
          if (templateFile.type !== 'application/pdf') {
             const ratio = (img.width || 1) / (img.height || 1);
             width = 500;
             height = 500 / ratio;
          }

          const scale = width / (img.width || width);
          
          // Resize canvas to fit image
          canvas.setDimensions({ width: width, height: height });
          setCanvasDimensions({ width, height });
          
          img.set({
            scaleX: scale,
            scaleY: scale,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false,
          });
          canvas.add(img);
          canvas.sendObjectToBack(img);
        } catch (err: any) {
          console.error("Failed to load template image", err);
          setError(err.message || "Failed to load template. Please try another file.");
        }
      } else {
         // Default dimensions if no template
         canvas.setDimensions({ width: 500, height: 700 });
         setCanvasDimensions({ width: 500, height: 700 });
      }

      fields.forEach((field) => {
        const { interactionMode } = useStore.getState();
        const isSelectable = interactionMode !== 'place_point';

        const text = new fabric.IText(field.value || field.label, {
          left: field.x,
          top: field.y,
          fontSize: field.fontSize,
          fontFamily: field.fontFamily,
          fill: field.color,
          fontWeight: field.bold ? 'bold' : 'normal',
          width: field.width,
          height: field.height,
          id: field.id, // Custom property
          selectable: isSelectable,
          evented: isSelectable,
        } as any);

        canvas.add(text);
      });
      
      canvas.renderAll();
    };

    renderCanvas();
  }, [canvas, templateUrl, templateFile, fields.length, templateBlackAndWhite]);

  // Handle Interaction Mode Cursor
  useEffect(() => {
    if (!canvas) return;
    const { interactionMode } = useStore.getState();
    
    if (interactionMode === 'place_point') {
      canvas.defaultCursor = 'crosshair';
      canvas.selection = false; // Disable group selection while placing
      canvas.forEachObject(o => {
        // Only disable selection for fields (objects with an id)
        // Keep template (no id) locked always
        if ((o as any).id) {
          o.selectable = false;
          o.evented = false;
        }
      });
    } else {
      canvas.defaultCursor = 'default';
      canvas.selection = true;
      canvas.forEachObject(o => {
        // Only enable selection for fields
        if ((o as any).id) {
          o.selectable = true;
          o.evented = true;
        }
      });
    }
    canvas.requestRenderAll();
  }, [canvas, useStore((state) => state.interactionMode)]); // Listen to mode changes

  // Render Template and Fields
  useEffect(() => {
    if (!canvas) return;

    const renderCanvas = async () => {
      setError(null); // Clear previous errors
      canvas.clear();
      canvas.backgroundColor = '#ffffff';

      if (templateUrl && templateFile) {
        try {
          let imageSrc = templateUrl;

          // Handle PDF files
          if (templateFile.type === 'application/pdf') {
            try {
              const loadingTask = pdfjsLib.getDocument(templateUrl);
              const pdf = await loadingTask.promise;
              const page = await pdf.getPage(1); // Render first page
              
              const viewport = page.getViewport({ scale: 1.5 }); // Higher scale for better quality
              const canvasEl = document.createElement('canvas');
              const context = canvasEl.getContext('2d');
              canvasEl.height = viewport.height;
              canvasEl.width = viewport.width;

              if (context) {
                await page.render({
                  canvasContext: context,
                  viewport: viewport,
                  canvas: canvasEl
                }).promise;
                imageSrc = canvasEl.toDataURL('image/png');
              }
            } catch (pdfErr) {
              console.error("Error rendering PDF:", pdfErr);
              throw new Error("Failed to render PDF template. Please check if the file is valid.");
            }
          }

          // Load image (either from PDF render or direct URL)
          const imgElement = document.createElement('img');
          imgElement.src = imageSrc;
          
          await new Promise((resolve, reject) => {
            imgElement.onload = resolve;
            imgElement.onerror = (e) => {
              console.error("HTMLImageElement failed to load", e);
              reject(new Error("Failed to load image. The file format might not be supported."));
            };
          });

          const img = new fabric.Image(imgElement);
          const scale = 500 / (img.width || 500);
          const scaledHeight = (img.height || 0) * scale;
          
          // Resize canvas to fit image
          canvas.setDimensions({ width: 500, height: scaledHeight });
          
          img.set({
            scaleX: scale,
            scaleY: scale,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false,
          });
          canvas.add(img);
          canvas.sendObjectToBack(img);
        } catch (err: any) {
          console.error("Failed to load template image", err);
          setError(err.message || "Failed to load template. Please try another file.");
        }
      }

      fields.forEach((field) => {
        const { interactionMode } = useStore.getState();
        const isSelectable = interactionMode !== 'place_point';

        if (field.type === 'image') {
          // Try to get image from extracted images first
          const imagePath = field.value || '';
          const imageKey = imagePath.split(/[\\/]/).pop()?.toLowerCase() || '';
          const imageData = extractedImages[imageKey] || extractedImages[imagePath.toLowerCase()];
          
          if (imageData) {
            // If we have the image data, create an image element
            const blob = new Blob([imageData]);
            const imageUrl = URL.createObjectURL(blob);
            
            const imgElement = document.createElement('img');
            imgElement.src = imageUrl;
            
            imgElement.onload = () => {
              const img = new fabric.Image(imgElement, {
                left: field.x,
                top: field.y,
                width: field.width || 100,
                height: field.height || 120,
                id: field.id,
                selectable: isSelectable,
                evented: isSelectable,
              } as any);
              
              // Scale to fit within the field dimensions
              img.scaleToWidth((field.width || 100));
              
              canvas.add(img);
              canvas.renderAll();
            };
            
            imgElement.onerror = () => {
              // Fallback to placeholder if image fails to load
              createImagePlaceholder(canvas, field, isSelectable);
            };
          } else {
            // Show placeholder if no image data
            createImagePlaceholder(canvas, field, isSelectable);
          }
        } else {
          // For text fields, show the text
          const text = new fabric.IText(field.value || field.label, {
            left: field.x,
            top: field.y,
            fontSize: field.fontSize,
            fontFamily: field.fontFamily,
            fill: field.color,
            fontWeight: field.bold ? 'bold' : 'normal',
            width: field.width,
            height: field.height,
            id: field.id, // Custom property
            selectable: isSelectable,
            evented: isSelectable,
          } as any);

          canvas.add(text);
        }
      });

      canvas.renderAll();
    };

    renderCanvas();
  }, [canvas, templateUrl, templateFile, fields.length]); // Re-render when template or field count changes

  // Update specific field properties without full re-render
  useEffect(() => {
    if (!canvas) return;
    
    // Check if any field's fontSize has changed
    const fontSizeChanged = fields.some(field => {
      const obj = canvas.getObjects().find((o: any) => o.id === field.id) as fabric.IText;
      return obj && obj.fontSize !== field.fontSize;
    });
    
    // If fontSize changed, force full re-render to eliminate ghost text
    if (fontSizeChanged) {
      // Get all objects before clearing
      const allObjects = canvas.getObjects();
      const templateImg = allObjects.find((o: any) => !o.id) as fabric.Image | undefined;
      
      // Remove all objects individually to ensure cleanup
      allObjects.forEach(obj => canvas.remove(obj));
      
      // Force canvas disposal of any cached rendering
      canvas.clear();
      canvas.backgroundColor = '#ffffff';
      
      // Clear the underlying HTML5 canvas context directly
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
      }
      
      // Re-add template image
      if (templateImg) {
        canvas.add(templateImg);
        canvas.sendObjectToBack(templateImg);
      }
      
      // Re-create all field objects fresh with caching disabled
      fields.forEach((field) => {
        const { interactionMode } = useStore.getState();
        const isSelectable = interactionMode !== 'place_point';

        if (field.type === 'image') {
          // For image fields, try to show actual image if available
          const imagePath = field.value || '';
          const imageKey = imagePath.split(/[\\/]/).pop()?.toLowerCase() || '';
          const imageData = extractedImages[imageKey] || extractedImages[imagePath.toLowerCase()];
          
          if (imageData) {
            const blob = new Blob([imageData]);
            const imageUrl = URL.createObjectURL(blob);
            
            const imgElement = document.createElement('img');
            imgElement.src = imageUrl;
            
            imgElement.onload = () => {
              const img = new fabric.Image(imgElement, {
                left: field.x,
                top: field.y,
                width: field.width || 100,
                height: field.height || 120,
                id: field.id,
                selectable: isSelectable,
                evented: isSelectable,
              } as any);
              
              img.scaleToWidth((field.width || 100));
              canvas.add(img);
              canvas.renderAll();
            };
            
            imgElement.onerror = () => {
              createImagePlaceholder(canvas, field, isSelectable);
            };
          } else {
            createImagePlaceholder(canvas, field, isSelectable);
          }
        } else {
          // For text fields
          const text = new fabric.IText(field.value || field.label, {
            left: field.x,
            top: field.y,
            fontSize: field.fontSize,
            fontFamily: field.fontFamily,
            fill: field.color,
            fontWeight: field.bold ? 'bold' : 'normal',
            width: field.width,
            height: field.height,
            id: field.id,
            selectable: isSelectable,
            evented: isSelectable,
            objectCaching: false,
            noScaleCache: true,
          } as any);

          canvas.add(text);
        }
      });
      
      // Force complete canvas re-render
      canvas.calcOffset();
      canvas.renderAll();
      return;
    }
    
    // For other property changes, just update
    fields.forEach(field => {
      const obj = canvas.getObjects().find((o: any) => o.id === field.id) as fabric.IText;
      if (obj) {
        if (obj.left !== field.x) obj.set('left', field.x);
        if (obj.top !== field.y) obj.set('top', field.y);
        if (obj.fontFamily !== field.fontFamily) obj.set('fontFamily', field.fontFamily);
        if (obj.fill !== field.color) obj.set('fill', field.color);
        if ((obj.fontWeight === 'bold') !== field.bold) obj.set('fontWeight', field.bold ? 'bold' : 'normal');
        if (obj.text !== (field.value || field.label)) obj.set('text', field.value || field.label);
        obj.setCoords();
      }
    });
    canvas.requestRenderAll();
  }, [fields, canvas]);

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.1, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.1, 0.5));

  const [isPanning, setIsPanning] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for accessing state in event listeners
  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef(panOffset);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  // Handle Spacebar Panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isPanning) {
        e.preventDefault(); // Prevent scrolling
        setIsPanning(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPanning]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Enable panning with middle mouse button (button 1), when spacebar is held, or when pan mode is active
    if (e.button === 1 || isPanning || (panMode && e.button === 0)) {
      e.preventDefault();
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      if (!isPanning) setIsPanning(true);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Stop panning when middle mouse button is released or when in pan mode
    if (e.button === 1 || (panMode && e.button === 0)) {
      setIsPanning(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && (e.buttons === 1 || e.buttons === 4 || (panMode && e.buttons === 1))) {
      e.preventDefault();
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  return (
    <div className="flex-1 bg-[#111111] flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#111111]">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Design Canvas</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setPanMode(!panMode)}
            className={clsx(
              "p-1.5 rounded transition-colors",
              panMode 
                ? "bg-blue-600 text-white" 
                : "text-gray-400 hover:bg-white/10 hover:text-white"
            )}
            title="Toggle Pan Mode"
          >
            <Move className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/20"></div>
          <button onClick={handleZoomOut} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-xs font-mono text-gray-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"><ZoomIn className="w-4 h-4" /></button>
          <div className="w-px h-4 bg-white/20 mx-2"></div>
          <button className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"><Maximize className="w-4 h-4" /></button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className={clsx(
          "flex-1 overflow-hidden bg-[#0a0a0a] flex items-center justify-center p-8 relative",
          (isPanning || panMode) ? "cursor-grab active:cursor-grabbing" : ""
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {error ? (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-lg max-w-xs text-center text-sm">
            <p className="font-semibold mb-1">Preview Error</p>
            <p>{error}</p>
          </div>
        ) : (
          <div 
            className="bg-white shadow-2xl origin-center"
            style={{ 
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              pointerEvents: isPanning ? 'none' : 'auto' // Disable canvas interaction while panning
            }}
          >
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/10 bg-[#111111] flex items-center justify-end">
        <div className="text-xs text-gray-500">
          {isPanning ? 'Panning Mode (Spacebar held)' : 'Design Mode'}
        </div>
      </div>
    </div>
  );
}
