/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { RightPanel } from './components/RightPanel';
import { Footer } from './components/Footer';
import { LoadingScreen } from './components/LoadingScreen';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  // Load the default font from public directory on app start
  useEffect(() => {
    const loadDefaultFont = async () => {
      try {
        const fontUrl = '/CrashNumberingSerif.otf';
        const fontFace = new FontFace('CrashNumberingSerif', `url(${fontUrl})`);
        await fontFace.load();
        document.fonts.add(fontFace);
        setFontLoaded(true);
        console.log('Default font CrashNumberingSerif loaded successfully');
      } catch (error) {
        console.error('Failed to load default font:', error);
        setFontLoaded(true); // Continue even if font fails
      }
    };

    loadDefaultFont();
  }, []);

  // Handle loading completion
  useEffect(() => {
    if (fontLoaded) {
      // Add a small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [fontLoaded]);

  // Close panels when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setLeftPanelOpen(false);
        setRightPanelOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isLoading) {
    return <LoadingScreen minDuration={2000} />;
  }

  return (
    <div className="flex flex-col h-screen ambient-bg text-white font-sans overflow-hidden">
      <Header
        onToggleLeft={() => { setLeftPanelOpen(!leftPanelOpen); setRightPanelOpen(false); }}
        onToggleRight={() => { setRightPanelOpen(!rightPanelOpen); setLeftPanelOpen(false); }}
        leftPanelOpen={leftPanelOpen}
        rightPanelOpen={rightPanelOpen}
      />

      <div className="flex flex-1 overflow-hidden relative p-4 gap-4 pb-2">
        {/* Backdrop overlay for mobile drawers */}
        <div
          className={`panel-backdrop lg:hidden z-[60] ${leftPanelOpen || rightPanelOpen ? 'active' : ''}`}
          onClick={() => { setLeftPanelOpen(false); setRightPanelOpen(false); }}
        />

        {/* Left Panel — inline on lg+, overlay drawer on smaller */}
        <div className={`
          hidden lg:flex lg:relative lg:z-auto
          w-80 xl:w-96 shrink-0 rounded-2xl overflow-hidden glass-panel
        `}>
          <LeftPanel />
        </div>
        <div className={`
          lg:hidden fixed inset-y-0 left-0 z-[70]
          w-80 sm:w-96
          panel-slide-left ${leftPanelOpen ? 'open' : ''}
        `}>
          <LeftPanel />
        </div>

        {/* Center Panel */}
        <div className="flex-1 rounded-2xl overflow-hidden glass-panel flex flex-col min-w-0">
          <CenterPanel />
        </div>

        {/* Right Panel — inline on lg+, overlay drawer on smaller */}
        <div className={`
          hidden lg:flex lg:relative lg:z-auto
          w-80 xl:w-[500px] shrink-0 rounded-2xl overflow-hidden glass-panel
        `}>
          <RightPanel />
        </div>
        <div className={`
          lg:hidden fixed inset-y-0 right-0 z-[70]
          w-80 sm:w-96
          panel-slide-right ${rightPanelOpen ? 'open' : ''}
        `}>
          <RightPanel />
        </div>
      </div>

      <div className="px-4 pb-4">
        <Footer />
      </div>
    </div>
  );
}
