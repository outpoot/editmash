"use client";

import { memo } from "react";
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";

const MemoizedIcon = memo(function MemoizedIcon(props: HugeiconsIconProps) {
	return <HugeiconsIcon {...props} />;
});

export default MemoizedIcon;
