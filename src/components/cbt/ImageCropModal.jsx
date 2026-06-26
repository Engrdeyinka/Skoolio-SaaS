import React, { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Crop, Upload, RotateCcw } from "lucide-react";
import { UploadFile } from "@/integrations/Core";
import { toast } from "sonner";

/**
 * ImageCropModal
 * Let the user pick an image, draw a crop box by dragging, then
 * upload just the cropped region.
 *
 * Props:
 *   open        – boolean
 *   onClose     – () => void
 *   onCropped   – (file_url: string) => void   called with uploaded URL
 */
export default function ImageCropModal({ open, onClose, onCropped }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cropBox, setCropBox] = useState(null);      // { x, y, w, h } in canvas-display coords
  const [isUploading, setIsUploading] = useState(false);

  const containerRef = useRef(null);
  const canvasRef    = useRef(null);   // hidden canvas for drawing
  const imgRef       = useRef(null);   // the visible <img>
  const fileInputRef = useRef(null);
  const dragStart    = useRef(null);

  // ── Reset when modal closes ────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setImageSrc(null);
      setCropBox(null);
      setIsDragging(false);
    }
  }, [open]);

  // ── File pick ──────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setImageSrc(url);
    setCropBox(null);
  };

  // ── Drag to select crop region ─────────────────────────────────────────
  const getPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(clientY - rect.top,  rect.height)),
    };
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    dragStart.current = pos;
    setCropBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
    setIsDragging(true);
  };

  const onMouseMove = useCallback((e) => {
    if (!isDragging || !dragStart.current) return;
    e.preventDefault();
    const pos = getPos(e);
    const x = Math.min(pos.x, dragStart.current.x);
    const y = Math.min(pos.y, dragStart.current.y);
    const w = Math.abs(pos.x - dragStart.current.x);
    const h = Math.abs(pos.y - dragStart.current.y);
    setCropBox({ x, y, w, h });
  }, [isDragging]);

  const onMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup",  onMouseUp);
      window.addEventListener("touchmove", onMouseMove, { passive: false });
      window.addEventListener("touchend",  onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",  onMouseUp);
      window.removeEventListener("touchmove", onMouseMove);
      window.removeEventListener("touchend",  onMouseUp);
    };
  }, [isDragging, onMouseMove, onMouseUp]);

  // ── Crop & Upload ──────────────────────────────────────────────────────
  const handleCropAndUpload = async () => {
    if (!cropBox || cropBox.w < 5 || cropBox.h < 5) {
      toast.error("Please draw a crop area first.");
      return;
    }

    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    // Scale from display coords → natural image coords
    const scaleX = img.naturalWidth  / container.clientWidth;
    const scaleY = img.naturalHeight / container.clientHeight;

    const sx = Math.round(cropBox.x * scaleX);
    const sy = Math.round(cropBox.y * scaleY);
    const sw = Math.round(cropBox.w * scaleX);
    const sh = Math.round(cropBox.h * scaleY);

    const canvas = canvasRef.current;
    canvas.width  = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    canvas.toBlob(async (blob) => {
      if (!blob) { toast.error("Failed to crop image."); return; }
      setIsUploading(true);
      try {
        const file = new File([blob], "diagram.png", { type: "image/png" });
        const { file_url } = await UploadFile({ file });
        if (file_url) {
          onCropped(file_url);
          onClose();
          toast.success("Diagram cropped and attached!");
        } else {
          toast.error("Upload failed.");
        }
      } catch {
        toast.error("Upload failed.");
      } finally {
        setIsUploading(false);
      }
    }, "image/png");
  };

  const hasCrop = cropBox && cropBox.w > 4 && cropBox.h > 4;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Crop className="w-5 h-5 text-blue-600" />
            Crop Diagram
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            {imageSrc
              ? "Drag on the image to select just the diagram area, then click Crop & Save."
              : "Choose an image first, then drag to select the diagram area."}
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* File picker */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4" /> {imageSrc ? "Change Image" : "Choose Image"}
            </Button>
            {imageSrc && (
              <button
                type="button"
                onClick={() => { setImageSrc(null); setCropBox(null); }}
                className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Image with crop overlay */}
          {imageSrc && (
            <div
              ref={containerRef}
              className="relative select-none overflow-hidden rounded-lg border border-slate-200 bg-slate-50 cursor-crosshair"
              style={{ maxHeight: "420px" }}
              onMouseDown={onMouseDown}
              onTouchStart={onMouseDown}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Source"
                className="w-full object-contain pointer-events-none"
                style={{ maxHeight: "420px", display: "block" }}
                draggable={false}
              />

              {/* Dark overlay outside crop */}
              {hasCrop && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ mixBlendMode: "multiply" }}
                >
                  <defs>
                    <mask id="cropMask">
                      <rect width="100%" height="100%" fill="white" />
                      <rect
                        x={cropBox.x} y={cropBox.y}
                        width={cropBox.w} height={cropBox.h}
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#cropMask)" />
                </svg>
              )}

              {/* Crop border + handles */}
              {hasCrop && (
                <div
                  className="absolute border-2 border-blue-400 pointer-events-none"
                  style={{
                    left: cropBox.x, top: cropBox.y,
                    width: cropBox.w, height: cropBox.h,
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.6)",
                  }}
                >
                  {/* Corner handles */}
                  {[
                    { top: -4, left: -4 }, { top: -4, right: -4 },
                    { bottom: -4, left: -4 }, { bottom: -4, right: -4 },
                  ].map((style, i) => (
                    <div
                      key={i}
                      className="absolute w-2.5 h-2.5 bg-white border-2 border-blue-500 rounded-sm"
                      style={style}
                    />
                  ))}
                  {/* Size label */}
                  <div className="absolute -top-6 left-0 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                    {Math.round(cropBox.w)} × {Math.round(cropBox.h)} px
                  </div>
                </div>
              )}

              {/* Instruction when no crop yet */}
              {!hasCrop && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2">
                    <Crop className="w-4 h-4" /> Drag to select the diagram area
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hidden canvas for cropping */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <DialogFooter className="px-5 py-4 border-t bg-slate-50 gap-2">
          <Button variant="outline" onClick={onClose} disabled={isUploading}>Cancel</Button>
          <Button
            onClick={handleCropAndUpload}
            disabled={!hasCrop || isUploading}
            className="bg-blue-600 hover:bg-blue-700 gap-2 min-w-[140px]"
          >
            {isUploading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
              : <><Crop className="w-4 h-4" /> Crop &amp; Save</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
