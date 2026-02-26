/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Header } from './components/Header';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { RightPanel } from './components/RightPanel';
import { Footer } from './components/Footer';

export default function App() {
  // Load the default font from public directory on app start
  useEffect(() => {
    const loadDefaultFont = async () => {
      try {
        const fontUrl = '/CrashNumberingSerif.otf';
        const fontFace = new FontFace('CrashNumberingSerif', `url(${fontUrl})`);
        await fontFace.load();
        document.fonts.add(fontFace);
        console.log('Default font CrashNumberingSerif loaded successfully');
      } catch (error) {
        console.error('Failed to load default font:', error);
      }
    };

    loadDefaultFont();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#111111] text-white font-sans overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel />
        <CenterPanel />
        <RightPanel />
      </div>
      <Footer />
    </div>
  );
}
