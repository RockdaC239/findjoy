"use client";

import Image from "next/image";
import { useState } from "react";

const DEFAULT_COVER = "/bookmarks/default.svg";

export function BookmarkCover({ cover }: { cover?: string }) {
  const [failures, setFailures] = useState(0);
  const hasCover = Boolean(cover?.trim());
  const source = failures === 0 ? cover?.trim() || DEFAULT_COVER : DEFAULT_COVER;
  const exhausted = failures >= (hasCover ? 2 : 1);

  return (
    <div className="bookmark-cover" aria-hidden="true">
      {!exhausted && (
        <Image
          src={`/findjoy${source}`}
          alt=""
          width={640}
          height={360}
          loading="lazy"
          unoptimized
          onError={() => setFailures((current) => current + 1)}
        />
      )}
    </div>
  );
}
