export function createStageVector({ root }) {
  root.innerHTML = '<svg viewBox="0 0 1600 900"></svg>';
  return { update() {}, resize() {}, info: () => ({}) };
}
