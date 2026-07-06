'use client';
import { useState, useRef, DragEvent } from 'react';
import { Upload, X, FileText, Loader2, Image as ImageIcon, Video, Mic } from 'lucide-react';
import api from '@/lib/api';
import clsx from 'clsx';

interface Props {
  accept?: string;
  mediaType?: 'imagem' | 'video' | 'audio' | 'arquivo';
  value?: string;
  onUpload: (url: string) => void;
  onClear: () => void;
}

const TYPE_ICONS = {
  imagem:  ImageIcon,
  video:   Video,
  audio:   Mic,
  arquivo: FileText,
};

const TYPE_ACCEPTS = {
  imagem:  'image/*',
  video:   'video/*',
  audio:   'audio/*',
  arquivo: '*',
};

export default function DragUpload({ accept, mediaType, value, onUpload, onClear }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptAttr = accept || (mediaType ? TYPE_ACCEPTS[mediaType] : '*');
  const TypeIcon = mediaType ? TYPE_ICONS[mediaType] : FileText;

  const doUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/uploads', fd);
      onUpload(data.url);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  };

  // ── Preview state ──────────────────────────────────────────
  if (value && !uploading) {
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(value);
    return (
      <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
        {isImage ? (
          <img src={value} alt="preview" className="w-full max-h-44 object-contain p-2" />
        ) : (
          <div className="flex items-center gap-3 p-3">
            <TypeIcon size={18} className="text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-600 truncate flex-1 font-mono">
              {decodeURIComponent(value.split('/').pop() || value)}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onClear}
          className="absolute top-1.5 right-1.5 p-1 bg-black/40 hover:bg-black/60 text-white rounded-lg transition-colors"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  // ── Drop zone ──────────────────────────────────────────────
  return (
    <div>
      <div
        className={clsx(
          'border-2 border-dashed rounded-xl py-5 px-4 text-center cursor-pointer transition-all select-none',
          dragging
            ? 'border-[#FF8754] bg-[#FFF3EC]'
            : 'border-slate-200 hover:border-slate-300 bg-slate-50/50',
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { doUpload(f); e.target.value = ''; }
          }}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={18} className="text-[#FF5706] animate-spin" />
            <p className="text-xs text-slate-400">Enviando...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload size={18} className={dragging ? 'text-[#FF5706]' : 'text-slate-400'} />
            <p className="text-xs font-medium text-slate-500">
              {dragging ? 'Solte aqui' : 'Arraste ou clique para selecionar'}
            </p>
            {mediaType && (
              <p className="text-[10px] text-slate-400">
                {mediaType === 'imagem' && 'JPG, PNG, GIF, WebP'}
                {mediaType === 'video' && 'MP4, MOV, AVI'}
                {mediaType === 'audio' && 'MP3, OGG, AAC, WAV'}
                {mediaType === 'arquivo' && 'PDF, DOC, XLS, ZIP e outros'}
              </p>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
