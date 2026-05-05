import { useRef, useState } from 'react';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  onFile: (file: File) => void;
}

export default function ImageDropzone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  function validate(file: File): boolean {
    if (!ALLOWED_MIME.includes(file.type)) {
      setToast('Only JPEG, PNG, or WebP images are supported.');
      return false;
    }
    if (file.size > MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setToast(`Image is ${mb} MB; max 10 MB. Try compressing.`);
      return false;
    }
    setToast(null);
    return true;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && validate(file)) onFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && validate(file)) onFile(file);
  }

  return (
    <div>
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <p className="text-gray-500">Drop an image here or click to upload</p>
        <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP — max 10 MB</p>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleChange} />
      {toast && <p className="mt-2 text-sm text-red-600">{toast}</p>}
    </div>
  );
}
