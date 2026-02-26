import { create } from 'zustand';
import { temporal } from 'zundo';

export type BulkType = 'receipts' | 'certificates' | 'idcards';

export interface FieldConfig {
  id: string;
  type: 'text' | 'number' | 'image';
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  align: 'left' | 'center' | 'right';
  value?: string; // For static text or default value
  dataKey?: string; // Key from CSV
}

export interface AppState {
  bulkType: BulkType;
  setBulkType: (type: BulkType) => void;

  templateUrl: string | null;
  templateFile: File | null;
  setTemplate: (file: File | null, url: string | null) => void;

  fields: FieldConfig[];
  addField: (field: FieldConfig) => void;
  updateField: (id: string, updates: Partial<FieldConfig>) => void;
  removeField: (id: string) => void;
  setFields: (fields: FieldConfig[]) => void;

  selectedFieldId: string | null;
  setSelectedFieldId: (id: string | null) => void;

  // Numbering (Receipts)
  fromNumber: number;
  toNumber: number;
  zeroPadding: number;
  setNumbering: (from: number, to: number, padding: number) => void;

  // CSV Data
  csvData: any[];
  csvHeaders: string[];
  setCsvData: (data: any[], headers: string[]) => void;
  
  // Extracted Images from ZIP
  extractedImages: Record<string, ArrayBuffer>;
  setExtractedImages: (images: Record<string, ArrayBuffer>) => void;

  // Canvas Dimensions (for accurate PDF coordinate mapping)
  canvasDimensions: { width: number; height: number };
  setCanvasDimensions: (dimensions: { width: number; height: number }) => void;

  // Layout Controls
  leafletsPerPage: number;
  columns: number;
  rows: number;
  orientation: 'portrait' | 'landscape';
  setLayout: (leaflets: number, columns: number, rows: number, orientation: 'portrait' | 'landscape') => void;

  // Preview State
  currentPage: number;
  setCurrentPage: (page: number) => void;

  // Interaction Mode
  interactionMode: 'select' | 'place_point';
  setInteractionMode: (mode: 'select' | 'place_point') => void;
  pointCounter: number;
  setPointCounter: (count: number) => void;

  // Custom Fonts
  customFonts: { name: string; url: string; file: File }[];
  addCustomFont: (font: { name: string; url: string; file: File }) => void;

  // Output
  generatedPdfUrl: string | null;
  setGeneratedPdfUrl: (url: string | null) => void;
  
  // Template Display
  templateBlackAndWhite: boolean;
  setTemplateBlackAndWhite: (enabled: boolean) => void;

  // Page Generation Control
  pagesToGenerate: number | null;
  setPagesToGenerate: (pages: number | null) => void;

  // Migration
  onMount: () => void;
}

export const useStore = create<AppState>()(
  temporal(
    (set) => ({
      bulkType: 'receipts',
      setBulkType: (type) => set({ bulkType: type, fields: [] }),

      templateUrl: null,
      templateFile: null,
      setTemplate: (file, url) => set({ templateFile: file, templateUrl: url }),

      fields: [],
      addField: (field) => set((state) => ({ fields: [...state.fields, field] })),
      updateField: (id, updates) => set((state) => ({
        fields: state.fields.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      })),
      removeField: (id) => set((state) => ({
        fields: state.fields.filter((f) => f.id !== id),
        selectedFieldId: state.selectedFieldId === id ? null : state.selectedFieldId,
      })),
      setFields: (fields) => set({ fields }),

      selectedFieldId: null,
      setSelectedFieldId: (id) => set({ selectedFieldId: id }),

      fromNumber: 1,
      toNumber: 100,
      zeroPadding: 4,
      setNumbering: (from, to, padding) => set({ fromNumber: from, toNumber: to, zeroPadding: padding }),

      csvData: [],
      csvHeaders: [],
      setCsvData: (data, headers) => set({ csvData: data, csvHeaders: headers }),
      
      // Extracted Images from ZIP
      extractedImages: {},
      setExtractedImages: (images) => set({ extractedImages: images }),
      
      // Canvas Dimensions
      canvasDimensions: { width: 500, height: 700 },
      setCanvasDimensions: (dimensions) => set({ canvasDimensions: dimensions }),

      leafletsPerPage: 1,
      columns: 1,
      rows: 1,
      orientation: 'portrait',
      setLayout: (leaflets, columns, rows, orientation) => set({ leafletsPerPage: leaflets, columns, rows, orientation }),

      currentPage: 1,
      setCurrentPage: (page) => set({ currentPage: page }),

      interactionMode: 'select',
      setInteractionMode: (mode) => set({ interactionMode: mode }),
      pointCounter: 1,
      setPointCounter: (count) => set({ pointCounter: count }),

      customFonts: [],
      addCustomFont: (font) => set((state) => ({ customFonts: [...state.customFonts, font] })),
      
      generatedPdfUrl: null,
      setGeneratedPdfUrl: (url) => set({ generatedPdfUrl: url }),
      
      templateBlackAndWhite: false,
      setTemplateBlackAndWhite: (enabled) => set({ templateBlackAndWhite: enabled }),
      
      pagesToGenerate: null,
      setPagesToGenerate: (pages) => set({ pagesToGenerate: pages }),
      onMount: () => {
        const state = useStore.getState();
        const updatedFields = state.fields.map((field, index) => {
          if (field.type === 'number' && field.value && field.value.match(/^\d+$/)) {
            // Convert numeric values like "0001" to "P1", "0002" to "P2", etc.
            const num = parseInt(field.value);
            if (!isNaN(num)) {
              return {
                ...field,
                value: `P${index + 1}`,
                dataKey: `P${index + 1}`,
                label: `P${index + 1}`
              };
            }
          }
          return field;
        });
        useStore.setState({ fields: updatedFields });
      },
    }),
    {
      limit: 100, // Limit history to 100 steps
      partialize: (state) => {
        const { 
          fields, 
          fromNumber, 
          toNumber, 
          zeroPadding, 
          leafletsPerPage, 
          columns, 
          rows, 
          orientation 
        } = state;
        return { 
          fields, 
          fromNumber, 
          toNumber, 
          zeroPadding, 
          leafletsPerPage, 
          columns, 
          rows, 
          orientation 
        };
      },
    }
  )
);
