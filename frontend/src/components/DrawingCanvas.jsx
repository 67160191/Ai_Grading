import { useEffect, useRef, useState } from "react";

// Canvas วาดด้วยเมาส์/stylus/touch ผ่าน Pointer Events API (มาตรฐาน ครอบคลุมทั้งหมดในตัวเดียว)
// รองรับ paste รูปภาพ (Ctrl+V) วาดทับลงบน canvas เดียวกัน
export default function DrawingCanvas({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2937";
  }, []);

  const notifyChange = (hasDrawing) => {
    setHasContent(hasDrawing);
    if (onChange) {
      canvasRef.current.toBlob((blob) => onChange(hasDrawing ? blob : null), "image/png");
    }
  };

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // canvas ถูก CSS ย่อ/ขยายให้พอดีพื้นที่แสดงผล (w-full h-auto) ซึ่งต่างจาก
    // internal resolution (width/height attribute) จึงต้อง scale พิกัดกลับ
    // ไม่งั้นตำแหน่งเส้นที่วาดจะเพี้ยนจาก cursor จริง
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e) => {
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    notifyChange(true);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");
          // scale ให้พอดี canvas ถ้าภาพใหญ่กว่า ไม่งั้นวาดตามขนาดจริงที่มุมบนซ้าย
          const scale = Math.min(
            1,
            canvas.width / img.width,
            canvas.height / img.height,
          );
          ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
          URL.revokeObjectURL(url);
          notifyChange(true);
        };
        img.src = url;
        break;
      }
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    notifyChange(false);
  };

  return (
    <div className="space-y-2">
      <div
        tabIndex={0}
        onPaste={handlePaste}
        className="border border-gray-300 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full h-auto touch-none cursor-crosshair bg-white"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          วาดด้วยเมาส์/stylus หรือ paste รูปภาพ (Ctrl+V) ลงในกรอบด้านบน
        </p>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasContent}
          className="text-xs text-gray-500 hover:text-red-500 disabled:opacity-40 disabled:hover:text-gray-500 underline"
        >
          ล้าง
        </button>
      </div>
    </div>
  );
}
