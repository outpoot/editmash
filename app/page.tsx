"use client";

import { useState } from "react";
import TopBar from "./components/TopBar";
import MainLayout from "./components/MainLayout";

export default function Home() {
  const [showMedia, setShowMedia] = useState(true);
  const [showEffects, setShowEffects] = useState(false);

  return (
    <>
    <script
  crossOrigin="anonymous"
  src="//unpkg.com/react-scan/dist/auto.global.js"
></script>
      <TopBar 
        showMedia={showMedia}
        showEffects={showEffects}
        onToggleMedia={() => setShowMedia(!showMedia)}
        onToggleEffects={() => setShowEffects(!showEffects)}
      />
      <MainLayout showMedia={showMedia} showEffects={showEffects} />
    </>
  );
}
