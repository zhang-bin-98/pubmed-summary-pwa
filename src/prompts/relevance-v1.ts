import type { Article } from '../domain/models';

export const RELEVANCE_PROMPT_VERSION = 'relevance-v1' as const;

export function buildRelevancePrompt(topic: string, articles: Article[]): string {
  return [
    '你是医学文献初筛助手。根据用户研究主题，仅评估每篇标题和摘要的主题相关性。',
    '评分：0=无关，1=弱相关，2=相关，3=直接相关。score>=2 时 include=true，否则为 false。',
    '必须只输出 JSON：{"decisions":[{"sourceId":"...","score":0,"include":false,"reason":"不超过40字"}]}。',
    `研究主题：${topic}`,
    JSON.stringify(articles.map(({ id, title, abstract }) => ({ sourceId: id, title, abstract }))),
  ].join('\n\n');
}
