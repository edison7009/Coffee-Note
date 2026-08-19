use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::UNIX_EPOCH;

const MAX_LIBRARY_FILES: usize = 1_200;
const MAX_SNIPPET_BYTES: usize = 4_800;
const MAX_PERSONAL_NOTE_BYTES: usize = 7_000;
const GRAPH_REGISTRY_VERSION: u32 = 1;
const GRAPH_REGISTRY_DIR: &str = "library-graph";
const GRAPH_HOP_WEIGHTS: [usize; 3] = [100, 35, 12];

#[derive(Debug, Clone)]
pub struct SearchHit {
    pub score: usize,
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub via_graph: bool,
}

#[derive(Debug)]
struct KnowledgeNote {
    path: String,
    title: String,
    content_hash: u64,
    headings: String,
    content: String,
    searchable_content: String,
    links: Vec<String>,
}

#[derive(Debug)]
struct KnowledgeIndex {
    notes: Vec<KnowledgeNote>,
    by_path: HashMap<String, usize>,
    incoming: Vec<Vec<usize>>,
}

#[derive(Debug)]
struct CachedIndex {
    fingerprint: u64,
    index: Arc<KnowledgeIndex>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedGraph {
    version: u32,
    root: String,
    locale: String,
    fingerprint: u64,
    notes: Vec<PersistedNote>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedNote {
    path: String,
    title: String,
    content_hash: u64,
    links: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphDiagnostics {
    pub note_count: usize,
    pub edge_count: usize,
    pub broken_links: Vec<String>,
    pub orphan_notes: Vec<String>,
    pub registry_fresh: bool,
}

static INDEX_CACHE: OnceLock<Mutex<HashMap<String, CachedIndex>>> = OnceLock::new();

fn stable_hash(value: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn graph_registry_path(root: &Path, locale: &str) -> PathBuf {
    let root_key = stable_hash(&root.to_string_lossy());
    crate::app_data_dir()
        .join(GRAPH_REGISTRY_DIR)
        .join(format!("{root_key:016x}-{locale}.json"))
}

fn persist_graph_registry(root: &Path, locale: &str, fingerprint: u64, index: &KnowledgeIndex) {
    let registry = PersistedGraph {
        version: GRAPH_REGISTRY_VERSION,
        root: root.to_string_lossy().to_string(),
        locale: locale.to_string(),
        fingerprint,
        notes: index
            .notes
            .iter()
            .map(|note| PersistedNote {
                path: note.path.clone(),
                title: note.title.clone(),
                content_hash: note.content_hash,
                links: note.links.clone(),
            })
            .collect(),
    };
    let path = graph_registry_path(root, locale);
    let Some(parent) = path.parent() else { return };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let Ok(json) = serde_json::to_vec_pretty(&registry) else {
        return;
    };
    let temp = path.with_extension("json.tmp");
    if fs::write(&temp, json).is_err() {
        return;
    }
    if path.exists() && fs::remove_file(&path).is_err() {
        let _ = fs::remove_file(&temp);
        return;
    }
    if fs::rename(&temp, &path).is_err() {
        let _ = fs::remove_file(&temp);
    }
}

fn persisted_registry_is_fresh(root: &Path, locale: &str, fingerprint: u64) -> bool {
    let path = graph_registry_path(root, locale);
    let Ok(json) = fs::read_to_string(path) else {
        return false;
    };
    serde_json::from_str::<PersistedGraph>(&json).is_ok_and(|registry| {
        registry.version == GRAPH_REGISTRY_VERSION
            && registry.root == root.to_string_lossy()
            && registry.locale == locale
            && registry.fingerprint == fingerprint
    })
}

pub fn search_library(root: &Path, query: &str, locale: &str, limit: usize) -> Vec<SearchHit> {
    let Some(index) = load_index(root, locale) else {
        return Vec::new();
    };
    search_index(&index, query, limit)
}

pub fn search_library_excluding(
    root: &Path,
    query: &str,
    locale: &str,
    limit: usize,
    excluded_prefixes: &[String],
) -> Vec<SearchHit> {
    let Some(index) = load_index(root, locale) else {
        return Vec::new();
    };
    let allowed = index
        .notes
        .iter()
        .enumerate()
        .filter_map(|(index, note)| {
            (!excluded_prefixes
                .iter()
                .any(|prefix| path_has_prefix(&note.path, prefix)))
            .then_some(index)
        })
        .collect::<HashSet<_>>();
    search_index_filtered(&index, query, limit, Some(&allowed))
}

pub fn retrieve_context(
    root: &Path,
    question: &str,
    selected_paths: &[String],
    locale: &str,
    max_bytes: usize,
) -> String {
    retrieve_context_filtered(root, question, selected_paths, locale, max_bytes, None)
}

pub fn retrieve_context_filtered(
    root: &Path,
    question: &str,
    selected_paths: &[String],
    locale: &str,
    max_bytes: usize,
    allowed_paths: Option<&[String]>,
) -> String {
    retrieve_context_scoped(
        root,
        question,
        selected_paths,
        locale,
        max_bytes,
        allowed_paths,
        &[],
    )
}

pub fn retrieve_context_excluding(
    root: &Path,
    question: &str,
    selected_paths: &[String],
    locale: &str,
    max_bytes: usize,
    excluded_prefixes: &[String],
) -> String {
    retrieve_context_scoped(
        root,
        question,
        selected_paths,
        locale,
        max_bytes,
        None,
        excluded_prefixes,
    )
}

fn retrieve_context_scoped(
    root: &Path,
    question: &str,
    selected_paths: &[String],
    locale: &str,
    max_bytes: usize,
    allowed_paths: Option<&[String]>,
    excluded_prefixes: &[String],
) -> String {
    let Some(index) = load_index(root, locale) else {
        return String::new();
    };

    let explicitly_allowed = allowed_paths.map(|paths| {
        paths
            .iter()
            .filter_map(|path| resolve_note_index(&index, path))
            .collect::<HashSet<_>>()
    });
    let allowed_indices = (allowed_paths.is_some() || !excluded_prefixes.is_empty()).then(|| {
        index
            .notes
            .iter()
            .enumerate()
            .filter_map(|(note_index, note)| {
                let allowed = explicitly_allowed
                    .as_ref()
                    .map_or(true, |indices| indices.contains(&note_index));
                let excluded = excluded_prefixes
                    .iter()
                    .any(|prefix| path_has_prefix(&note.path, prefix));
                (allowed && !excluded).then_some(note_index)
            })
            .collect::<HashSet<_>>()
    });

    let mut included = HashSet::new();
    let mut sections = Vec::new();
    let personal_paths = [
        "profile/about-me.md",
        "plans/current-protocol.md",
        "records/lab-results.md",
        "records/diet-log.md",
        "records/training-log.md",
    ];

    for requested in personal_paths
        .iter()
        .map(|path| path.to_string())
        .chain(selected_paths.iter().cloned())
    {
        let Some(note_index) = resolve_note_index(&index, &requested) else {
            continue;
        };
        if allowed_indices
            .as_ref()
            .is_some_and(|allowed| !allowed.contains(&note_index))
        {
            continue;
        }
        if !included.insert(note_index) {
            continue;
        }
        let note = &index.notes[note_index];
        sections.push(format!(
            "\n\n--- PRIORITY LOCAL NOTE: {} ---\n{}",
            note.path,
            truncate_utf8(&note.content, MAX_PERSONAL_NOTE_BYTES)
        ));
    }

    for hit in search_index_filtered(&index, question, 7, allowed_indices.as_ref()) {
        let Some(note_index) = resolve_note_index(&index, &hit.path) else {
            continue;
        };
        if !included.insert(note_index) {
            continue;
        }
        let retrieval = if hit.via_graph {
            "knowledge-link neighbor"
        } else {
            "hybrid text match"
        };
        sections.push(format!(
            "\n\n--- RETRIEVED LOCAL NOTE: {} ({retrieval}) ---\n{}",
            hit.path, hit.snippet
        ));
    }

    let mut context = String::from(
        "\n\nLOCAL KNOWLEDGE MAP\n\
         The excerpts below were selected locally from the user's Markdown library. \
         Prefer them over general knowledge when relevant, cite their paths, and do not \
         assume omitted notes are irrelevant.",
    );
    for section in sections {
        if context.len() + section.len() > max_bytes {
            break;
        }
        context.push_str(&section);
    }
    if context.lines().count() <= 4 {
        String::new()
    } else {
        context
    }
}

fn load_index(root: &Path, locale: &str) -> Option<Arc<KnowledgeIndex>> {
    let canonical_root = root.canonicalize().ok()?;
    let paths = collect_logical_markdown_paths(&canonical_root, locale);
    let fingerprint = library_fingerprint(&paths);
    let cache_key = format!("{}::{locale}", canonical_root.to_string_lossy());
    let cache = INDEX_CACHE.get_or_init(|| Mutex::new(HashMap::new()));

    if let Ok(cache_guard) = cache.lock() {
        if let Some(cached) = cache_guard.get(&cache_key) {
            if cached.fingerprint == fingerprint {
                return Some(cached.index.clone());
            }
        }
    }

    let index = Arc::new(build_index(&canonical_root, paths));
    persist_graph_registry(&canonical_root, locale, fingerprint, &index);
    if let Ok(mut cache_guard) = cache.lock() {
        cache_guard.insert(
            cache_key,
            CachedIndex {
                fingerprint,
                index: index.clone(),
            },
        );
    }
    Some(index)
}

fn collect_logical_markdown_paths(root: &Path, locale: &str) -> Vec<PathBuf> {
    fn visit(path: &Path, paths: &mut Vec<PathBuf>) {
        if paths.len() >= MAX_LIBRARY_FILES {
            return;
        }
        let Ok(entries) = fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                visit(&path, paths);
            } else if file_type.is_file()
                && path.extension().is_some_and(|extension| extension == "md")
                && !is_paired_english_companion(&path)
            {
                paths.push(path);
            }
        }
    }

    let mut paths = Vec::new();
    visit(root, &mut paths);
    paths.sort();
    paths
        .into_iter()
        .map(|path| localized_note_path(&path, locale))
        .collect()
}

fn source_path_for_english_companion(path: &Path) -> Option<PathBuf> {
    let stem = path.file_stem()?.to_string_lossy();
    let source_stem = stem.strip_suffix(".en")?;
    let extension = path.extension()?.to_string_lossy();
    Some(path.with_file_name(format!("{source_stem}.{extension}")))
}

fn is_paired_english_companion(path: &Path) -> bool {
    source_path_for_english_companion(path).is_some_and(|source| source.is_file())
}

fn english_companion_path(path: &Path) -> PathBuf {
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy())
        .unwrap_or_default();
    path.with_file_name(format!("{stem}.en.md"))
}

fn localized_note_path(path: &Path, locale: &str) -> PathBuf {
    if locale == "en" && !is_paired_english_companion(path) {
        let companion = english_companion_path(path);
        if companion.is_file() {
            return companion;
        }
    }
    path.to_path_buf()
}

fn library_fingerprint(paths: &[PathBuf]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for path in paths {
        path.hash(&mut hasher);
        if let Ok(metadata) = fs::metadata(path) {
            metadata.len().hash(&mut hasher);
            metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_nanos())
                .unwrap_or_default()
                .hash(&mut hasher);
        }
    }
    hasher.finish()
}

fn build_index(root: &Path, paths: Vec<PathBuf>) -> KnowledgeIndex {
    let mut notes = Vec::new();
    for path in paths {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let relative = relative_path(root, &path);
        let title = extract_title(&content, &relative);
        let headings = content
            .lines()
            .filter_map(|line| line.trim_start().strip_prefix('#'))
            .map(|line| line.trim_start_matches('#').trim())
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        let links = extract_markdown_links(&relative, &content);
        notes.push(KnowledgeNote {
            path: relative,
            title,
            content_hash: stable_hash(&content),
            headings: headings.to_lowercase(),
            searchable_content: content.to_lowercase(),
            content,
            links,
        });
    }

    let mut by_path = HashMap::new();
    for (index, note) in notes.iter().enumerate() {
        by_path.insert(note.path.clone(), index);
        if let Some(base_path) = note.path.strip_suffix(".en.md") {
            by_path.insert(format!("{base_path}.md"), index);
        }
    }

    let mut incoming = vec![Vec::new(); notes.len()];
    for (source_index, note) in notes.iter().enumerate() {
        for target in &note.links {
            if let Some(target_index) = by_path.get(target).copied() {
                incoming[target_index].push(source_index);
            }
        }
    }

    KnowledgeIndex {
        notes,
        by_path,
        incoming,
    }
}

fn search_index(index: &KnowledgeIndex, query: &str, limit: usize) -> Vec<SearchHit> {
    search_index_filtered(index, query, limit, None)
}

fn graph_neighbors(index: &KnowledgeIndex, note_index: usize) -> Vec<usize> {
    let mut neighbors = HashSet::new();
    for path in &index.notes[note_index].links {
        if let Some(target) = index.by_path.get(path).copied() {
            neighbors.insert(target);
        }
    }
    neighbors.extend(index.incoming[note_index].iter().copied());
    neighbors.into_iter().collect()
}

fn graph_scores(
    index: &KnowledgeIndex,
    seed_index: usize,
    seed_score: usize,
    allowed_indices: Option<&HashSet<usize>>,
    combined: &mut HashMap<usize, (usize, bool)>,
) {
    let mut frontier = vec![seed_index];
    let mut visited = HashSet::from([seed_index]);

    for &hop_weight in GRAPH_HOP_WEIGHTS.iter().skip(1) {
        let mut next = Vec::new();
        for current in frontier {
            for neighbor in graph_neighbors(index, current) {
                if !visited.insert(neighbor) {
                    continue;
                }
                if allowed_indices.is_some_and(|allowed| !allowed.contains(&neighbor)) {
                    continue;
                }
                let weighted = seed_score
                    .saturating_mul(hop_weight)
                    .saturating_div(GRAPH_HOP_WEIGHTS[0]);
                let entry = combined.entry(neighbor).or_insert((0, true));
                entry.0 = entry.0.saturating_add(weighted.max(1));
                entry.1 = true;
                next.push(neighbor);
            }
        }
        frontier = next;
        if frontier.is_empty() {
            break;
        }
    }
}

fn path_has_prefix(path: &str, prefix: &str) -> bool {
    let path = path.replace('\\', "/");
    let prefix = prefix.replace('\\', "/").trim_matches('/').to_string();
    prefix.is_empty() || path == prefix || path.starts_with(&format!("{prefix}/"))
}

fn search_index_filtered(
    index: &KnowledgeIndex,
    query: &str,
    limit: usize,
    allowed_indices: Option<&HashSet<usize>>,
) -> Vec<SearchHit> {
    let terms = query_terms(query);
    if terms.is_empty() || limit == 0 {
        return Vec::new();
    }

    let mut base_scores = Vec::new();
    for (note_index, note) in index.notes.iter().enumerate() {
        if allowed_indices.is_some_and(|allowed| !allowed.contains(&note_index)) {
            continue;
        }
        let score = score_note(note, query, &terms);
        if score > 0 {
            base_scores.push((score, note_index));
        }
    }
    base_scores.sort_by_key(|(score, _)| Reverse(*score));

    let mut combined: HashMap<usize, (usize, bool)> = HashMap::new();
    for (score, note_index) in &base_scores {
        combined.insert(
            *note_index,
            (score.saturating_mul(GRAPH_HOP_WEIGHTS[0]), false),
        );
    }

    for (seed_score, seed_index) in base_scores.iter().take(4) {
        graph_scores(
            index,
            *seed_index,
            *seed_score,
            allowed_indices,
            &mut combined,
        );
    }

    let mut ranked = combined
        .into_iter()
        .map(|(note_index, (score, via_graph))| (score, note_index, via_graph))
        .collect::<Vec<_>>();
    ranked.sort_by_key(|(score, _, _)| Reverse(*score));
    ranked.truncate(limit);

    ranked
        .into_iter()
        .map(|(score, note_index, via_graph)| {
            let note = &index.notes[note_index];
            SearchHit {
                score,
                path: note.path.clone(),
                title: note.title.clone(),
                snippet: relevant_snippet(&note.content, &terms, MAX_SNIPPET_BYTES),
                via_graph,
            }
        })
        .collect()
}

/// Rebuild (when needed) and report deterministic graph integrity issues without
/// reading note bodies into the result. The registry itself stays in AppData so
/// the user's Markdown library remains untouched.
pub fn graph_diagnostics(root: &Path, locale: &str) -> GraphDiagnostics {
    let canonical_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let Some(index) = load_index(&canonical_root, locale) else {
        return GraphDiagnostics {
            note_count: 0,
            edge_count: 0,
            broken_links: Vec::new(),
            orphan_notes: Vec::new(),
            registry_fresh: false,
        };
    };

    let mut broken_links = index
        .notes
        .iter()
        .flat_map(|note| {
            note.links
                .iter()
                .filter(|target| !index.by_path.contains_key(target.as_str()))
                .map(|target| format!("{} -> {}", note.path, target))
        })
        .collect::<Vec<_>>();
    broken_links.sort();

    let mut orphan_notes = index
        .notes
        .iter()
        .enumerate()
        .filter(|(note_index, note)| {
            note.links.is_empty() && index.incoming[*note_index].is_empty()
        })
        .map(|(_, note)| note.path.clone())
        .collect::<Vec<_>>();
    orphan_notes.sort();

    let paths = collect_logical_markdown_paths(&canonical_root, locale);
    let fingerprint = library_fingerprint(&paths);
    GraphDiagnostics {
        note_count: index.notes.len(),
        edge_count: index.notes.iter().map(|note| note.links.len()).sum(),
        broken_links,
        orphan_notes,
        registry_fresh: persisted_registry_is_fresh(&canonical_root, locale, fingerprint),
    }
}

fn score_note(note: &KnowledgeNote, query: &str, terms: &[String]) -> usize {
    let path = note.path.to_lowercase();
    let title = note.title.to_lowercase();
    let normalized_query = query.trim().to_lowercase();
    let mut score = 0usize;

    if normalized_query.chars().count() >= 3 {
        if title.contains(&normalized_query) {
            score += 120;
        }
        if note.headings.contains(&normalized_query) {
            score += 70;
        }
        if note.searchable_content.contains(&normalized_query) {
            score += 45;
        }
    }

    for term in terms {
        let length_weight = term.chars().count().clamp(1, 4);
        score += occurrence_count(&path, term, 4) * 18 * length_weight;
        score += occurrence_count(&title, term, 4) * 20 * length_weight;
        score += occurrence_count(&note.headings, term, 5) * 9 * length_weight;
        score += occurrence_count(&note.searchable_content, term, 7) * 2 * length_weight;
    }
    score
}

fn query_terms(query: &str) -> Vec<String> {
    const STOP_WORDS: &[&str] = &[
        "about", "and", "are", "can", "could", "for", "from", "how", "should", "the", "this",
        "what", "with", "一下", "个人", "什么", "你的", "可以", "如何", "建议", "我的", "是否",
        "有个", "相关", "能否", "问题",
    ];

    let normalized = query.to_lowercase();
    let mut terms = HashSet::new();
    for token in normalized.split(|character: char| !character.is_alphanumeric()) {
        let token = token.trim();
        if token.chars().count() < 2 || STOP_WORDS.contains(&token) {
            continue;
        }
        if !token.is_ascii() {
            let characters = token.chars().collect::<Vec<_>>();
            for width in [2usize, 3] {
                for window in characters.windows(width) {
                    let term = window.iter().collect::<String>();
                    if !STOP_WORDS.contains(&term.as_str()) {
                        terms.insert(term);
                    }
                }
            }
        } else {
            terms.insert(token.to_string());
        }
    }
    let mut terms = terms.into_iter().collect::<Vec<_>>();
    terms.sort();
    terms
}

fn occurrence_count(haystack: &str, needle: &str, cap: usize) -> usize {
    if needle.is_empty() {
        0
    } else {
        haystack.matches(needle).count().min(cap)
    }
}

fn relevant_snippet(content: &str, terms: &[String], max_bytes: usize) -> String {
    let mut blocks = content
        .split("\n\n")
        .enumerate()
        .filter_map(|(index, block)| {
            let trimmed = block.trim();
            if trimmed.is_empty() || trimmed == "---" {
                return None;
            }
            let lower = trimmed.to_lowercase();
            let score = terms
                .iter()
                .map(|term| occurrence_count(&lower, term, 5))
                .sum::<usize>();
            Some((score, index, trimmed))
        })
        .collect::<Vec<_>>();

    blocks.sort_by_key(|(score, _, _)| Reverse(*score));
    let mut selected = blocks
        .iter()
        .filter(|(score, _, _)| *score > 0)
        .take(3)
        .cloned()
        .collect::<Vec<_>>();
    if selected.is_empty() {
        selected.extend(blocks.into_iter().take(2));
    }
    selected.sort_by_key(|(_, index, _)| *index);
    truncate_utf8(
        &selected
            .into_iter()
            .map(|(_, _, block)| block)
            .collect::<Vec<_>>()
            .join("\n\n"),
        max_bytes,
    )
}

fn extract_title(content: &str, path: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(title) = trimmed.strip_prefix("# ") {
            if !title.trim().is_empty() {
                return title.trim().to_string();
            }
        }
        if let Some(title) = trimmed.strip_prefix("title:") {
            if !title.trim().is_empty() {
                return title.trim().trim_matches(['"', '\'']).to_string();
            }
        }
    }
    Path::new(path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().replace(['-', '_'], " "))
        .unwrap_or_else(|| path.to_string())
}

fn extract_markdown_links(source_path: &str, content: &str) -> Vec<String> {
    let mut links = HashSet::new();
    let mut rest = content;
    while let Some(start) = rest.find("](") {
        rest = &rest[start + 2..];
        let Some(end) = rest.find(')') else {
            break;
        };
        if let Some(path) = normalize_link_target(source_path, &rest[..end]) {
            links.insert(path);
        }
        rest = &rest[end + 1..];
    }
    links.into_iter().collect()
}

fn normalize_link_target(source_path: &str, raw_target: &str) -> Option<String> {
    let target = raw_target
        .trim()
        .trim_matches(['<', '>'])
        .split(['#', '?'])
        .next()?
        .replace('\\', "/");
    if target.is_empty()
        || target.contains("://")
        || target.starts_with("mailto:")
        || !target.to_lowercase().ends_with(".md")
    {
        return None;
    }

    let base = Path::new(source_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let joined = base.join(target);
    let mut parts = Vec::new();
    for component in joined.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::ParentDir => {
                parts.pop()?;
            }
            Component::CurDir => {}
            Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    Some(parts.join("/"))
}

fn resolve_note_index(index: &KnowledgeIndex, requested: &str) -> Option<usize> {
    let normalized = requested
        .replace('\\', "/")
        .trim_start_matches("./")
        .to_string();
    index.by_path.get(&normalized).copied().or_else(|| {
        index
            .by_path
            .get(normalized.trim_end_matches(".en.md"))
            .copied()
    })
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn truncate_utf8(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n\n…[excerpt truncated]", &value[..end])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("tiernote-knowledge-map-{unique}"));
        fs::create_dir_all(root.join("dossiers")).expect("fixture directory should be created");
        fs::create_dir_all(root.join("sources")).expect("fixture directory should be created");
        root
    }

    #[test]
    fn ranks_titles_and_expands_markdown_links() {
        let root = fixture_root();
        fs::write(
            root.join("dossiers/creatine.md"),
            "# 肌酸\n\n肌酸与力量训练证据。\n\n[来源](../sources/creatine-trials.md)",
        )
        .expect("fixture should be written");
        fs::write(
            root.join("sources/creatine-trials.md"),
            "# 肌酸试验\n\n随机试验与安全性来源。",
        )
        .expect("fixture should be written");
        fs::write(
            root.join("dossiers/unrelated.md"),
            "# 其他主题\n\n普通背景内容。肌酸只在尾注出现一次。",
        )
        .expect("fixture should be written");

        let hits = search_library(&root, "肌酸力量训练", "zh", 5);
        assert_eq!(
            hits.first().map(|hit| hit.path.as_str()),
            Some("dossiers/creatine.md")
        );
        assert!(hits
            .iter()
            .any(|hit| hit.path == "sources/creatine-trials.md" && hit.via_graph));

        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn expands_graph_neighbors_to_two_hops_with_lower_weight() {
        let root = fixture_root();
        fs::write(
            root.join("dossiers/seed.md"),
            "# Aurora\n\nThe aurora protocol. [First](first.md)",
        )
        .expect("seed fixture should be written");
        fs::write(
            root.join("dossiers/first.md"),
            "# First relation\n\nA directly linked note. [Second](second.md)",
        )
        .expect("first-hop fixture should be written");
        fs::write(
            root.join("dossiers/second.md"),
            "# Second relation\n\nA note reached through two links.",
        )
        .expect("second-hop fixture should be written");

        let hits = search_library(&root, "aurora", "en", 5);
        let first = hits
            .iter()
            .position(|hit| hit.path == "dossiers/first.md")
            .expect("first-hop note should be retrieved");
        let second = hits
            .iter()
            .position(|hit| hit.path == "dossiers/second.md")
            .expect("second-hop note should be retrieved");
        assert!(first < second, "closer graph neighbors should rank first");
        assert!(hits[first].via_graph && hits[second].via_graph);

        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn reports_broken_links_and_orphan_notes() {
        let root = fixture_root();
        fs::write(
            root.join("dossiers/source.md"),
            "# Source\n\n[Known](../sources/known.md) [Missing](../sources/missing.md)",
        )
        .expect("source fixture should be written");
        fs::write(
            root.join("sources/known.md"),
            "# Known\n\nReferenced by source.",
        )
        .expect("known fixture should be written");
        fs::write(
            root.join("dossiers/orphan.md"),
            "# Orphan\n\nStandalone note.",
        )
        .expect("orphan fixture should be written");

        let diagnostics = graph_diagnostics(&root, "en");
        assert_eq!(diagnostics.note_count, 3);
        assert_eq!(diagnostics.edge_count, 2);
        assert_eq!(
            diagnostics.broken_links,
            vec!["dossiers/source.md -> sources/missing.md"]
        );
        assert_eq!(diagnostics.orphan_notes, vec!["dossiers/orphan.md"]);
        assert!(diagnostics.registry_fresh);

        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn context_uses_relevant_excerpts_instead_of_full_notes() {
        let root = fixture_root();
        let filler = "无关开头。".repeat(2_000);
        fs::write(
            root.join("dossiers/vitamin-d.md"),
            format!("# 维生素 D\n\n{filler}\n\n## 自身免疫\n\n维生素 D 自身免疫相关证据摘要。"),
        )
        .expect("fixture should be written");

        let context = retrieve_context(&root, "维生素D与自身免疫", &[], "zh", 20_000);
        assert!(context.contains("自身免疫相关证据摘要"));
        assert!(context.len() < 10_000);

        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn filtered_context_excludes_disabled_personal_notes() {
        let root = fixture_root();
        fs::create_dir_all(root.join("plans")).expect("plans directory should be created");
        fs::write(
            root.join("plans/supplements.md"),
            "# 我的简历\n\n唯一简历暗号是北极星。",
        )
        .expect("resume fixture should be written");
        fs::write(
            root.join("plans/exercise.md"),
            "# 我的目标\n\n唯一目标暗号是远航。",
        )
        .expect("goal fixture should be written");

        let context = retrieve_context_filtered(
            &root,
            "北极星远航",
            &[],
            "zh",
            20_000,
            Some(&["plans/exercise.md".to_string()]),
        );

        assert!(!context.contains("北极星"));
        assert!(context.contains("远航"));
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn explicit_empty_allowlist_returns_no_context() {
        let root = fixture_root();
        fs::write(
            root.join("dossiers/private.md"),
            "# Private\n\nThe only passphrase is moonstone.",
        )
        .expect("fixture should be written");

        let context = retrieve_context_filtered(
            &root,
            "moonstone",
            &["dossiers/private.md".to_string()],
            "en",
            20_000,
            Some(&[]),
        );

        assert!(context.is_empty());
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn filtered_context_blocks_selected_paths_and_graph_neighbors() {
        let root = fixture_root();
        fs::write(
            root.join("dossiers/allowed.md"),
            "# Allowed\n\nVisible comet details. [Private](private.md)",
        )
        .expect("allowed fixture should be written");
        fs::write(
            root.join("dossiers/private.md"),
            "# Private\n\nHidden nebula details.",
        )
        .expect("private fixture should be written");

        let context = retrieve_context_filtered(
            &root,
            "comet nebula",
            &["dossiers/private.md".to_string()],
            "en",
            20_000,
            Some(&["dossiers/allowed.md".to_string()]),
        );

        assert!(context.contains("Visible comet"));
        assert!(!context.contains("Hidden nebula"));
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn excluded_prefix_blocks_direct_search_selected_paths_and_graph_neighbors() {
        let root = fixture_root();
        fs::create_dir_all(root.join("managed/plans"))
            .expect("managed fixture directory should be created");
        fs::write(
            root.join("dossiers/public.md"),
            "# Public\n\nVisible atlas details. [Secret](../managed/plans/private.md)",
        )
        .expect("public fixture should be written");
        fs::write(
            root.join("managed/plans/private.md"),
            "# Private\n\nHidden aurora details.",
        )
        .expect("private fixture should be written");

        let context = retrieve_context_excluding(
            &root,
            "atlas aurora",
            &["managed/plans/private.md".to_string()],
            "en",
            20_000,
            &["managed".to_string()],
        );

        assert!(context.contains("Visible atlas"));
        assert!(!context.contains("Hidden aurora"));
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn starter_library_returns_domain_relevant_notes() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../starter-knowledge");
        let hits = search_library(&root, "当前方案 目标", "zh", 6);
        assert!(!hits.is_empty());
        assert!(hits
            .iter()
            .all(|hit| hit.snippet.len() <= MAX_SNIPPET_BYTES + 32));
    }
}
