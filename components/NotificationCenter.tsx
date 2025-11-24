import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Info, AlertTriangle, XCircle, ExternalLink, CheckCircle2, CheckCheck, Trash2, Loader2 } from 'lucide-react';
import { Notification, User } from '../types';
import { StorageService } from '../services/storage';
import { useModal } from './ModalProvider';

interface NotificationCenterProps {
    currentUser: User | null;
    onNavigate?: (link: string) => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ currentUser, onNavigate }) => {
    const { showConfirm } = useModal();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!currentUser) return;

        // Initial Fetch
        fetchNotifications();

        // Subscribe to real-time updates
        const unsubscribe = StorageService.subscribe((type, payload) => {
            if (type === 'NOTIFICATION_ADDED') {
                const newNotif = payload as Notification;
                if (newNotif.userId === currentUser.name) {
                    setNotifications(prev => [newNotif, ...prev]);
                    setUnreadCount(prev => prev + 1);
                }
            } else if (type === 'GLOBAL_NOTIFICATION') {
                // Handle broadcast notifications (added dynamically without fetch)
                const globalNotif = payload as Notification;
                setNotifications(prev => [globalNotif, ...prev]);
                setUnreadCount(prev => prev + 1);
            }
        });

        return () => unsubscribe();
    }, [currentUser]);

    const fetchNotifications = async () => {
        if (!currentUser) return;
        const data = await StorageService.getNotifications(currentUser.name);
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.isRead).length);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkRead = async (id: string) => {
        // Only call API if it's a real user notification (not virtual global one if we don't save globals per user)
        // For simplicity, we assume fire-and-forget for global ones in UI state if not persisted individually
        try {
             await StorageService.markNotificationRead(id);
        } catch(e) {} // Ignore error for virtual IDs
        
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const handleMarkAllRead = async () => {
        if (!currentUser || unreadCount === 0) return;
        setIsProcessing(true);
        await StorageService.markAllNotificationsRead(currentUser.name);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        setIsProcessing(false);
    };

    const handleDeleteRead = async () => {
        if (!currentUser) return;
        const readCount = notifications.filter(n => n.isRead).length;
        if (readCount === 0) return;
        
        const confirmed = await showConfirm("Подтверждение", "Удалить все прочитанные уведомления?");
        if (!confirmed) return;

        setIsProcessing(true);
        await StorageService.deleteReadNotifications(currentUser.name);
        setNotifications(prev => prev.filter(n => !n.isRead));
        setIsProcessing(false);
    };

    const handleLinkClick = (e: React.MouseEvent, link: string) => {
        e.preventDefault();
        setIsOpen(false);
        if (onNavigate) {
            onNavigate(link);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
            case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'error': return <XCircle className="w-5 h-5 text-red-500" />;
            default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    if (!currentUser) return null;

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-full hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors relative"
                title="Уведомления"
            >
                <Bell className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-900 animate-pulse" />
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/20 dark:border-gray-700 overflow-hidden z-50 animate-fade-in origin-top-right">
                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-emerald-50/50 dark:bg-emerald-900/20">
                        <div className="flex items-center gap-2">
                            <h3 className="font-serif font-bold text-gray-900 dark:text-white">Уведомления</h3>
                            {unreadCount > 0 && (
                                <span className="text-xs bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                            ) : (
                                <>
                                    <button 
                                        onClick={handleMarkAllRead}
                                        className="p-1.5 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-800/50 text-emerald-600 dark:text-emerald-400 transition-colors disabled:opacity-50"
                                        title="Прочитать все"
                                        disabled={unreadCount === 0}
                                    >
                                        <CheckCheck className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={handleDeleteRead}
                                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500 dark:text-red-400 transition-colors disabled:opacity-50"
                                        title="Удалить прочитанные"
                                        disabled={notifications.every(n => !n.isRead)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p className="text-sm">Уведомлений пока нет</p>
                            </div>
                        ) : (
                            <ul>
                                {notifications.map(notif => (
                                    <li 
                                        key={notif.id} 
                                        className={`p-4 border-b border-gray-50 dark:border-gray-800 last:border-0 transition-colors ${notif.isRead ? 'opacity-60 hover:opacity-100' : 'bg-emerald-50/30 dark:bg-emerald-900/10'}`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="flex-shrink-0 mt-0.5">
                                                {getIcon(notif.type)}
                                            </div>
                                            <div className="flex-grow">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">{notif.title}</h4>
                                                    {!notif.isRead && (
                                                        <button 
                                                            onClick={() => handleMarkRead(notif.id)}
                                                            className="text-[10px] text-emerald-600 font-bold hover:underline"
                                                        >
                                                            Отметить
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 leading-relaxed">
                                                    {notif.message}
                                                </p>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] text-gray-400">
                                                        {new Date(notif.createdAt).toLocaleString()}
                                                    </span>
                                                    {notif.link && (
                                                        <button 
                                                            onClick={(e) => handleLinkClick(e, notif.link!)}
                                                            className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
                                                        >
                                                            Перейти <ExternalLink className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;