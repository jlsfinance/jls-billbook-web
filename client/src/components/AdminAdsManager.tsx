
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { GeminiService } from '../services/geminiService';
import { AdminAd } from '../types';
import { Content } from '@radix-ui/react-dialog';
import { ArrowLeft, Trash2, Sparkles, Wand2 } from 'lucide-react';
import { HapticService } from '../services/hapticService';
import { AIService } from '../services/aiService';
import { DialogClose, DialogDescription, DialogPortal, DialogTitle } from './ui/dialog';

export const ANNOUNCEMENTS_PANEL = 'business-announcements';

export const AdminAdsManager: React.FC = () => {
    const [ads, setAds] = useState<AdminAd[]>([]);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        setAds(StorageService.getAdminAds());
    }, []);

    const saveAds = (newAds: AdminAd[]) => {
        setAds(newAds);
        StorageService.saveAdminAds(newAds);
    };

    const handleDelete = (id: string) => {
        if (confirm("Delete this update?")) {
            saveAds(ads.filter(a => a.id !== id));
        }
    };

    const handleGenerate = async () => {
        if (!aiPrompt) return;
        setIsGenerating(true);
        try {
            // Use hardcoded key or fetch from storage
            const apiKey = AIService.getApiKey();
            if (!apiKey) throw new Error("AI Key not set in Settings");
            const result = await GeminiService.generateUpdateContent(aiPrompt, apiKey);

            const newAd: AdminAd = {
                id: crypto.randomUUID(),
                title: result.title || 'New Update',
                content: result.content || 'Description',
                gradient: result.gradient || 'from-blue-500 to-cyan-500',
                type: (result.type as any) || 'INFO',
                isActive: true
            };

            saveAds([...ads, newAd]);
            setAiPrompt('');
            HapticService.success();
        } catch (e: any) {
            const msg = e instanceof Error ? e.message : 'Unknown Error';
            alert(`AI Generation Failed: ${msg}`);
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <DialogPortal>
          <Content className="fixed inset-0 z-[250] flex h-[100dvh] flex-col bg-slate-100 pt-safe-top dark:bg-slate-900">
            <header className="flex shrink-0 items-center gap-3 bg-white px-4 py-2 shadow-sm dark:bg-slate-800">
                <DialogClose type="button" className="-ml-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-200 dark:hover:bg-slate-700">
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Back
                </DialogClose>
                <DialogTitle className="text-xl font-black text-slate-800 dark:text-white">Update Manager</DialogTitle>
                <DialogDescription className="sr-only">Create and manage business announcements.</DialogDescription>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {/* AI Generator Section */}
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-5 h-5" />
                        <h3 className="font-bold text-lg">Update Generation</h3>
                    </div>
                    <p className="text-sm opacity-90 mb-4">Describe the update you want (e.g. "Diwali Sale 50% off") and AI will design it.</p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            aria-label="Update topic"
                            value={aiPrompt}
                            onChange={e => setAiPrompt(e.target.value)}
                            placeholder="Enter topic..."
                            className="min-w-0 flex-1 bg-white/20 border border-white/30 rounded-xl px-4 py-3 text-white placeholder:text-white/60 outline-none focus:bg-white/30 transition-all"
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="bg-white text-indigo-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-transform"
                        >
                            {isGenerating ? <div className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" /> : <Wand2 className="w-5 h-5" />}
                            Generate
                        </button>
                    </div>
                </div>

                {/* Ads List */}
                <div className="space-y-4">
                    <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">Active Updates ({ads.length})</h3>
                    {ads.length === 0 && <p className="text-slate-400 text-center py-10">No updates active.</p>}

                    {ads.map(ad => (
                        <div key={ad.id} className="relative group">
                            <div className={`w-full h-32 rounded-[28px] bg-gradient-to-r ${ad.gradient} p-6 flex flex-col justify-center relative overflow-hidden shadow-md`}>
                                <div className="z-10 text-white">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm border border-white/10">{ad.type}</span>
                                    </div>
                                    <h3 className="text-lg font-black leading-tight">{ad.title}</h3>
                                    <p className="text-xs text-blue-100 mt-1 font-semibold opacity-90">{ad.content}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(ad.id)}
                                className="absolute top-2 right-2 p-2 bg-white/20 hover:bg-red-500 hover:text-white rounded-full text-white backdrop-blur-md transition-colors shadow-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
          </Content>
        </DialogPortal>
    );
};
