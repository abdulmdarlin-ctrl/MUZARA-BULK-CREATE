import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import JSZip from 'jszip';
import { useStore, FieldConfig } from '../store';
import { FileUp, FileText, Award, IdCard, Plus, Type, Hash, Image as ImageIcon, MousePointer2, Upload, Database, Layout, Zap, Download, Trash2, Undo2, Redo2, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { clsx } from 'clsx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export function LeftPanel() {
  const { 
    bulkType, setBulkType, setTemplate, templateUrl, addField, interactionMode, setInteractionMode, addCustomFont,
    fromNumber, toNumber, zeroPadding, setNumbering,
    setCsvData, csvHeaders, csvData = [],
    fields = [], selectedFieldId, updateField, removeField,
    leafletsPerPage, columns, rows, orientation, setLayout,
    templateFile, customFonts, setGeneratedPdfUrl,
    extractedImages = {}, setExtractedImages,
    canvasDimensions = { width: 500, height: 700 },
    pointCounter, setPointCounter,
    templateBlackAndWhite, setTemplateBlackAndWhite,
    pagesToGenerate, setPagesToGenerate,
    onMount
  } = useStore();
  
  const { undo, redo, pastStates, futureStates } = useStore.temporal.getState();

  // Run migration on component mount
  useEffect(() => {
    onMount();
  }, [onMount]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const [activeTab, setActiveTab] = useState<'data' | 'typography' | 'layout'>('data');
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedField = fields.find(f => f.id === selectedFieldId);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const url = URL.createObjectURL(file);
      setTemplate(file, url);
    }
  }, [setTemplate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    multiple: false,
    onDragEnter: () => {},
    onDragOver: () => {},
    onDragLeave: () => {}
  });

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fontName = file.name.split('.')[0];
      const fontUrl = URL.createObjectURL(file);
      
      // Load font into browser
      const fontFace = new FontFace(fontName, `url(${fontUrl})`);
      try {
        await fontFace.load();
        document.fonts.add(fontFace);
        addCustomFont({ name: fontName, url: fontUrl, file });
        alert(`Font "${fontName}" loaded successfully!`);
      } catch (err) {
        console.error("Failed to load font", err);
        alert("Failed to load font. Please check the file.");
      }
    }
  };

  const handleAddField = (type: 'text' | 'number' | 'image') => {
    // Ensure we are in select mode so user can interact with new field
    if (interactionMode !== 'select') {
      setInteractionMode('select');
    }
    
    const newField: FieldConfig = {
      id: `field-${Date.now()}`,
      type,
      label: type === 'number' ? `P${pointCounter}` : type === 'image' ? 'Photo' : 'Text',
      x: 50,
      y: 50,
      fontSize: 16,
      fontFamily: 'CrashNumberingSerif',
      color: '#000000',
      bold: false,
      align: 'left',
      value: type === 'number' ? `P${pointCounter}` : 'Sample Text',
      dataKey: type === 'number' ? `P${pointCounter}` : undefined,
      width: type === 'image' ? 100 : undefined,
      height: type === 'image' ? 100 : undefined,
    };
    
    addField(newField);
    if (type === 'number') {
      setPointCounter(pointCounter + 1);
    }
  };

  const handleDataUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check if it's a ZIP file
    if (file.name.endsWith('.zip')) {
      await handleZipUpload(file);
      return;
    }
    
    // Handle regular CSV
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target?.result as string;
      if (!csvText) return;
      parseAndLoadCsv(csvText);
    };
    reader.readAsText(file);
  };
  
  const handleZipUpload = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const images: Record<string, ArrayBuffer> = {};
      let csvContent: string | null = null;
      
      // Find and extract files
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        // Skip directories
        if (zipEntry.dir) continue;
        
        // Find CSV file
        if (path.endsWith('.csv') && !csvContent) {
          csvContent = await zipEntry.async('text');
        }
        
        // Find image files
        if (/\.(jpg|jpeg|png|gif|webp)$/i.test(path)) {
          const fileName = path.split('/').pop()?.toLowerCase() || '';
          const imageData = await zipEntry.async('arraybuffer');
          images[fileName] = imageData;
          images[path.toLowerCase()] = imageData; // Also store with full path
        }
      }
      
      if (!csvContent) {
        alert('No CSV file found in ZIP. Please include a CSV file.');
        return;
      }
      
      // Store extracted images
      setExtractedImages(images);
      
      // Parse CSV
      parseAndLoadCsv(csvContent, images);
      
      alert(`ZIP loaded: ${Object.keys(images).length} images, CSV data extracted`);
    } catch (error) {
      console.error('Error parsing ZIP:', error);
      alert('Failed to parse ZIP file. Please check the file format.');
    }
  };
  
  const parseAndLoadCsv = (csvText: string, images?: Record<string, ArrayBuffer>) => {
    // Parse CSV
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return;
    
    // Parse headers (first row)
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    // Parse data rows
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }
    
    // Store CSV data
    setCsvData(data, headers);
    
    // For certificates, auto-create fields based on CSV headers
    if (bulkType === 'certificates') {
      // Find name column (look for name, fullname, full_name)
      const nameHeader = headers.find(h => 
        h.toLowerCase().includes('name') && !h.toLowerCase().includes('file')
      ) || headers[0];
      
      // Find title/responsibility column
      const titleHeader = headers.find(h => 
        h.toLowerCase().includes('title') || 
        h.toLowerCase().includes('role') || 
        h.toLowerCase().includes('position') ||
        h.toLowerCase().includes('responsibility')
      ) || headers[1];
      
      // Find photo/image column
      const photoHeader = headers.find(h => 
        h.toLowerCase().includes('photo') || 
        h.toLowerCase().includes('image') || 
        h.toLowerCase().includes('picture') ||
        h.toLowerCase().includes('img')
      );
      
      // Clear existing fields first
      fields.forEach(f => removeField(f.id));
      
      // Add name field
      addField({
        id: 'field_name',
        type: 'text',
        label: 'Name',
        x: 250,
        y: 200,
        width: 200,
        height: 30,
        fontSize: 24,
        fontFamily: 'Helvetica',
        color: '#000000',
        bold: true,
        align: 'center',
        value: data[0]?.[nameHeader] || 'Sample Name',
        dataKey: nameHeader
      });
      
      // Add title field if found
      if (titleHeader) {
        addField({
          id: 'field_title',
          type: 'text',
          label: 'Title',
          x: 250,
          y: 240,
          width: 200,
          height: 20,
          fontSize: 16,
          fontFamily: 'Helvetica',
          color: '#333333',
          bold: false,
          align: 'center',
          value: data[0]?.[titleHeader] || 'Sample Title',
          dataKey: titleHeader
        });
      }
      
      // Add photo field if found
      if (photoHeader) {
        addField({
          id: 'field_photo',
          type: 'image',
          label: 'Photo',
          x: 100,
          y: 150,
          width: 100,
          height: 120,
          fontSize: 12,
          fontFamily: 'Helvetica',
          color: '#000000',
          bold: false,
          align: 'left',
          value: data[0]?.[photoHeader] || '',
          dataKey: photoHeader
        });
      }
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Helper function to convert image to grayscale
      const convertToGrayscale = async (imageBytes: ArrayBuffer, mimeType: string): Promise<Uint8Array> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          const blob = new Blob([imageBytes], { type: mimeType });
          const url = URL.createObjectURL(blob);
          
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            
            // Draw image
            ctx.drawImage(img, 0, 0);
            
            // Get image data and convert to grayscale
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            for (let i = 0; i < data.length; i += 4) {
              const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
              data[i] = gray;     // Red
              data[i + 1] = gray; // Green
              data[i + 2] = gray; // Blue
              // Alpha (data[i + 3]) remains unchanged
            }
            
            ctx.putImageData(imageData, 0, 0);
            
            // Convert to blob
            canvas.toBlob((blob) => {
              if (blob) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const arrayBuffer = reader.result as ArrayBuffer;
                  resolve(new Uint8Array(arrayBuffer));
                };
                reader.readAsArrayBuffer(blob);
              } else {
                reject(new Error('Failed to create blob'));
              }
            }, mimeType);
            
            URL.revokeObjectURL(url);
          };
          
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
          };
          
          img.src = url;
        });
      };

      // 1. Prepare the output PDF
      const outputPdf = await PDFDocument.create();
      
      // 2. Prepare the template (Image or PDF Page)
      let templateImage: any = null;
      let sourcePdf: PDFDocument | null = null;
      
      // Default A4 dimensions
      let pageWidth = 595.28;
      let pageHeight = 841.89;

      if (templateFile) {
        const fileBytes = await templateFile.arrayBuffer();
        
        if (templateFile.type === 'application/pdf') {
           sourcePdf = await PDFDocument.load(fileBytes);
           const firstPage = sourcePdf.getPages()[0];
           const { width, height } = firstPage.getSize();
           pageWidth = width;
           pageHeight = height;
           
           // Convert PDF to image for drawing on pages
           // We'll use the PDF.js library to render it to a canvas first
           try {
             const pdfjsLib = await import('pdfjs-dist');
             pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
             
             const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
             const pdfDocument = await loadingTask.promise;
             const pdfPage = await pdfDocument.getPage(1);
             
             const viewport = pdfPage.getViewport({ scale: 2.0 });
             const canvas = document.createElement('canvas');
             canvas.width = viewport.width;
             canvas.height = viewport.height;
             const context = canvas.getContext('2d')!;
             
             await pdfPage.render({ 
              canvasContext: context, 
              viewport,
              canvas: canvas as any
            }).promise;
             
             // Convert canvas to PNG bytes
             const pngData = canvas.toDataURL('image/png').split(',')[1];
             let pngBytes = Uint8Array.from(atob(pngData), c => c.charCodeAt(0));
             
             // Apply grayscale if enabled for receipts
             if (templateBlackAndWhite && bulkType === 'receipts') {
               try {
                 const grayscaleResult = await convertToGrayscale(pngBytes.buffer.slice(0), 'image/png');
                 pngBytes = new Uint8Array(grayscaleResult);
               } catch (e) {
                 console.error('Failed to convert PDF template to grayscale:', e);
               }
             }
             
             templateImage = await outputPdf.embedPng(pngBytes);
             
             // Update dimensions to match the rendered image
             pageWidth = viewport.width / 2; // Original size (not scaled)
             pageHeight = viewport.height / 2;
           } catch (e) {
             console.error('Failed to convert PDF to image:', e);
           }
        } else if (templateFile.type.startsWith('image/')) {
           let imageBytes: Uint8Array;
           
           // Apply grayscale if enabled for receipts
           if (templateBlackAndWhite && bulkType === 'receipts') {
             try {
               const mimeType = templateFile.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
               const grayscaleBytes = await convertToGrayscale(fileBytes, mimeType);
               imageBytes = grayscaleBytes;
             } catch (e) {
               console.error('Failed to convert image to grayscale:', e);
               imageBytes = new Uint8Array(fileBytes);
             }
           } else {
             imageBytes = new Uint8Array(fileBytes);
           }
           
           if (templateFile.type === 'image/jpeg') {
             templateImage = await outputPdf.embedJpg(imageBytes);
           } else {
             templateImage = await outputPdf.embedPng(imageBytes);
           }
           // Use image dimensions for the page to ensure accurate mapping
           pageWidth = templateImage.width;
           pageHeight = templateImage.height;
        }
      }

      // 3. Embed Fonts
      const helvetica = await outputPdf.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await outputPdf.embedFont(StandardFonts.HelveticaBold);
      
      // Register fontkit for custom font embedding
      outputPdf.registerFontkit(fontkit);
      
      // Load and embed default CrashNumberingSerif font from public directory
      let defaultFont = helvetica;
      let defaultFontBold = helveticaBold;
      try {
        console.log('Attempting to load CrashNumberingSerif font...');
        const fontResponse = await fetch('/CrashNumberingSerif.otf');
        if (!fontResponse.ok) {
          throw new Error(`HTTP error! status: ${fontResponse.status}`);
        }
        const fontBytes = await fontResponse.arrayBuffer();
        console.log('Font loaded, bytes length:', fontBytes.byteLength);
        defaultFont = await outputPdf.embedFont(fontBytes);
        defaultFontBold = defaultFont;
        console.log('Default font CrashNumberingSerif embedded successfully');
      } catch (e) {
        console.error('Failed to embed default font, falling back to Helvetica:', e);
      }
      
      // Embed custom fonts
      const embeddedFonts: Record<string, any> = {
        'CrashNumberingSerif': defaultFont,
      };
      for (const font of customFonts) {
         try {
            const fontBytes = await font.file.arrayBuffer();
            embeddedFonts[font.name] = await outputPdf.embedFont(fontBytes);
         } catch (e) {
            console.error(`Failed to embed font ${font.name}`, e);
         }
      }

      // 4. Identify Fields
      // Keep fields in their original order to match canvas positions
      const numberFields = fields.filter(f => f.type === 'number');
      const staticFields = fields.filter(f => f.type !== 'number');
      
      // Helper function to draw placeholder for missing images
      const drawImagePlaceholder = (page: any, position: { x: number, y: number }, field: any, scaleX: number, scaleY: number, pageHeight: number, helvetica: any, isMultiLeaflet: boolean = false) => {
        let rectX = field.x * scaleX;
        let rectY = pageHeight - (field.y * scaleY) - ((field.height || 100) * scaleY);
        let textX = field.x * scaleX + ((field.width || 100) * scaleX) / 2 - 15;
        let textY = pageHeight - (field.y * scaleY) - ((field.height || 100) * scaleY) / 2;
        
        // For multi-leaflet, apply position offset
        if (isMultiLeaflet) {
          rectX += position.x;
          rectY -= position.y;
          textX += position.x;
          textY -= position.y;
        }
        
        page.drawRectangle({
          x: rectX,
          y: rectY,
          width: (field.width || 100) * scaleX,
          height: (field.height || 100) * scaleY,
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 1,
          color: rgb(0.95, 0.95, 0.95),
        });
        
        page.drawText('[Photo]', {
          x: textX,
          y: textY,
          size: 10 * scaleY,
          font: helvetica,
          color: rgb(0.5, 0.5, 0.5),
        });
      };
      
      const itemsPerPage = numberFields.length;
      
      // Calculate layout for multiple leaflets per page
      const isMultiLeaflet = leafletsPerPage > 1;
      const a4Width = 595.28;
      const a4Height = 841.89;
      const padding = 10; // Padding between leaflets
      const bindingMargin = 30; // Binding space on left side for A4 book format
      
      let leafletWidth = pageWidth;
      let leafletHeight = pageHeight;
      let leafletScale = 1;
      let cols = 1;
      let rows = 1;
      let positions: { x: number, y: number }[] = [];
      
      if (isMultiLeaflet) {
        // Force A4 page size for multi-leaflet layout
        pageWidth = orientation === 'portrait' ? a4Width : a4Height;
        pageHeight = orientation === 'portrait' ? a4Height : a4Width;
        
        // Calculate grid dimensions using rows-based logic
        if (leafletsPerPage === 2) {
          cols = 2;
          rows = 1;
        } else if (leafletsPerPage === 4) {
          cols = 2;
          rows = 2;
        } else if (leafletsPerPage === 6) {
          cols = 3;
          rows = 2;
        } else {
          // For custom numbers, calculate optimal grid
          // Try to create a balanced grid (more columns than rows for better layout)
          const sqrt = Math.sqrt(leafletsPerPage);
          cols = Math.ceil(sqrt);
          rows = Math.ceil(leafletsPerPage / cols);
          
          // Ensure we don't exceed reasonable limits
          cols = Math.min(cols, 5);
          rows = Math.min(rows, 4);
        }
        
        // Calculate available space per leaflet (accounting for binding margin on left)
        const availableWidth = (pageWidth - bindingMargin - padding * (cols + 1)) / cols;
        const availableHeight = (pageHeight - padding * (rows + 1)) / rows;
        
        // Calculate scale to fit leaflet into available space
        const scaleX = availableWidth / leafletWidth;
        const scaleY = availableHeight / leafletHeight;
        leafletScale = Math.min(scaleX, scaleY);
        
        // Calculate scaled leaflet dimensions
        const scaledWidth = leafletWidth * leafletScale;
        const scaledHeight = leafletHeight * leafletScale;
        
        // Calculate positions for each leaflet (centered in grid cells)
        // Numbering goes RIGHT TO LEFT: so we store positions in reverse column order
        let leafletsGenerated = 0;
        for (let row = 0; row < rows && leafletsGenerated < leafletsPerPage; row++) {
          for (let col = cols - 1; col >= 0 && leafletsGenerated < leafletsPerPage; col--) {
            const x = bindingMargin + padding + col * (scaledWidth + padding) + (availableWidth - scaledWidth) / 2;
            const y = padding + row * (scaledHeight + padding) + (availableHeight - scaledHeight) / 2;
            positions.push({ x, y });
            leafletsGenerated++;
          }
        }
      } else {
        positions.push({ x: 0, y: 0 });
      }
      
      // 5. Generation Loop
      let currentNumber = fromNumber;
      const shouldLoopReceipts = bulkType === 'receipts' && itemsPerPage > 0;
      const shouldLoopCertificates = bulkType === 'certificates' && csvData.length > 0;
      let leafletsDrawn = 0;
      let csvRowIndex = 0;
      
      // Helper function to draw a leaflet at a specific position
      const drawLeaflet = async (page: any, position: { x: number, y: number }, scale: number, leafletIndex: number, dataRowIndex: number) => {
        // Use exact canvas dimensions from store for accurate coordinate mapping
        const canvasWidth = canvasDimensions.width;
        const canvasHeight = canvasDimensions.height;
        
        // For single-leaflet (certificates/receipts with 1 per page): scale from canvas to PDF page
        // For multi-leaflet (receipts with multiple per page): use scaling to fit leaflet into grid cell
        let scaleX: number, scaleY: number;
        
        if (isMultiLeaflet && leafletsPerPage > 1) {
          // Multi-leaflet: scale down to fit in grid cell
          scaleX = (leafletWidth / canvasWidth) * scale;
          scaleY = (leafletHeight / canvasHeight) * scale;
        } else {
          // Single-leaflet: scale from canvas to full PDF page
          scaleX = pageWidth / canvasWidth;
          scaleY = pageHeight / canvasHeight;
        }
        
        console.log('Coordinate mapping debug:', {
          isMultiLeaflet,
          canvasWidth,
          canvasHeight,
          pageWidth,
          pageHeight,
          scaleX,
          scaleY,
          bulkType
        });
        
        // Get current data row for certificates
        const currentDataRow = shouldLoopCertificates ? csvData[dataRowIndex] : null;
        
        // Draw Number Fields
        // For receipts: each field (P1, P2, P3...) gets a unique sequential number
        // P1 = currentNumber, P2 = currentNumber + 1, P3 = currentNumber + 2, etc.
        for (let fieldIndex = 0; fieldIndex < numberFields.length; fieldIndex++) {
          const field = numberFields[fieldIndex];
          let text = field.value || '';
          // For receipts, use the sequential number based on position
          // For certificates, use sequential numbering 001-100
          if (shouldLoopReceipts) {
            // Each point field gets a unique number: P1=currentNumber, P2=currentNumber+1, etc.
            text = String(currentNumber + fieldIndex).padStart(zeroPadding, '0');
          } else if (shouldLoopCertificates) {
            // For certificates, use sequential numbering from fromNumber
            text = String(fromNumber + dataRowIndex).padStart(zeroPadding, '0');
          }
          
          // Get Font
          let font = defaultFont;
          if (field.fontFamily && embeddedFonts[field.fontFamily]) {
            font = embeddedFonts[field.fontFamily];
          } else if (field.fontFamily === 'Helvetica' || field.fontFamily === 'Times New Roman' || field.fontFamily === 'Courier New') {
            font = field.bold ? helveticaBold : helvetica;
          }
          
          // Color
          const hex = field.color.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          
          const textWidth = font.widthOfTextAtSize(text, field.fontSize * scaleX);
          let x = field.x * scaleX;
          
          if (field.align === 'center') {
            x += (field.width || 0) * scaleX / 2 - textWidth / 2;
          } else if (field.align === 'right') {
            x += (field.width || 0) * scaleX - textWidth;
          }
          
          // Calculate Y: PDF Y is from bottom, Canvas Y is from top
          // PDF draws from baseline, canvas Y is top of text - subtract to move up slightly
          const baselineOffset = field.fontSize * scaleY * 0.25; // Adjust to match canvas position
          let y = pageHeight - (field.y * scaleY) - baselineOffset;
          
          // For multi-leaflet, apply position offset
          if (isMultiLeaflet) {
            x += position.x;
            y -= position.y;
          }
          
          console.log(`Field ${field.dataKey}: canvas(${field.x}, ${field.y}) -> pdf(${x}, ${y})`);
          
          page.drawText(text, {
            x: x,
            y: y,
            size: field.fontSize * scaleX,
            font: font,
            color: rgb(r, g, b),
          });
        }
        
        // Draw Static Fields (Text and Image)
        for (const field of staticFields) {
          // For certificates, get value from current CSV row
          let text = field.value || '';
          if (shouldLoopCertificates && field.dataKey && currentDataRow) {
            text = currentDataRow[field.dataKey] || text;
          } else if (!shouldLoopCertificates && field.dataKey && csvData.length > 0) {
            // Fallback to first row for non-looping
            text = csvData[0][field.dataKey] || text;
          }
          
          if (field.type === 'image' && text) {
            // Try to get image from extracted images
            const imageKey = text.split(/[\\/]/).pop()?.toLowerCase() || '';
            const imageData = extractedImages[imageKey] || extractedImages[text.toLowerCase()];
            
            console.log('Image field debug:', {
              fieldId: field.id,
              fieldX: field.x,
              fieldY: field.y,
              fieldWidth: field.width,
              fieldHeight: field.height,
              scaleX,
              scaleY,
              position,
              calculatedX: position.x + (field.x * scaleX),
              calculatedY: pageHeight - position.y - (field.y * scaleY),
              imageKey,
              hasImageData: !!imageData
            });
            
            if (imageData) {
              try {
                // Embed the image into the PDF
                const imgType = imageKey.endsWith('.png') ? 'png' : 'jpg';
                let embeddedImage;
                
                if (imgType === 'png') {
                  embeddedImage = await outputPdf.embedPng(imageData);
                } else {
                  embeddedImage = await outputPdf.embedJpg(imageData);
                }
                
                // Calculate dimensions maintaining aspect ratio
                const imgWidth = (field.width || 100) * scaleX;
                const imgHeight = (field.height || 120) * scaleY;
                
                let imgX = field.x * scaleX;
                let imgY = pageHeight - (field.y * scaleY) - imgHeight;
                
                // For multi-leaflet, apply position offset
                if (isMultiLeaflet) {
                  imgX += position.x;
                  imgY -= position.y;
                }
                
                page.drawImage(embeddedImage, {
                  x: imgX,
                  y: imgY,
                  width: imgWidth,
                  height: imgHeight,
                });
              } catch (imgError) {
                console.error('Error embedding image:', imgError);
                // Fallback to placeholder
                drawImagePlaceholder(page, position, field, scaleX, scaleY, pageHeight, helvetica, isMultiLeaflet);
              }
            } else {
              // Draw placeholder if image not found
              drawImagePlaceholder(page, position, field, scaleX, scaleY, pageHeight, helvetica, isMultiLeaflet);
            }
            
            continue;
          }
          
          let font = defaultFont;
          if (field.fontFamily && embeddedFonts[field.fontFamily]) {
            font = embeddedFonts[field.fontFamily];
          } else if (field.fontFamily === 'Helvetica' || field.fontFamily === 'Times New Roman' || field.fontFamily === 'Courier New') {
            font = field.bold ? helveticaBold : helvetica;
          }
          
          const hex = field.color.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          
          const textWidth = font.widthOfTextAtSize(text, field.fontSize * scaleX);
          let x = position.x + (field.x * scaleX);
          
          if (field.align === 'center') {
            x += (field.width || 0) * scaleX / 2 - textWidth / 2;
          } else if (field.align === 'right') {
            x += (field.width || 0) * scaleX - textWidth;
          }
          
          // Calculate Y: PDF Y is from bottom, Canvas Y is from top
          // PDF draws from baseline, canvas Y is top of text - subtract to move up slightly
          const baselineOffset = field.fontSize * scaleY * 0.25;
          const y = pageHeight - position.y - (field.y * scaleY) - baselineOffset;
          
          page.drawText(text, {
            x: x,
            y: y,
            size: field.fontSize * scaleX,
            font: font,
            color: rgb(r, g, b),
          });
        }
      };
      
      do {
        // Create a new page (only when starting a new set of leaflets)
        if (leafletsDrawn % leafletsPerPage === 0) {
          let page;
          if (sourcePdf && !isMultiLeaflet) {
            const [copiedPage] = await outputPdf.copyPages(sourcePdf, [0]);
            page = outputPdf.addPage(copiedPage);
          } else {
            page = outputPdf.addPage([pageWidth, pageHeight]);
          }
          
          // Draw leaflets at calculated positions
          const startIdx = leafletsDrawn;
          for (let i = 0; i < leafletsPerPage; i++) {
            // Check if we should continue
            if (shouldLoopReceipts && currentNumber > toNumber) break;
            if (shouldLoopCertificates && csvRowIndex >= csvData.length) break;
            if (!shouldLoopReceipts && !shouldLoopCertificates && i > 0) break;
            // Check pagesToGenerate limit
            if (pagesToGenerate && leafletsDrawn >= pagesToGenerate * leafletsPerPage) break;
            
            const positionIndex = i % positions.length;
            const position = positions[positionIndex];
            
            // Draw template image at this position if available
            if (templateImage) {
              // For multi-leaflet, apply position offset
              // For single leaflet, position is (0, 0)
              const drawX = leafletsPerPage > 1 ? position.x : 0;
              const drawY = leafletsPerPage > 1 
                ? pageHeight - position.y - (leafletHeight * leafletScale)
                : pageHeight - (leafletHeight * leafletScale);
              
              page.drawImage(templateImage, {
                x: drawX,
                y: drawY,
                width: leafletWidth * leafletScale,
                height: leafletHeight * leafletScale,
              });
            }
            
            await drawLeaflet(page, position, leafletScale, leafletsDrawn, csvRowIndex);
            
            if (shouldLoopReceipts) {
              // Increment by the number of fields per leaflet (e.g., 6 fields = +6)
              currentNumber += numberFields.length;
            }
            if (shouldLoopCertificates) {
              csvRowIndex++;
            }
            
            leafletsDrawn++;
          }
        }
        
        // Break if we are done with numbers (receipts)
        if (shouldLoopReceipts && currentNumber > toNumber) break;
        // Break if we are done with CSV rows (certificates)
        if (shouldLoopCertificates && csvRowIndex >= csvData.length) break;
        // Break if not looping (single page)
        if (!shouldLoopReceipts && !shouldLoopCertificates) break;
        // Break if pagesToGenerate limit reached
        if (pagesToGenerate && leafletsDrawn >= pagesToGenerate * leafletsPerPage) break;
        
      } while ((shouldLoopReceipts && currentNumber <= toNumber) || (shouldLoopCertificates && csvRowIndex < csvData.length));

      const pdfBytes = await outputPdf.save();
      const blob = new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setGeneratedPdfUrl(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Check console for details.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full md:w-96 bg-[#1a1a1a] flex flex-col h-full overflow-hidden shrink-0">
      <div className="p-6 space-y-8 overflow-y-auto scrollbar-hide">
        {/* Bulk Type Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bulk Type</h2>
            <div className="flex gap-1">
              <button 
                onClick={() => undo()} 
                className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => redo()} 
                className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={() => setBulkType('receipts')}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                bulkType === 'receipts'
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                  : "bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <FileText className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Receipt Books</div>
                <div className="text-[10px] opacity-70">Numbered receipts with sequential numbering</div>
              </div>
            </button>
            <button 
              onClick={() => setBulkType('certificates')}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                bulkType === 'certificates'
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                  : "bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Award className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Certificates</div>
                <div className="text-[10px] opacity-70">Certificates with photo placeholders</div>
              </div>
            </button>
            <button 
              onClick={() => setBulkType('idcards')}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                bulkType === 'idcards'
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                  : "bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <IdCard className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">ID Cards</div>
                <div className="text-[10px] opacity-70">ID cards with photo placeholders</div>
              </div>
            </button>
          </div>
        </div>

        {/* Template Upload */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Template Upload</h2>
          <div 
            {...getRootProps()} 
            className={clsx(
              "border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors",
              isDragActive ? "border-blue-500 bg-blue-500/10" : "border-white/20 hover:border-white/40 hover:bg-white/5"
            )}
          >
            <input {...getInputProps()} />
            {templateUrl ? (
              <div className="space-y-2">
                <div className="w-full h-32 bg-black/50 rounded flex flex-col items-center justify-center overflow-hidden p-4">
                  <FileText className="w-8 h-8 text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-gray-200 text-center break-all line-clamp-2">
                    {templateFile?.name || 'Uploaded File'}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase mt-1">
                    {templateFile?.name.split('.').pop() || 'FILE'}
                  </p>
                </div>
                <p className="text-xs text-gray-400">Click or drag to replace</p>
              </div>
            ) : (
              <div className="space-y-2 flex flex-col items-center">
                <FileUp className="w-8 h-8 text-gray-400" />
                <p className="text-sm font-medium">Upload PDF, PNG, JPG</p>
                <p className="text-xs text-gray-500">Drag & drop or click</p>
              </div>
            )}
          </div>
        </div>

        {/* Template Display Options */}
        {templateUrl && bulkType === 'receipts' && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Template Display</h2>
            <button
              onClick={() => setTemplateBlackAndWhite(!templateBlackAndWhite)}
              className={clsx(
                "w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm transition-colors",
                templateBlackAndWhite
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "bg-white/5 hover:bg-white/10 text-gray-300"
              )}
            >
              <ImageIcon className="w-4 h-4" />
              {templateBlackAndWhite ? 'Black & White: ON' : 'Black & White: OFF'}
            </button>
            <p className="text-xs text-gray-500">
              Toggle to convert template to black & white. Mapping colors remain unchanged.
            </p>
          </div>
        )}

        {/* Page Generation Control */}
        {templateUrl && bulkType === 'receipts' && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pages to Generate</h2>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                placeholder="All"
                value={pagesToGenerate || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setPagesToGenerate(isNaN(val) || val < 1 ? null : val);
                }}
                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none"
              />
              <button
                onClick={() => setPagesToGenerate(null)}
                className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-gray-300"
              >
                All
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Leave empty to generate all pages. Set a number to limit output.
            </p>
          </div>
        )}

        {/* Placement Mode */}
        {templateUrl && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Add Elements</h2>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setInteractionMode(interactionMode === 'place_point' ? 'select' : 'place_point')}
                className={clsx(
                  "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm transition-colors col-span-2",
                  interactionMode === 'place_point' 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                    : "bg-white/5 hover:bg-white/10 text-gray-300"
                )}
              >
                <MousePointer2 className="w-4 h-4" /> 
                {interactionMode === 'place_point' ? 'Click on Canvas to Place Point' : 'Place Merge Point (P1, P2...)'}
              </button>
              
              {(bulkType === 'certificates' || bulkType === 'idcards') && (
                <button 
                  onClick={() => handleAddField('image')}
                  className="flex items-center justify-center gap-2 py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors"
                >
                  <ImageIcon className="w-4 h-4" /> Photo
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Use "Place Merge Point" to define variable data positions (P1, P2, etc.) for bulk merging.
            </p>
          </div>
        )}

        {/* Settings Tabs */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          <div className="flex gap-2 border-b border-white/10 pb-2 overflow-x-auto">
            <TabButton active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={<Database className="w-3 h-3" />} label="Data" />
            <TabButton active={activeTab === 'typography'} onClick={() => setActiveTab('typography')} icon={<Type className="w-3 h-3" />} label="Type" />
            {bulkType === 'receipts' && (
              <TabButton active={activeTab === 'layout'} onClick={() => setActiveTab('layout')} icon={<Layout className="w-3 h-3" />} label="Layout" />
            )}
          </div>

          {activeTab === 'data' && (
            <div className="space-y-4">
              {bulkType === 'receipts' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                    <Hash className="w-3 h-3 text-blue-400" /> Numbering
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">From</label>
                      <input 
                        type="number" 
                        value={isNaN(fromNumber) ? '' : fromNumber} 
                        onChange={(e) => setNumbering(parseInt(e.target.value) || 0, toNumber, zeroPadding)}
                        className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">To</label>
                      <input 
                        type="number" 
                        value={isNaN(toNumber) ? '' : toNumber} 
                        onChange={(e) => setNumbering(fromNumber, parseInt(e.target.value) || 0, zeroPadding)}
                        className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Padding</label>
                      <input 
                        type="number" 
                        value={isNaN(zeroPadding) ? '' : zeroPadding} 
                        onChange={(e) => setNumbering(fromNumber, toNumber, parseInt(e.target.value) || 0)}
                        className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {(bulkType === 'certificates' || bulkType === 'idcards') && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                    <Database className="w-3 h-3 text-blue-400" /> CSV Data
                  </h3>
                  
                  {csvData.length === 0 ? (
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-2">
                        Upload CSV or ZIP with columns: name, title, photo
                      </label>
                      <div className="relative">
                        <input
                          type="file"
                          accept=".csv,.zip,text/csv,application/zip"
                          onChange={handleDataUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-lg text-sm transition-colors">
                          <Upload className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-300">Click to upload CSV or ZIP</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-400">✓ {csvData.length} records loaded</span>
                        <button 
                          onClick={() => { setCsvData([], []); setExtractedImages({}); }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Clear
                        </button>
                      </div>
                      
                      {/* Field Mapping */}
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <h4 className="text-[10px] font-medium text-gray-400">Field Mapping</h4>
                        {fields.filter(f => f.type === 'text' || f.type === 'image').map(field => (
                          <div key={field.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-300">{field.label}</span>
                            <span className="text-emerald-400 text-[10px]">→ {field.dataKey}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'typography' && selectedField && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                <Type className="w-3 h-3 text-blue-400" /> Typography
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Font</label>
                  <select 
                    value={selectedField.fontFamily} 
                    onChange={(e) => updateField(selectedField.id, { fontFamily: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none"
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
                
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Alignment</label>
                  <div className="flex bg-black/50 border border-white/10 rounded overflow-hidden">
                    <button
                      onClick={() => updateField(selectedField.id, { align: 'left' })}
                      className={clsx(
                        "flex-1 py-1 flex items-center justify-center hover:bg-white/5 transition-colors",
                        selectedField.align === 'left' ? "bg-white/10 text-white" : "text-gray-400"
                      )}
                      title="Align Left"
                    >
                      <AlignLeft className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => updateField(selectedField.id, { align: 'center' })}
                      className={clsx(
                        "flex-1 py-1 flex items-center justify-center hover:bg-white/5 transition-colors border-l border-r border-white/5",
                        selectedField.align === 'center' ? "bg-white/10 text-white" : "text-gray-400"
                      )}
                      title="Align Center"
                    >
                      <AlignCenter className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => updateField(selectedField.id, { align: 'right' })}
                      className={clsx(
                        "flex-1 py-1 flex items-center justify-center hover:bg-white/5 transition-colors",
                        selectedField.align === 'right' ? "bg-white/10 text-white" : "text-gray-400"
                      )}
                      title="Align Right"
                    >
                      <AlignRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Size</label>
                    <input 
                      type="number" 
                      value={isNaN(selectedField.fontSize) ? '' : selectedField.fontSize} 
                      onChange={(e) => updateField(selectedField.id, { fontSize: parseInt(e.target.value) || 0 })}
                      className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Color</label>
                    <input 
                      type="color" 
                      value={selectedField.color} 
                      onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                      className="w-full h-6 bg-black/50 border border-white/10 rounded cursor-pointer"
                    />
                  </div>
                </div>
                <button
                  onClick={() => updateField(selectedField.id, { bold: !selectedField.bold })}
                  className={clsx(
                    "w-full py-1 rounded text-xs font-medium transition-colors border",
                    selectedField.bold 
                      ? "bg-blue-600 border-blue-500 text-white" 
                      : "bg-black/50 border-white/10 text-gray-400 hover:text-white"
                  )}
                >
                  Bold
                </button>
                <button
                  onClick={() => removeField(selectedField.id)}
                  className="w-full py-1 rounded text-xs font-medium transition-colors border bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300 mt-2 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3 h-3" /> Remove Field
                </button>
              </div>
            </div>
          )}

          {activeTab === 'layout' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                <Layout className="w-3 h-3 text-blue-400" /> Layout
              </h3>
              
              {/* Leaflets Per Page */}
              <div className="space-y-2">
                <label className="block text-[10px] text-gray-500">Leaflets Per Page (A4)</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 4, 6].map((num) => (
                    <button
                      key={num}
                      onClick={() => setLayout(num, columns, rows, orientation)}
                      className={clsx(
                        "py-2 px-1 rounded-lg text-xs font-medium transition-all",
                        leafletsPerPage === num
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                          : "bg-white/5 text-gray-300 hover:bg-white/10"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Custom"
                    value={![1, 2, 4, 6].includes(leafletsPerPage) ? leafletsPerPage : ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= 20) {
                        setLayout(val, columns, rows, orientation);
                      }
                    }}
                    className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                  />
                  <button
                    onClick={() => setLayout(1, columns, rows, orientation)}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-gray-300"
                  >
                    Reset
                  </button>
                </div>
                <p className="text-[10px] text-gray-500">
                  {leafletsPerPage === 1 && "Single leaflet per A4 page"}
                  {leafletsPerPage === 2 && "2 leaflets in 2x1 grid"}
                  {leafletsPerPage === 4 && "4 leaflets in 2x2 grid"}
                  {leafletsPerPage === 6 && "6 leaflets in 3x2 grid"}
                  {![1, 2, 4, 6].includes(leafletsPerPage) && `${leafletsPerPage} custom leaflets per page`}
                </p>
              </div>
              
              {/* Orientation */}
              <div className="space-y-2">
                <label className="block text-[10px] text-gray-500">Orientation</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLayout(leafletsPerPage, columns, rows, 'portrait')}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs transition-all",
                      orientation === 'portrait'
                        ? "bg-blue-600 text-white"
                        : "bg-white/5 text-gray-300 hover:bg-white/10"
                    )}
                  >
                    <div className="w-3 h-4 border border-current rounded-sm" /> Portrait
                  </button>
                  <button
                    onClick={() => setLayout(leafletsPerPage, columns, rows, 'landscape')}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs transition-all",
                      orientation === 'landscape'
                        ? "bg-blue-600 text-white"
                        : "bg-white/5 text-gray-300 hover:bg-white/10"
                    )}
                  >
                    <div className="w-4 h-3 border border-current rounded-sm" /> Landscape
                  </button>
                </div>
              </div>
              
              {/* Info */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-[10px] text-blue-300">
                  <span className="font-semibold">Auto Layout:</span> Leaflets are automatically scaled and positioned with padding for clean printing.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <button 
          onClick={handleGenerate}
          disabled={isGenerating || !templateUrl}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-sm"
        >
          <Zap className="w-4 h-4" />
          {isGenerating ? 'Generating...' : 'Generate PDF'}
        </button>

      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
        active 
          ? "bg-white/10 text-white" 
          : "text-gray-400 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TypeButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
          : "bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
