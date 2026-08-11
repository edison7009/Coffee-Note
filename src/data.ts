import type { LibrarySnapshot, Supplement } from './types';

export const fallbackSupplements: Supplement[] = [
  { id: 'weekly-focus', nameZh: '本周重点', nameEn: 'Weekly focus', category: 'Focus', tier: 'T1', summary: '把最重要的结果、下一步和复盘写在同一页。', filePath: 'dossiers/weekly-focus.md' },
  { id: 'project-decisions', nameZh: '项目决策', nameEn: 'Project decisions', category: 'Decisions', tier: 'T2', summary: '用背景、选项和取舍记录一个可以回看的决定。', filePath: 'dossiers/project-decisions.md' },
  { id: 'reading-queue', nameZh: '阅读清单', nameEn: 'Reading queue', category: 'Learning', tier: 'T3', summary: '收集值得读的内容，并留下它为什么重要。', filePath: 'dossiers/reading-queue.md' },
  { id: 'workflow', nameZh: '工作流程', nameEn: 'Workflow', category: 'Systems', tier: 'T4', summary: '把重复出现的工作整理成可调整的步骤。', filePath: 'dossiers/workflow.md' },
  { id: 'idea-garden', nameZh: '想法孵化', nameEn: 'Idea garden', category: 'Ideas', tier: 'T5', summary: '暂存还不需要立刻执行，但值得继续观察的想法。', filePath: 'dossiers/idea-garden.md' },
];

export const fallbackLibrary: LibrarySnapshot = {
  root: 'Coffee Note Library',
  myInfoRoot: 'Coffee Note Contexts',
  connected: true,
  priorities: fallbackSupplements.map((item) => ({ id: item.filePath || item.id, title: item.nameZh, tier: item.tier, filePath: item.filePath || item.id })),
  supplements: fallbackSupplements,
  people: [],
  stories: [],
  noteCount: fallbackSupplements.length,
};

export const fallbackMarkdown: Record<string, string> = {
  'dossiers/weekly-focus.md': '# 本周重点\n\n写下本周最重要的一项结果，以及推动它的下一步。',
  'dossiers/project-decisions.md': '# 项目决策\n\n记录背景、选项、取舍和复盘日期。',
  'dossiers/reading-queue.md': '# 阅读清单\n\n收集值得读的内容，并留下它为什么重要。',
  'dossiers/workflow.md': '# 工作流程\n\n把重复出现的工作整理成可调整的步骤。',
  'dossiers/idea-garden.md': '# 想法孵化\n\n暂存还不需要立刻执行，但值得继续观察的想法。',
};
