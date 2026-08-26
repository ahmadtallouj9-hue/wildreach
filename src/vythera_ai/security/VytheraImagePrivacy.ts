/**
 * Strip image metadata (EXIF/GPS/device) by re-encoding pixels.
 * Does not modify the original File on disk — returns a sanitized training copy in memory.
 */
export async function stripImagePrivacyMetadata(
  buf: ArrayBuffer,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
): Promise<{ buffer: ArrayBuffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; stripped: boolean }> {
  // Prefer canvas round-trip in browser; Node tests may skip if Image unavailable
  if (typeof createImageBitmap === 'undefined' && typeof document === 'undefined') {
    return { buffer: buf, mimeType, stripped: false };
  }
  try {
    const blob = new Blob([buf], { type: mimeType });
    let bitmap: ImageBitmap;
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob);
    } else {
      return { buffer: buf, mimeType, stripped: false };
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { buffer: buf, mimeType, stripped: false };
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const outMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const outBlob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outMime, 0.92);
    });
    if (!outBlob) return { buffer: buf, mimeType, stripped: false };
    const out = await outBlob.arrayBuffer();
    return { buffer: out, mimeType: outMime, stripped: true };
  } catch {
    return { buffer: buf, mimeType, stripped: false };
  }
}
