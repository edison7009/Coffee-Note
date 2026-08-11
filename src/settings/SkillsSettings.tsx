import { Box, Check, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addSkillSource,
  createSkillCategory,
  deleteSkillCategory,
  deleteSkillSource,
  renameSkillCategory,
  updateSkillFromSource,
} from '../api';
import { SettingsSelect } from './SettingsSelect';
import type {
  Locale,
  SkillCatalog,
  SkillPlugin,
  SkillSourceDraft,
} from '../types';

interface SkillsSettingsProps {
  locale: Locale;
  catalog: SkillCatalog;
  loading: boolean;
  error: string;
  onCatalogChange: (catalog: SkillCatalog) => void;
}

const EMPTY_DRAFT: SkillSourceDraft = {
  sourceUrl: '',
  categoryId: 'copywriting',
};

function categoryLabel(id: string, fallback: string, locale: Locale) {
  if (locale === 'zh') return fallback;
  if (id === 'copywriting') return 'Copywriting';
  if (id === 'ppt') return 'Presentations';
  if (id === 'video') return 'Video';
  return fallback;
}

export function SkillsSettings({
  locale,
  catalog,
  loading,
  error,
  onCatalogChange,
}: SkillsSettingsProps) {
  const [activeCategoryId, setActiveCategoryId] = useState('copywriting');
  const [draft, setDraft] = useState<SkillSourceDraft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<'create' | 'rename' | null>(null);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [updatingPluginId, setUpdatingPluginId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [updatedPluginNotice, setUpdatedPluginNotice] = useState<{
    pluginId: string;
    message: string;
  } | null>(null);

  const activeCategory = catalog.categories.find((category) => category.id === activeCategoryId)
    ?? catalog.categories[0];
  const visiblePlugins = useMemo(
    () => catalog.plugins.filter((plugin) => plugin.categoryId === activeCategory?.id),
    [activeCategory?.id, catalog.plugins],
  );

  useEffect(() => {
    if (!catalog.categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(catalog.categories[0]?.id ?? 'copywriting');
    }
  }, [activeCategoryId, catalog.categories]);

  const closeSourceForm = () => {
    setFormOpen(false);
    setDraft({ ...EMPTY_DRAFT, categoryId: activeCategory?.id ?? 'copywriting' });
    setActionError('');
  };

  const startAddSource = () => {
    setDraft({ ...EMPTY_DRAFT, categoryId: activeCategory?.id ?? 'copywriting' });
    setFormOpen(true);
    setActionError('');
    setActionNotice('');
    setUpdatedPluginNotice(null);
  };

  const submitSource = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    setActionNotice('');
    setUpdatedPluginNotice(null);
    try {
      const next = await addSkillSource(draft);
      onCatalogChange(next);
      setActiveCategoryId(draft.categoryId);
      setFormOpen(false);
      setDraft({ ...EMPTY_DRAFT, categoryId: draft.categoryId });
      setActionNotice(locale === 'zh' ? '技能插件已添加。' : 'Skill plugin added.');
    } catch (nextError) {
      setActionError(String(nextError));
    } finally {
      setSaving(false);
    }
  };

  const refreshPlugin = async (plugin: SkillPlugin) => {
    if (updatingPluginId) return;
    setUpdatingPluginId(plugin.id);
    setActionError('');
    setActionNotice('');
    setUpdatedPluginNotice(null);
    try {
      const next = await updateSkillFromSource(plugin.id);
      onCatalogChange(next);
      const updated = next.plugins.find((item) => item.id === plugin.id);
      setUpdatedPluginNotice({
        pluginId: plugin.id,
        message: locale === 'zh'
          ? `「${updated?.name ?? plugin.name}」已更新${updated?.version ? `至 ${updated.version}` : ''}。`
          : `“${updated?.name ?? plugin.name}” is up to date${updated?.version ? ` at ${updated.version}` : ''}.`,
      });
    } catch (nextError) {
      setActionError(String(nextError));
    } finally {
      setUpdatingPluginId(null);
    }
  };

  const removePlugin = async (plugin: SkillPlugin) => {
    setActionError('');
    setActionNotice('');
    setUpdatedPluginNotice(null);
    try {
      onCatalogChange(await deleteSkillSource(plugin.id));
    } catch (nextError) {
      setActionError(String(nextError));
    }
  };

  const submitCategory = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    try {
      const next = categoryMode === 'rename' && activeCategory
        ? await renameSkillCategory(activeCategory.id, categoryDraft)
        : await createSkillCategory(categoryDraft);
      onCatalogChange(next);
      if (categoryMode === 'create') {
        const created = next.categories.at(-1);
        if (created) setActiveCategoryId(created.id);
      }
      setCategoryMode(null);
      setCategoryDraft('');
    } catch (nextError) {
      setActionError(String(nextError));
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = async () => {
    if (!activeCategory || activeCategory.fixed) return;
    setActionError('');
    try {
      const next = await deleteSkillCategory(activeCategory.id);
      onCatalogChange(next);
      setActiveCategoryId(next.categories[0]?.id ?? 'copywriting');
    } catch (nextError) {
      setActionError(
        locale === 'zh' && String(nextError).includes('Move or delete')
          ? '请先移除该分类中的技能插件。'
          : String(nextError),
      );
    }
  };

  return (
    <section className="skills-settings" aria-labelledby="skills-settings-title">
      <header className="skills-settings-heading">
        <div>
          <h2 id="skills-settings-title">{locale === 'zh' ? '技能管理' : 'Skill management'}</h2>
          <p>
            {locale === 'zh'
              ? '安装技能后，可以完成更复杂、更具挑战的任务。'
              : 'Install skills to handle more complex and demanding tasks.'}
          </p>
        </div>
        <button type="button" className="skills-primary-action" onClick={startAddSource}>
          <Plus size={16} strokeWidth={2} />
          {locale === 'zh' ? '添加插件' : 'Add plugin'}
        </button>
      </header>

      <div className="skills-category-bar">
        <div className="skills-category-tabs" role="tablist" aria-label={locale === 'zh' ? '技能分类' : 'Skill categories'}>
          {catalog.categories.map((category) => (
            <button
              type="button"
              role="tab"
              aria-selected={category.id === activeCategory?.id}
              className={category.id === activeCategory?.id ? 'active' : ''}
              onClick={() => {
                setActiveCategoryId(category.id);
                closeSourceForm();
              }}
              key={category.id}
            >
              {categoryLabel(category.id, category.label, locale)}
            </button>
          ))}
          <button
            type="button"
            className="skills-category-add"
            aria-label={locale === 'zh' ? '新建分类' : 'New category'}
            onClick={() => {
              setCategoryMode('create');
              setCategoryDraft('');
              setActionError('');
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        {activeCategory && !activeCategory.fixed && (
          <div className="skills-category-actions">
            <button
              type="button"
              aria-label={locale === 'zh' ? '重命名分类' : 'Rename category'}
              onClick={() => {
                setCategoryMode('rename');
                setCategoryDraft(activeCategory.label);
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              className="danger"
              aria-label={locale === 'zh' ? '删除分类' : 'Delete category'}
              onClick={() => void removeCategory()}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {categoryMode && (
        <form className="skills-category-form" onSubmit={submitCategory}>
          <input
            autoFocus
            value={categoryDraft}
            maxLength={24}
            onChange={(event) => setCategoryDraft(event.target.value)}
            placeholder={locale === 'zh' ? '分类名称' : 'Category name'}
            aria-label={locale === 'zh' ? '分类名称' : 'Category name'}
          />
          <button type="submit" disabled={saving || !categoryDraft.trim()}>
            <Check size={16} />
            {locale === 'zh' ? '保存' : 'Save'}
          </button>
          <button type="button" onClick={() => setCategoryMode(null)}>
            <X size={16} />
            {locale === 'zh' ? '取消' : 'Cancel'}
          </button>
        </form>
      )}

      {formOpen && (
        <form className="skills-editor skills-source-form" onSubmit={submitSource}>
          <div className="skills-editor-heading">
            <strong>{locale === 'zh' ? '添加技能插件' : 'Add skill plugin'}</strong>
            <button type="button" aria-label={locale === 'zh' ? '关闭添加' : 'Close'} onClick={closeSourceForm}>
              <X size={17} />
            </button>
          </div>
          <div className="skills-source-grid">
            <label>
              <span>{locale === 'zh' ? 'Git 仓库地址' : 'Git repository URL'}</span>
              <input
                autoFocus
                value={draft.sourceUrl}
                maxLength={2048}
                placeholder="https://github.com/user/skill-plugin.git"
                onChange={(event) => setDraft((current) => ({ ...current, sourceUrl: event.target.value }))}
                spellCheck={false}
                required
              />
            </label>
            <label>
              <span>{locale === 'zh' ? '分类' : 'Category'}</span>
              <SettingsSelect
                value={draft.categoryId}
                options={catalog.categories.map((category) => ({
                  value: category.id,
                  label: categoryLabel(category.id, category.label, locale),
                }))}
                onChange={(categoryId) => setDraft((current) => ({ ...current, categoryId }))}
                ariaLabel={locale === 'zh' ? '选择技能分类' : 'Choose skill category'}
              />
            </label>
          </div>
          <p className="skills-source-note">
            {locale === 'zh'
              ? 'Coffee Note 仅兼容 Codex 插件市场的技能安装方式。'
              : 'Coffee Note only supports the Codex plugin marketplace format for installing skills.'}
          </p>
          <div className="skills-editor-footer">
            <div>
              <button type="button" className="secondary" onClick={closeSourceForm}>
                {locale === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button type="submit" className="primary" disabled={saving || !draft.sourceUrl.trim()}>
                {saving ? (locale === 'zh' ? '读取中…' : 'Reading…') : (locale === 'zh' ? '添加' : 'Add')}
              </button>
            </div>
          </div>
        </form>
      )}

      {(error || actionError) && <p className="skills-error" role="alert">{actionError || error}</p>}
      {actionNotice && <p className="skills-notice" role="status">{actionNotice}</p>}

      <div className="skills-list" aria-live="polite">
        {loading ? (
          <div className="skills-empty">{locale === 'zh' ? '正在读取技能…' : 'Loading skills…'}</div>
        ) : visiblePlugins.length === 0 ? (
          <div className="skills-empty">
            <Sparkles size={20} />
            <span>{locale === 'zh' ? '这个分类还没有技能插件。' : 'There are no skill plugins in this category.'}</span>
          </div>
        ) : visiblePlugins.map((plugin) => (
          <div className="skills-row" key={plugin.id}>
            <div className="skills-row-icon" aria-hidden="true">
              <Sparkles size={17} strokeWidth={1.8} />
            </div>
            <div className="skills-row-copy">
              <div>
                <strong>{plugin.name}</strong>
                {plugin.codexCompatible && <span className="skills-codex-mark"><Box size={13} />Codex</span>}
                {plugin.version && <span className="skills-version">{plugin.version}</span>}
              </div>
              <p className={plugin.error ? 'skills-row-error' : ''}>{plugin.error || plugin.description}</p>
            </div>
            <div className="skills-row-actions">
              {updatedPluginNotice?.pluginId === plugin.id && (
                <span className="skills-row-notice" role="status">
                  {updatedPluginNotice.message}
                </span>
              )}
              <button
                type="button"
                disabled={updatingPluginId !== null}
                aria-label={locale === 'zh' ? `更新插件 ${plugin.name}` : `Update plugin ${plugin.name}`}
                onClick={() => void refreshPlugin(plugin)}
              >
                <RefreshCw className={updatingPluginId === plugin.id ? 'is-spinning' : ''} size={15} />
                {updatingPluginId === plugin.id
                  ? (locale === 'zh' ? '更新中…' : 'Updating…')
                  : (locale === 'zh' ? '更新' : 'Update')}
              </button>
              <button
                type="button"
                className="danger"
                aria-label={locale === 'zh' ? `移除插件 ${plugin.name}` : `Remove plugin ${plugin.name}`}
                onClick={() => void removePlugin(plugin)}
              >
                <Trash2 size={15} />
                {locale === 'zh' ? '删除' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
