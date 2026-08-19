import type { LibrarySnapshot } from './types';

export const fallbackLibrary: LibrarySnapshot = {
  root: 'TierNote Library',
  myInfoRoot: 'TierNote Contexts',
  connected: true,
  priorities: [],
  people: [],
  stories: [],
  noteCount: 0,
};

export const fallbackMarkdown: Record<string, string> = {
  'dossiers/weekly-focus.md': '# 本周重点\n\n写下本周最重要的一项结果，以及推动它的下一步。',
  'dossiers/project-decisions.md': '# 项目决策\n\n记录背景、选项、取舍和复盘日期。',
  'dossiers/reading-queue.md': '# 阅读清单\n\n收集值得读的内容，并留下它为什么重要。',
  'dossiers/workflow.md': '# 工作流程\n\n把重复出现的工作整理成可调整的步骤。',
  'dossiers/idea-garden.md': '# 想法孵化\n\n暂存还不需要立刻执行，但值得继续观察的想法。',
};
