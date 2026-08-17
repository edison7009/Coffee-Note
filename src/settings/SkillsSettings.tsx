import { ArrowLeft, Check, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addSkillSource,
  createSkillCategory,
  deleteSkillCategory,
  deleteSkillSource,
  moveSkillSource,
  renameSkillCategory,
  setSkillEnabled,
  setSkillSourceEnabled,
  setBuiltinPluginEnabled,
  updateSkillFromSource,
} from '../api';
import { SettingsSelect } from './SettingsSelect';
import type {
  Locale,
  SkillCatalog,
  SkillDefinition,
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
  if (id === 'media') return 'Audio & video';
  return fallback;
}

function pluginName(plugin: SkillPlugin, locale: Locale) {
  if (locale === 'en' && plugin.id === 'coffee-media') return 'Coffee Media';
  if (locale === 'en' && plugin.id === 'coffee-documents') return 'Documents';
  if (locale === 'en' && plugin.id === 'coffee-presentation') return 'Presentations';
  return plugin.name;
}

function pluginDescription(plugin: SkillPlugin, locale: Locale) {
  if (locale === 'en' && plugin.id === 'coffee-media') return 'Turn audio and video into editable local text.';
  if (locale === 'en' && plugin.id === 'coffee-documents') return 'Create editable DOCX files and shareable PDFs from notes and source material.';
  if (locale === 'en' && plugin.id === 'coffee-presentation') return 'Turn notes and source material into editable PowerPoint presentations.';
  return plugin.description;
}

function childSkillTitle(skill: SkillDefinition, locale: Locale) {
  if (locale === 'en' && skill.id === 'coffee-note-media-transcribe') return 'Media to text';
  if (locale === 'en' && skill.id === 'coffee-note-document-create-docx') return 'Create DOCX';
  if (locale === 'en' && skill.id === 'coffee-note-document-create-pdf') return 'Create PDF';
  if (locale === 'en' && skill.id === 'coffee-note-presentation-create') return 'Create presentation';
  return skill.title;
}

function childSkillDescription(skill: SkillDefinition, locale: Locale) {
  if (locale === 'en' && skill.id === 'coffee-note-media-transcribe') return 'Transcribe audio or video and organize it into a note.';
  if (locale === 'en' && skill.id === 'coffee-note-document-create-docx') return 'Create an editable Word document from notes, documents, or conversation content.';
  if (locale === 'en' && skill.id === 'coffee-note-document-create-pdf') return 'Create a polished PDF from notes, documents, or conversation content.';
  if (locale === 'en' && skill.id === 'coffee-note-presentation-create') return 'Create an editable .pptx file from notes, documents, or conversation content.';
  return skill.description;
}

export function SkillsSettings({
  locale,
  catalog,
  loading,
  error,
  onCatalogChange,
}: SkillsSettingsProps) {
  const [activeCategoryId, setActiveCategoryId] = useState('media');
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
  const [editingPluginId, setEditingPluginId] = useState<string | null>(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [togglingSkillId, setTogglingSkillId] = useState<string | null>(null);
  const [togglingPluginId, setTogglingPluginId] = useState<string | null>(null);

  const activeCategory = catalog.categories.find((category) => category.id === activeCategoryId)
    ?? catalog.categories[0];
  const visiblePlugins = useMemo(
    () => catalog.plugins.filter((plugin) => plugin.categoryId === activeCategory?.id),
    [activeCategory?.id, catalog.plugins],
  );
  const selectedPlugin = catalog.plugins.find((plugin) => plugin.id === selectedPluginId) ?? null;
  const selectedPluginSkills = useMemo(
    () => selectedPlugin
      ? catalog.skills.filter((skill) => skill.sourceId === selectedPlugin.id)
      : [],
    [catalog.skills, selectedPlugin],
  );

  useEffect(() => {
    if (!catalog.categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(catalog.categories[0]?.id ?? 'media');
    }
  }, [activeCategoryId, catalog.categories]);

  useEffect(() => {
    if (selectedPluginId && !catalog.plugins.some((plugin) => plugin.id === selectedPluginId)) {
      setSelectedPluginId(null);
    }
  }, [catalog.plugins, selectedPluginId]);

  const closeSourceForm = () => {
    setFormOpen(false);
    setDraft({ ...EMPTY_DRAFT, categoryId: activeCategory?.id ?? 'copywriting' });
    setActionError('');
  };

  const startAddSource = () => {
    setDraft({ ...EMPTY_DRAFT, categoryId: activeCategory?.id ?? 'copywriting' });
    setFormOpen(true);
    setEditingPluginId(null);
    setEditCategoryId('');
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
      if (selectedPluginId === plugin.id) setSelectedPluginId(null);
    } catch (nextError) {
      setActionError(String(nextError));
    }
  };

  const toggleSkillEnabled = async (skill: SkillDefinition) => {
    if (togglingSkillId || togglingPluginId || !selectedPlugin?.enabled) return;
    setTogglingSkillId(skill.id);
    setActionError('');
    setActionNotice('');
    try {
      onCatalogChange(await setSkillEnabled(skill.id, skill.sourceId, !skill.enabled));
    } catch (nextError) {
      setActionError(String(nextError));
    } finally {
      setTogglingSkillId(null);
    }
  };

  const togglePluginEnabled = async (plugin: SkillPlugin) => {
    if (togglingPluginId || togglingSkillId) return;
    setTogglingPluginId(plugin.id);
    setActionError('');
    setActionNotice('');
    setUpdatedPluginNotice(null);
    try {
      onCatalogChange(await (plugin.builtin
        ? setBuiltinPluginEnabled(plugin.id, !plugin.enabled)
        : setSkillSourceEnabled(plugin.id, !plugin.enabled)));
    } catch (nextError) {
      setActionError(String(nextError));
    } finally {
      setTogglingPluginId(null);
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

  const startEditPlugin = (plugin: SkillPlugin) => {
    setFormOpen(false);
    setCategoryMode(null);
    setEditingPluginId(plugin.id);
    setEditCategoryId(plugin.categoryId);
    setActionError('');
    setActionNotice('');
    setUpdatedPluginNotice(null);
  };

  const cancelEditPlugin = () => {
    setEditingPluginId(null);
    setEditCategoryId('');
    setActionError('');
  };

  const submitEditPlugin = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingPluginId) return;
    setSaving(true);
    setActionError('');
    setActionNotice('');
    setUpdatedPluginNotice(null);
    try {
      const next = await moveSkillSource(editingPluginId, editCategoryId);
      onCatalogChange(next);
      setActiveCategoryId(editCategoryId);
      setEditingPluginId(null);
      setEditCategoryId('');
      setActionNotice(locale === 'zh' ? '技能插件已更新。' : 'Skill plugin updated.');
    } catch (nextError) {
      setActionError(String(nextError));
    } finally {
      setSaving(false);
    }
  };

  if (selectedPlugin) {
    const enabledSkillCount = selectedPluginSkills.filter((skill) => skill.enabled).length;
    return (
      <section className="skills-settings skills-package-detail" aria-labelledby="skills-package-title">
        <button
          type="button"
          className="skills-package-back"
          onClick={() => {
            setSelectedPluginId(null);
            setActionError('');
            setActionNotice('');
          }}
        >
          <ArrowLeft size={17} />
          {locale === 'zh' ? '返回插件市场' : 'Back to plugin market'}
        </button>

        <header className="skills-package-heading">
          <div>
            <div className="skills-package-title-line">
              <h2 id="skills-package-title">{pluginName(selectedPlugin, locale)}</h2>
              {selectedPlugin.builtin && <span className="skills-built-in-mark">{locale === 'zh' ? '官方预装' : 'Official'}</span>}
              {selectedPlugin.version && <span className="skills-version">{selectedPlugin.version}</span>}
            </div>
            <small>
              {locale === 'zh'
                ? `已启用 ${enabledSkillCount} / ${selectedPluginSkills.length} 个技能`
                : `${enabledSkillCount} of ${selectedPluginSkills.length} skills enabled`}
            </small>
          </div>
          <div className="skills-package-master">
            <span>{locale === 'zh' ? '全部技能' : 'All skills'}</span>
            <button
              type="button"
              className="skills-row-enabled"
              role="switch"
              aria-checked={selectedPlugin.enabled}
              disabled={togglingPluginId !== null || togglingSkillId !== null}
              aria-label={locale === 'zh'
                ? `${selectedPlugin.enabled ? '停用' : '启用'}技能包 ${selectedPlugin.name}`
                : `${selectedPlugin.enabled ? 'Disable' : 'Enable'} skill package ${selectedPlugin.name}`}
              onClick={() => void togglePluginEnabled(selectedPlugin)}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </header>

        {(error || actionError) && <p className="skills-error" role="alert">{actionError || error}</p>}

        <div className="skills-package-grid" aria-live="polite">
          {selectedPluginSkills.map((skill) => (
            <article className={`skills-skill-card${skill.enabled ? '' : ' is-disabled'}`} key={skill.id}>
              <div className="skills-row-icon" aria-hidden="true">
                {skill.iconId && catalog.icons[skill.iconId]
                  ? <img src={catalog.icons[skill.iconId]} alt="" />
                  : <Sparkles size={22} strokeWidth={1.7} />}
              </div>
              <div className="skills-skill-copy">
                <strong>{childSkillTitle(skill, locale)}</strong>
                <p>{childSkillDescription(skill, locale)}</p>
              </div>
              <div className="skills-row-actions">
                <button
                  type="button"
                  className="skills-row-enabled"
                  role="switch"
                  aria-checked={skill.enabled}
                  disabled={!selectedPlugin.enabled || togglingSkillId !== null || togglingPluginId !== null}
                  aria-label={locale === 'zh'
                    ? `${skill.enabled ? '停用' : '启用'}技能 ${skill.title}`
                    : `${skill.enabled ? 'Disable' : 'Enable'} skill ${skill.title}`}
                  onClick={() => void toggleSkillEnabled(skill)}
                >
                  <span aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="skills-settings" aria-labelledby="skills-settings-title">
      <header className="skills-settings-heading">
        <div>
          <h2 id="skills-settings-title">{locale === 'zh' ? '插件市场' : 'Plugin market'}</h2>
          <p>
            {locale === 'zh'
              ? '一个插件可以包含多个小技能；Agent 会按任务组合调用。'
              : 'Each plugin can provide multiple skills that the Agent composes for a task.'}
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
              setEditingPluginId(null);
              setEditCategoryId('');
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
                setEditingPluginId(null);
                setEditCategoryId('');
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
              ? '支持 Coffee 插件清单，以及包含一个或多个 SKILL.md 的 Git 技能包。第三方代码和运行时不会自动执行。'
              : 'Supports Coffee manifests and Git packages containing one or more SKILL.md files. Third-party code and runtimes are never executed automatically.'}
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
            <span>{locale === 'zh' ? '这个分类还没有插件。' : 'There are no plugins in this category.'}</span>
          </div>
        ) : visiblePlugins.map((plugin) => {
          const isEditing = editingPluginId === plugin.id;
          return (
            <div className="skills-row-wrap" key={plugin.id}>
              <div className={`skills-row${plugin.enabled ? '' : ' is-disabled'}`}>
                <button
                  type="button"
                  className="skills-row-open"
                  aria-label={locale === 'zh' ? `打开技能包 ${plugin.name}` : `Open skill package ${plugin.name}`}
                  onClick={() => setSelectedPluginId(plugin.id)}
                >
                  <div className="skills-row-icon" aria-hidden="true">
                    {plugin.iconId && catalog.icons[plugin.iconId]
                      ? <img src={catalog.icons[plugin.iconId]} alt="" />
                      : <Sparkles size={22} strokeWidth={1.7} />}
                  </div>
                  <div className="skills-row-copy">
                    <div>
                      <strong>{pluginName(plugin, locale)}</strong>
                      {plugin.builtin && <span className="skills-built-in-mark">{locale === 'zh' ? '官方' : 'Official'}</span>}
                      {!plugin.builtin && <span className="skills-built-in-mark">Git</span>}
                      {plugin.version && <span className="skills-version">{plugin.version}</span>}
                    </div>
                    <p className={plugin.error ? 'skills-row-error' : ''}>{plugin.error || pluginDescription(plugin, locale)}</p>
                  </div>
                </button>
                <div className="skills-row-actions">
                  {updatedPluginNotice?.pluginId === plugin.id && (
                    <span className="skills-row-notice" role="status">
                      {updatedPluginNotice.message}
                    </span>
                  )}
                  <button
                    type="button"
                    className="skills-row-enabled"
                    role="switch"
                    aria-checked={plugin.enabled}
                    disabled={togglingPluginId !== null}
                    aria-label={locale === 'zh'
                      ? `${plugin.enabled ? '停用' : '启用'}插件 ${plugin.name}`
                      : `${plugin.enabled ? 'Disable' : 'Enable'} plugin ${plugin.name}`}
                    onClick={() => void togglePluginEnabled(plugin)}
                  >
                    <span aria-hidden="true" />
                  </button>
                  {!plugin.builtin && <>
                    <button
                      type="button"
                      disabled={updatingPluginId !== null}
                      aria-label={locale === 'zh' ? `编辑插件 ${plugin.name}` : `Edit plugin ${plugin.name}`}
                      onClick={() => startEditPlugin(plugin)}
                    >
                      <Pencil size={15} />
                      {locale === 'zh' ? '编辑' : 'Edit'}
                    </button>
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
                  </>}
                </div>
              </div>
              {isEditing && (
                <form className="skills-editor skills-edit-form" onSubmit={submitEditPlugin}>
                  <div className="skills-editor-heading">
                    <strong>
                      {locale === 'zh'
                        ? `编辑技能插件「${plugin.name}」`
                        : `Edit skill plugin “${plugin.name}”`}
                    </strong>
                    <button type="button" aria-label={locale === 'zh' ? '关闭编辑' : 'Close'} onClick={cancelEditPlugin}>
                      <X size={17} />
                    </button>
                  </div>
                  <div className="skills-source-grid">
                    <label>
                      <span>{locale === 'zh' ? 'Git 仓库地址' : 'Git repository URL'}</span>
                      <input readOnly value={plugin.sourceUrl} spellCheck={false} />
                    </label>
                    <label>
                      <span>{locale === 'zh' ? '分类' : 'Category'}</span>
                      <SettingsSelect
                        value={editCategoryId}
                        options={catalog.categories.map((category) => ({
                          value: category.id,
                          label: categoryLabel(category.id, category.label, locale),
                        }))}
                        onChange={setEditCategoryId}
                        ariaLabel={locale === 'zh' ? '选择技能分类' : 'Choose skill category'}
                      />
                    </label>
                  </div>
                  <div className="skills-editor-footer">
                    <div>
                      <button type="button" className="secondary" onClick={cancelEditPlugin}>
                        {locale === 'zh' ? '取消' : 'Cancel'}
                      </button>
                      <button type="submit" className="primary" disabled={saving}>
                        {saving ? (locale === 'zh' ? '保存中…' : 'Saving…') : (locale === 'zh' ? '保存' : 'Save')}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
