export const fields = ['scale', 'bottom', 'x', 'opacity'];
export const round = value => Number(value.toFixed(6));
export function parseDecimal(text) {
  const value = String(text).normalize('NFKC').trim().replaceAll('−', '-');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function valuesFor({draft, direction, sizeBasis, metrics}) {
  const guide = draft?.views[direction];
  if (!guide) return null;
  const {height, bottom} = metrics(guide);
  return {scale: height / sizeBasis * 100, bottom: bottom * 100, x: guide.x * 100, opacity: guide.opacity * 100};
}
export function limitsFor(ctx, field) {
  if (field === 'opacity') return [0, 100];
  if (field === 'x') return [-1000, 1000];
  const guides = Object.values(ctx.draft.views);
  const fractions = guides.map(g => (g.frame?.bottom ?? 1) - (g.frame?.top ?? 0));
  if (field === 'scale') return [Math.max(...fractions) * .01 / ctx.sizeBasis * 100, Math.min(...fractions) * 20 / ctx.sizeBasis * 100];
  const height = ctx.metrics(ctx.draft.views[ctx.direction]).height;
  const offsets = guides.map((g, i) => ((g.frame?.bottom ?? 1) - .5) * height / fractions[i]);
  return [Math.max(...offsets.map(o => -10 - o)) * 100, Math.min(...offsets.map(o => 10 - o)) * 100];
}
export function validateValue(ctx, field, value) {
  if (!fields.includes(field) || !ctx.draft?.views[ctx.direction] || !Number.isFinite(value)) return false;
  const [min, max] = limitsFor(ctx, field);
  return value >= min && value <= max;
}
export function updateValue(ctx, field, value) {
  const guide = ctx.draft?.views[ctx.direction];
  if (ctx.pending || !guide || (guide.locked && field !== 'opacity') || !validateValue(ctx, field, value)) return false;
  if (field === 'scale') ctx.align(ctx.draft, ctx.direction, {height: ctx.sizeBasis * value / 100});
  if (field === 'bottom') ctx.align(ctx.draft, ctx.direction, {bottom: value / 100});
  if (field === 'x') guide.x = value / 100;
  if (field === 'opacity') guide.opacity = value / 100;
  return true;
}
export function steppedValue(ctx, field, sign, coarse = false) {
  const values = valuesFor(ctx);
  if (!values) return null;
  const step = (field === 'x' || field === 'bottom' ? .1 : 1) * (coarse ? 10 : 1);
  const [min, max] = limitsFor(ctx, field);
  return Math.max(min, Math.min(max, round(values[field] + sign * step)));
}
