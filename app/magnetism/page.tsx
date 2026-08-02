import type { Metadata } from "next";
import MagneticFieldLab from "@/components/MagneticFieldLab";

export const metadata: Metadata = {
  title: "多導線磁場疊加｜AstroLab",
  description: "同步 3D／2D 視圖探索多根載流直導線在一點的磁場疊加與安培定律。",
};

export default function MagnetismPage() {
  return <MagneticFieldLab />;
}
