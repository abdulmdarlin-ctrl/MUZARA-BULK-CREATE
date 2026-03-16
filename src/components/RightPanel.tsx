import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Download, Printer, FileText, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

function PdfPage({ pdf, pageNumber }: { pdf: any, pageNumber: number, key?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let isCancelled = false;

    const render = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (isCancelled) return;

        const desiredWidth = 450;
        const viewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          canvas.height = scaledViewport.height;
          canvas.width = scaledViewport.width;

          if (context) {
            await page.render({
              canvasContext: context,
              viewport: scaledViewport
            }).promise;
          }
        }
      } catch (err) {
        console.error(`Error rendering page ${pageNumber}:`, err);
        if (!isCancelled) setError("Failed to render page.");
      }
    };

    render();

    return () => {
      isCancelled = true;
    };
  }, [pdf, pageNumber]);

  return (
    <div className="bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] rounded-sm ring-1 ring-white/10 mb-8 relative shrink-0">
      <canvas ref={canvasRef} className="max-w-full block rounded-sm" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-white p-4 text-center">
          {error}
        </div>
      )}
      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">
        Page {pageNumber}
      </div>
    </div>
  );
}

export function RightPanel() {
  const { generatedPdfUrl } = useStore();
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handlePrint = () => {
    if (generatedPdfUrl) {
      const printWindow = window.open(generatedPdfUrl);
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  useEffect(() => {
    if (!generatedPdfUrl) {
      setPdfDocument(null);
      setNumPages(0);
      return;
    }

    let isCancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const loadingTask = pdfjsLib.getDocument(generatedPdfUrl);
        const pdf = await loadingTask.promise;
        
        if (isCancelled) return;
        
        setPdfDocument(pdf);
        setNumPages(pdf.numPages);
      } catch (err: any) {
        console.error("Error loading PDF:", err);
        if (!isCancelled) {
          setError("Failed to load PDF preview.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [generatedPdfUrl]);

  return (
    <div className="w-full bg-transparent flex flex-col h-full relative">
      <div className="p-3 sm:p-4 border-b border-white/5 flex items-center justify-between bg-black/20 backdrop-blur-md relative z-10 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Final Output</h2>
          {numPages > 0 && (
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
              {numPages} page{numPages > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {generatedPdfUrl && (
            <>
              <button 
                onClick={handlePrint}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-all hover:scale-105 active:scale-95 border border-white/5"
                title="Print"
              >
                <Printer className="w-4 h-4" />
              </button>
              <a 
                href={generatedPdfUrl} 
                download="muzara-export.pdf"
                className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 rounded-lg transition-all hover:scale-105 active:scale-95 border border-blue-500/20"
                title="Download PDF"
              >
                <Download className="w-4 h-4" />
              </a>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-transparent custom-pattern-bg flex flex-col items-center p-4 sm:p-6 lg:p-10 relative scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {generatedPdfUrl ? (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 pointer-events-none">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            )}
            
            {error ? (
               <div className="text-red-500 bg-white/5 p-4 rounded text-center border border-red-500/20">
                 {error}
               </div>
            ) : (
              pdfDocument && numPages > 0 && (
                <div className="w-full flex flex-col items-center pb-8">
                  {Array.from(new Array(numPages), (_, index) => (
                    <PdfPage 
                      key={index} 
                      pdf={pdfDocument} 
                      pageNumber={index + 1} 
                    />
                  ))}
                </div>
              )
            )}
          </>
        ) : (
          <div className="text-center p-8 text-gray-500 my-auto">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm font-medium mb-1">No Output Generated</p>
            <p className="text-xs opacity-70">Configure your template and click "Generate PDF" to see the result here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
