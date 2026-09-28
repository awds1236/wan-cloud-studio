export function validate(input, local=false) {
  if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 2000) throw new Error('프롬프트는 1~2000자로 입력하세요.');
  if (!(local ? ['tiny', 'draft', 'standard'] : ['draft', 'standard']).includes(input.preset)) throw new Error('영상 설정이 올바르지 않습니다.');
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 2147483647) throw new Error('시드는 0~2147483647 정수로 입력하세요.');
  return {prompt: input.prompt.trim(), preset: input.preset, seed: input.seed};
}
