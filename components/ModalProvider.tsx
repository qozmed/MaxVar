import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { HelpCircle, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

type ModalType = 'alert' | 'confirm' | 'error' | 'success';

interface ModalConfig {
  type: ModalType;
  title: string;
  message: string;
  resolve: (value: boolean) => void;
}

interface ModalContextType {
  showAlert: (title: string, message: string, type?: 'info' | 'error' | 'success') => Promise<void>;
  showConfirm: (title: string, message: string) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ModalConfig | null>(null);

  const showAlert = useCallback((title: string, message: string, type: 'info' | 'error' | 'success' = 'info'): Promise<void> => {
    return new Promise((resolve) => {
      setModal({ 
        type: type === 'info' ? 'alert' : type, 
        title, 
        message, 
        resolve: () => resolve() 
      });
    });
  }, []);

  const showConfirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setModal({ type: 'confirm', title, message, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (modal) {
      modal.resolve(result);
      setModal(null);
    }
  };

  const getIcon = () => {
      if (!modal) return null;
      switch (modal.type) {
          case 'confirm': return <HelpCircle className="h-8 w-8 text-emerald-600" />;
          case 'error': return <AlertTriangle className="h-8 w-8 text-red-500" />;
          case 'success': return <CheckCircle2 className="h-8 w-8 text-emerald-500" />;
          default: return <Info className="h-8 w-8 text-blue-500" />;
      }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {modal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-sm w-full border border-white/10 overflow-hidden animate-slide-up transform transition-all">
            <div className="p-8 text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-6 bg-gray-50 dark:bg-gray-800 shadow-inner">
                 {getIcon()}
              </div>
              <h3 className="font-serif text-2xl font-bold text-gray-900 dark:text-white mb-3">{modal.title}</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed text-sm">{modal.message}</p>
              
              <div className="flex gap-3 justify-center">
                {modal.type === 'confirm' && (
                    <button
                        onClick={() => handleClose(false)}
                        className="px-6 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex-1"
                    >
                        Отмена
                    </button>
                )}
                <button
                    onClick={() => handleClose(true)}
                    className={`px-6 py-3 rounded-xl text-white font-bold transition-all shadow-lg active:scale-95 flex-1 ${modal.type === 'error' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'}`}
                >
                    OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};