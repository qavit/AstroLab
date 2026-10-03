/** Visibility is presentation-only; comparisons remain existing ProjectileState flags. */
export const INITIAL_PROJECTILE_LAYERS = {
  trajectory: true, velocity: true, components: true, guides: true, grid: true, labels: true, markers: true,
};
export type ProjectileLayers = typeof INITIAL_PROJECTILE_LAYERS;
export const PROJECTILE_LAYER_LABELS: Record<keyof ProjectileLayers, string> = {
  trajectory: "本次軌跡", velocity: "速度向量", components: "水平／垂直速度分量", guides: "位置／位移輔助線", grid: "座標網格", labels: "座標與測量標籤", markers: "測量標記",
};
