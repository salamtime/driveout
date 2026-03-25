import React, { Fragment, useEffect } from "react";
import { Dialog, Transition } from '@headlessui/react';

export default function MobileDrawer({ open, onClose, title = "Rental-Manager", items = [], footer }) {
  // Lock background scroll when drawer opens
  useEffect(() => {
    if (!open) return;

    // Save current scroll position
    const scrollY = window.scrollY;
    
    // Lock background scroll
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    // Cleanup: restore scroll when drawer closes
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // DEBUG: Comprehensive iOS scroll debugging
  useEffect(() => {
    if (!open) return;
    
    console.log('=== MOBILEDRAWER DEBUG START ===');
    console.log('Drawer opened on:', navigator.userAgent);
    console.log('Platform:', navigator.platform);
    console.log('Timestamp:', new Date().toISOString());
    
    // Log body styles
    const bodyStyles = window.getComputedStyle(document.body);
    console.log('Body overflow:', bodyStyles.overflow);
    console.log('Body position:', bodyStyles.position);
    console.log('Body height:', bodyStyles.height);
    console.log('Body top:', bodyStyles.top);
    
    // Wait for render, then log drawer elements
    setTimeout(() => {
      const drawer = document.querySelector('.rm-drawer');
      const drawerBody = document.querySelector('.rm-drawer__body');
      const drawerHeader = document.querySelector('.rm-drawer__header');
      const drawerFooter = document.querySelector('.rm-drawer__footer');
      
      if (drawer) {
        const drawerStyles = window.getComputedStyle(drawer);
        console.log('--- DRAWER CONTAINER ---');
        console.log('Drawer height:', drawer.offsetHeight);
        console.log('Drawer clientHeight:', drawer.clientHeight);
        console.log('Drawer display:', drawerStyles.display);
        console.log('Drawer flex-direction:', drawerStyles.flexDirection);
        console.log('Drawer overflow:', drawerStyles.overflow);
        console.log('Drawer pointer-events:', drawerStyles.pointerEvents);
        console.log('Drawer touch-action:', drawerStyles.touchAction);
      } else {
        console.error('ERROR: .rm-drawer element not found!');
      }
      
      if (drawerHeader) {
        console.log('--- DRAWER HEADER ---');
        console.log('Header height:', drawerHeader.offsetHeight);
        console.log('Header flex:', window.getComputedStyle(drawerHeader).flex);
      }
      
      if (drawerBody) {
        const bodyStyles = window.getComputedStyle(drawerBody);
        console.log('--- DRAWER BODY (SCROLLABLE AREA) ---');
        console.log('DrawerBody scrollHeight:', drawerBody.scrollHeight);
        console.log('DrawerBody clientHeight:', drawerBody.clientHeight);
        console.log('DrawerBody offsetHeight:', drawerBody.offsetHeight);
        console.log('DrawerBody overflow-y:', bodyStyles.overflowY);
        console.log('DrawerBody -webkit-overflow-scrolling:', bodyStyles.WebkitOverflowScrolling);
        console.log('DrawerBody touch-action:', bodyStyles.touchAction);
        console.log('DrawerBody flex:', bodyStyles.flex);
        console.log('DrawerBody min-height:', bodyStyles.minHeight);
        console.log('DrawerBody position:', bodyStyles.position);
        console.log('DrawerBody pointer-events:', bodyStyles.pointerEvents);
        console.log('Is scrollable? (scrollHeight > clientHeight):', drawerBody.scrollHeight > drawerBody.clientHeight);
        console.log('Scroll difference:', drawerBody.scrollHeight - drawerBody.clientHeight, 'px');
      } else {
        console.error('ERROR: .rm-drawer__body element not found!');
      }
      
      if (drawerFooter) {
        console.log('--- DRAWER FOOTER ---');
        console.log('Footer height:', drawerFooter.offsetHeight);
        console.log('Footer flex:', window.getComputedStyle(drawerFooter).flex);
      }
      
      // Check parent containers
      const wrappers = document.querySelectorAll('.fixed.inset-0');
      console.log('--- WRAPPER CONTAINERS ---');
      console.log('Number of .fixed.inset-0 wrappers:', wrappers.length);
      wrappers.forEach((wrapper, i) => {
        const styles = window.getComputedStyle(wrapper);
        console.log(`Wrapper ${i} overflow:`, styles.overflow);
        console.log(`Wrapper ${i} pointer-events:`, styles.pointerEvents);
      });
      
      console.log('=== MOBILEDRAWER DEBUG END ===');
    }, 100);
  }, [open]);

  if (!open) return null;

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-[1000]">
        {/* Background overlay */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="rm-overlay" />
        </Transition.Child>

        {/* Drawer panel - iOS SCROLL FIX: removed pointer-events-none */}
        <div className="fixed inset-0">
          <div className="absolute inset-0">
            <div className="fixed inset-y-0 left-0 flex max-w-full">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel 
                  className="rm-drawer pointer-events-auto" 
                  style={{ 
                    touchAction: 'pan-y',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'contain'
                  }}
                >
                  {/* Header - Static */}
                  <header className="rm-drawer__header">
                    <div className="rm-brand">
                      <span className="rm-badge">RM</span>
                      <span className="rm-title">{title}</span>
                    </div>
                    <button className="rm-close" aria-label="Close" onClick={onClose}>✕</button>
                  </header>

                  {/* Body - Scrollable area with iOS-specific styles and DEBUG logging */}
                  <nav 
                    className="rm-drawer__body"
                    style={{
                      WebkitOverflowScrolling: 'touch',
                      overflowY: 'auto',
                      touchAction: 'pan-y'
                    }}
                    onTouchStart={(e) => {
                      console.log('🔵 TouchStart on body:', {
                        clientY: e.touches[0].clientY,
                        target: e.target.className,
                        timestamp: Date.now()
                      });
                    }}
                    onTouchMove={(e) => {
                      console.log('🟢 TouchMove on body:', {
                        clientY: e.touches[0].clientY,
                        target: e.target.className,
                        timestamp: Date.now()
                      });
                    }}
                    onTouchEnd={() => {
                      console.log('🔴 TouchEnd on body');
                    }}
                    onScroll={(e) => {
                      console.log('📜 Scroll event:', {
                        scrollTop: e.target.scrollTop,
                        scrollHeight: e.target.scrollHeight,
                        clientHeight: e.target.clientHeight
                      });
                    }}
                  >
                    {items.map((it, i) =>
                      it?.divider ? (
                        <hr key={`div-${i}`} className="rm-divider" />
                      ) : (
                        <a key={it.label + i} href={it.to} className="rm-item" onClick={onClose}>
                          <span className="rm-icon">{it.icon}</span>
                          <span className="rm-label">{it.label}</span>
                        </a>
                      )
                    )}
                  </nav>

                  {/* Footer - Static with safe area */}
                  <footer className="rm-drawer__footer">
                    {footer}
                  </footer>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}