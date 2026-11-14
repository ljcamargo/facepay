'use client';

import { QRCodeSVG } from 'qrcode.react';

export function QrPanel({
  value,
  size = 200,
  caption,
}: {
  value: string;
  size?: number;
  caption?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        <QRCodeSVG value={value} size={size} level="M" marginSize={0} />
      </div>
      {caption && (
        <p className="max-w-[240px] break-all text-center text-xs text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}
