import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User as UserIcon, KeyRound, ArrowRight, AlertCircle, Loader2, CheckCircle, ArrowLeft, ShieldCheck, QrCode } from 'lucide-react';
import { User } from '../types';
import { StorageService } from '../services/storage';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: User) => void;
}

// Regex for robust email validation
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  // States: 'credentials' -> 'verification'
  const [step, setStep] = useState<'credentials' | 'verification'>('credentials');
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Form Data
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  // TOTP QR Code
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) resetForm();
  }, [isOpen]);

  const resetForm = () => {
    setStep('credentials');
    setName('');
    setEmail('');
    setPassword('');
    setVerificationCode('');
    setError('');
    setSuccessMsg('');
    setQrCodeUrl(null);
    setIsLoading(false);
  };

  // STEP 1: Credentials -> Send Code (Implicitly validates password for login)
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setSuccessMsg('');
      
      if (!EMAIL_REGEX.test(email)) {
          setError('Введите корректный email адрес');
          return;
      }
      if (password.length < 6) {
          setError('Пароль должен быть не менее 6 символов');
          return;
      }

      setIsLoading(true);
      try {
          let result;
          if (isLoginMode) {
              // Login: Email + Password check
              result = await StorageService.loginStep1(email, password);
              setQrCodeUrl(null); // No QR for login
          } else {
              // Register: Name + Email + Password check -> Get QR
              if (!name.trim()) { setError("Имя обязательно"); setIsLoading(false); return; }
              const regResult: any = await StorageService.registerStep1(name, email, password);
              result = regResult;
              if (regResult.success && regResult.qrCode) {
                  setQrCodeUrl(regResult.qrCode);
              }
          }
          
          if (result.success) {
              setSuccessMsg(result.message);
              setStep('verification');
          } else {
              setError(result.message);
          }
      } catch (e) {
          setError("Ошибка сети");
      } finally {
          setIsLoading(false);
      }
  };

  // STEP 2: Verify Code -> Complete Auth
  const handleVerificationSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      try {
          let result;
          if (isLoginMode) {
              result = await StorageService.loginStep2(email, verificationCode);
          } else {
              result = await StorageService.registerStep2(email, verificationCode);
          }
          
          if (result.success && result.user) {
              onLogin(result.user);
              onClose();
          } else {
              setError(result.message || "Неверный код");
          }
      } catch (e) {
          setError("Ошибка проверки");
      } finally {
          setIsLoading(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10"
        >
            <X className="w-6 h-6" />
        </button>

        <div className="p-6 sm:p-8">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-center mb-2 text-gray-900 dark:text-white">
                {isLoginMode ? 'Вход' : 'Регистрация'}
            </h2>
            
            <p className="text-center text-gray-500 dark:text-gray-400 mb-6 text-sm">
                {step === 'credentials' 
                    ? (isLoginMode ? "Введите данные для входа" : "Создайте новый аккаунт") 
                    : "Двухфакторная аутентификация"}
            </p>

            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-sm rounded-lg flex items-center gap-2 animate-shake">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}
            {successMsg && !qrCodeUrl && (
                <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 text-sm rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    {successMsg}
                </div>
            )}

            {/* --- STEP 1: CREDENTIALS --- */}
            {step === 'credentials' && (
                <form onSubmit={handleCredentialsSubmit} className="space-y-4 animate-fade-in">
                    {!isLoginMode && (
                        <div className="relative">
                           <UserIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                           <input 
                                type="text" 
                                placeholder="Ваше имя"
                                required 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white"
                            />
                        </div>
                    )}
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                        <input 
                            type="email" 
                            placeholder="Email адрес"
                            required 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white"
                        />
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                         <input 
                            type="password" 
                            placeholder="Пароль"
                            required 
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white"
                        />
                    </div>

                    <button type="submit" disabled={isLoading} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 transition-all active:scale-95">
                        {isLoading ? <Loader2 className="animate-spin" /> : <>Далее <ArrowRight className="w-4 h-4" /></>}
                    </button>
                </form>
            )}

            {/* --- STEP 2: VERIFICATION (TOTP) --- */}
            {step === 'verification' && (
                <form onSubmit={handleVerificationSubmit} className="space-y-4 animate-slide-up">
                    
                    {/* QR Code Display for Registration */}
                    {!isLoginMode && qrCodeUrl && (
                        <div className="flex flex-col items-center justify-center mb-4 p-4 bg-white rounded-xl border border-gray-200">
                             <div className="text-center mb-2">
                                 <span className="flex items-center justify-center gap-2 text-sm font-bold text-gray-800"><QrCode className="w-4 h-4"/> Сканируйте в Google Authenticator</span>
                             </div>
                             <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
                             <p className="text-xs text-gray-500 mt-2 text-center max-w-[200px]">Откройте приложение Authenticator, нажмите "+" и отсканируйте код.</p>
                        </div>
                    )}
                    
                    {isLoginMode && (
                         <div className="flex flex-col items-center justify-center mb-4 text-emerald-600 dark:text-emerald-400">
                             <ShieldCheck className="w-12 h-12 mb-2" />
                             <p className="text-sm font-medium">Введите код из Google Authenticator</p>
                         </div>
                    )}

                    <div className="relative">
                        <KeyRound className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="000 000"
                            required 
                            maxLength={6}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 focus:ring-2 focus:ring-emerald-500 outline-none text-center tracking-widest font-mono text-lg dark:text-white"
                            autoFocus
                        />
                    </div>
                    <button type="submit" disabled={isLoading} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg flex justify-center disabled:opacity-70 transition-all active:scale-95">
                        {isLoading ? <Loader2 className="animate-spin" /> : 'Подтвердить и Войти'}
                    </button>
                    <button type="button" onClick={() => setStep('credentials')} className="w-full text-center text-sm text-gray-500 hover:underline flex items-center justify-center gap-1">
                        <ArrowLeft className="w-3 h-3" /> Назад
                    </button>
                </form>
            )}

            <div className="mt-6 text-center pt-4 border-t border-gray-100 dark:border-gray-800">
                <button onClick={() => { setIsLoginMode(!isLoginMode); resetForm(); }} className="text-sm text-gray-500 hover:text-emerald-600 font-medium transition-colors">
                    {isLoginMode ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
