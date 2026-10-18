const APP_ROOT = new URL('../', document.currentScript.src);
const VAULT_ROOT = new URL('obsidian/LOTR%20GAME/', APP_ROOT);
const GITHUB_REPOSITORY = 'carmanout/LOTR-DND';
const GITHUB_BRANCH = 'main';
const VAULT_REPOSITORY_PATH = 'obsidian/LOTR GAME/';
const grid = document.querySelector('#note-grid');
const status = document.querySelector('#archive-status');
const searchInput = document.querySelector('#search-input');
const emptyState = document.querySelector('#empty-state');
const noteDialog = document.querySelector('#note-dialog');
const detailTitle = document.querySelector('#detail-title');
const detailCategory = document.querySelector('#detail-category');
const detailSymbol = document.querySelector('#detail-symbol');
const detailTags = document.querySelector('#detail-tags');
const detailMetadata = document.querySelector('#detail-metadata');
const detailBody = document.querySelector('#detail-body');
const detailPath = document.querySelector('#detail-path');
const detailScroll = document.querySelector('.detail-scroll');
const filterButtons = [...document.querySelectorAll('.filter-button')];
const counts = {
  total: document.querySelector('#total-count'),
  personaje: document.querySelector('#character-count'),
  ejercito: document.querySelector('#army-count'),
  escenario: document.querySelector('#scenario-count'),
};

let notes = [];
let activeFilter = 'all';

function cleanName(value) {
  return decodeURIComponent(value).replace(/\.md$/i, '').replace(/[-_]/g, ' ').trim();
}

function getCategory(path, metadata) {
  const declared = `${metadata.tipo || ''} ${metadata.type || ''} ${metadata.categoria || ''} ${metadata.category || ''}`.toLowerCase();
  const folders = `/${path.toLowerCase()}/`;
  if (folders.includes('/personajes/') || /personaje|character/.test(declared)) return 'personaje';
  if (folders.includes('/unidades/') || /unidad|unit/.test(declared)) return 'unidad';
  if (folders.includes('/ejercitos/') || /ejercito|ejército|army/.test(declared)) return 'ejercito';
  if (folders.includes('/escenarios/') || /escenario|scenario/.test(declared)) return 'escenario';
  return 'otro';
}

function parseNote(source, path) {
  let body = source.replace(/^\uFEFF/, '');
  const metadata = {};
  const frontmatter = body.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (frontmatter) {
    let listKey = '';
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const entry = line.match(/^([\wáéíóúñÁÉÍÓÚÑ -]+):\s*(.*)$/);
      if (entry) {
        listKey = entry[1].trim().toLowerCase();
        const value = entry[2].trim();
        metadata[listKey] = value ? value.replace(/^['"]|['"]$/g, '') : [];
      } else {
        const item = line.match(/^\s+-\s+(.+)$/);
        if (item && listKey) {
          if (!Array.isArray(metadata[listKey])) metadata[listKey] = [];
          metadata[listKey].push(item[1].trim().replace(/^['"]|['"]$/g, ''));
        }
      }
    }
    body = body.slice(frontmatter[0].length);
  }

  const filename = cleanName(path.split('/').pop());
  const titleLine = body.match(/^#\s+(.+)$/m);
  const title = String(metadata.nombre || metadata.name || (titleLine && titleLine[1]) || filename);
  if (titleLine) body = body.replace(titleLine[0], '').trim();
  const category = getCategory(path, metadata);
  const summary = body.split(/\r?\n/).find((line) => line.trim() && !/^\s*[#>*`-]/.test(line)) || '';
  const tags = metadata.tags || metadata.etiquetas || [];
  return {
    title,
    path,
    body: body.trim(),
    summary: summary.replace(/\[\[(.*?)\]\]/g, '$1'),
    category,
    metadata,
    tags: Array.isArray(tags) ? tags : String(tags).split(',').map((tag) => tag.trim()).filter(Boolean),
    searchText: `${title} ${path} ${body} ${JSON.stringify(metadata)}`.toLocaleLowerCase('es'),
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function findNoteByReference(reference) {
  const target = reference.split('#')[0].trim().replace(/\\/g, '/').replace(/\.md$/i, '').toLocaleLowerCase('es');
  if (!target) return null;
  return notes.find((note) => {
    const relativePath = note.path.replace(/^.*?LOTR GAME\//, '').replace(/\.md$/i, '').toLocaleLowerCase('es');
    const filename = relativePath.split('/').pop();
    const aliases = note.metadata.aliases || note.metadata.alias || [];
    const aliasList = Array.isArray(aliases) ? aliases : String(aliases).split(',');
    return relativePath === target || note.title.toLocaleLowerCase('es') === target || filename === target
      || aliasList.some((alias) => String(alias).trim().toLocaleLowerCase('es') === target);
  }) || null;
}

function renderInline(value) {
  const formatText = (text) => escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s([{])_([^_\r\n]+?)_(?=$|[\s)\]},.!?:;])/g, '$1<em>$2</em>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  const citationPattern = /\[\[(.*?)\]\]/g;
  let html = '';
  let lastIndex = 0;
  let citation;
  while ((citation = citationPattern.exec(value)) !== null) {
    html += formatText(value.slice(lastIndex, citation.index));
    const [reference, label] = citation[1].split('|', 2).map((part) => part.trim());
    const note = findNoteByReference(reference);
    const citationText = formatText(label || reference.split('#')[0].trim());
    html += note
      ? `<button class="wiki-link" type="button" data-note-path="${escapeHtml(note.path)}" aria-label="Abrir ficha de ${escapeHtml(note.title)}">${citationText}</button>`
      : `<span class="wiki-link is-unresolved">${citationText}</span>`;
    lastIndex = citationPattern.lastIndex;
  }
  return html + formatText(value.slice(lastIndex));
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const output = [];
  let paragraph = [];
  const listStack = [];
  const splitTableRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  const closeListLevel = () => {
    const list = listStack.pop();
    if (list) {
      if (list.hasItem) output.push('</li>');
      output.push(`</${list.type}>`);
    }
  };
  const closeLists = () => {
    while (listStack.length) closeListLevel();
  };
  const closeParagraph = () => {
    if (paragraph.length) output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const listItem = line.match(/^([ \t]*)([-*+]|\d+\.)\s+(.+)$/);
    const statblockEntry = line.match(/^\*\*(.+?)\*\*[.:]\s*(.+)$/);
    const divider = lines[index + 1] ? splitTableRow(lines[index + 1]) : [];
    if (line.includes('|') && divider.length && divider.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      closeParagraph(); closeLists();
      const headers = splitTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      output.push(`<div class="table-scroll"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (/^(---+|\*\*\*+|___+)$/.test(line.trim())) {
      closeParagraph(); closeLists(); output.push('<hr>');
    } else if (/^\s*>/.test(line)) {
      closeParagraph(); closeLists();
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, '').trim());
        index += 1;
      }
      index -= 1;
      output.push(`<blockquote><p>${quote.map(renderInline).join('<br>')}</p></blockquote>`);
    } else if (statblockEntry) {
      closeParagraph(); closeLists();
      output.push(`<section class="statblock-entry"><h5>${escapeHtml(statblockEntry[1])}</h5><p>${renderInline(statblockEntry[2])}</p></section>`);
    } else if (heading) {
      closeParagraph(); closeLists();
      const level = Math.min(heading[1].length + 2, 6);
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (listItem) {
      closeParagraph();
      const indent = listItem[1].replace(/\t/g, '    ').length;
      const nextType = /^\d/.test(listItem[2]) ? 'ol' : 'ul';
      while (listStack.length && listStack[listStack.length - 1].indent > indent) closeListLevel();
      let currentList = listStack[listStack.length - 1];
      if (currentList && currentList.indent === indent && currentList.type !== nextType) {
        closeListLevel();
        currentList = listStack[listStack.length - 1];
      }
      if (!currentList || currentList.indent < indent) {
        output.push(`<${nextType}>`);
        listStack.push({ type: nextType, indent, hasItem: false });
        currentList = listStack[listStack.length - 1];
      } else if (currentList.hasItem) {
        output.push('</li>');
      }
      output.push(`<li>${renderInline(listItem[3])}`);
      currentList.hasItem = true;
    } else if (!line.trim()) {
      closeParagraph(); closeLists();
    } else {
      closeLists(); paragraph.push(line.trim());
    }
  }
  closeParagraph(); closeLists();
  return output.join('');
}

function categoryLabel(category) {
  return ({ personaje: 'Personaje', unidad: 'Unidad', ejercito: 'Ejército', escenario: 'Escenario', otro: 'Crónica' })[category];
}

function noteCategoryLabel(note) {
  const declared = note.metadata.categoria || note.metadata.category;
  return note.metadata.ca !== undefined && note.metadata.pg !== undefined && declared
    ? String(declared)
    : categoryLabel(note.category);
}

function formatFieldName(name) {
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function visibleFields(metadata) {
  const hidden = new Set(['nombre', 'name', 'tipo', 'type', 'categoria', 'category', 'tags', 'etiquetas', 'aliases', 'cssclass']);
  return Object.entries(metadata)
    .filter(([key, value]) => !hidden.has(key) && value !== '');
}

function formatMetadataValue(value) {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function renderDndStatBlock(metadata) {
  const primaryStats = [
    ['ca', 'Clase de armadura'],
    ['pg', 'Puntos de golpe'],
    ['velocidad', 'Velocidad'],
  ].filter(([key]) => metadata[key] !== undefined);
  const abilities = ['fue', 'des', 'con', 'int', 'sab', 'car'].filter((key) => metadata[key] !== undefined);
  const saves = Object.entries(metadata).filter(([key]) => key.startsWith('ts '));
  const groupedProperties = new Set(['ca', 'pg', 'velocidad', 'fue', 'des', 'con', 'int', 'sab', 'car', 'categoria', 'ts fue', 'ts des', 'ts con', 'ts int', 'ts sab', 'ts car', 'nombre', 'name', 'tipo', 'type', 'tags', 'etiquetas', 'aliases', 'cssclass']);
  const properties = Object.entries(metadata).filter(([key]) => !groupedProperties.has(key));
  const saveLine = saves.length
    ? `<div><dt>Tiradas de salvación</dt><dd>${saves.map(([key, value]) => `${escapeHtml(key.slice(3).toUpperCase())} ${escapeHtml(formatMetadataValue(value))}`).join(', ')}</dd></div>`
    : '';

  return `<section class="dnd-statblock" aria-label="Estadísticas de combate">
    <dl class="dnd-primary-stats">${primaryStats.map(([key, label]) => `<div><dt>${label}</dt><dd>${escapeHtml(formatMetadataValue(metadata[key]))}</dd></div>`).join('')}</dl>
    <div class="dnd-abilities" aria-label="Características">${abilities.map((key) => {
      const score = Number(metadata[key]);
      const modifier = Number.isFinite(score) ? Math.floor((score - 10) / 2) : null;
      const modifierLabel = modifier === null ? '' : `${modifier >= 0 ? '+' : ''}${modifier}`;
      return `<div class="dnd-ability"><span>${key.toUpperCase()}</span><strong>${escapeHtml(formatMetadataValue(metadata[key]))}</strong><small>${modifierLabel}</small></div>`;
    }).join('')}</div>
    <dl class="dnd-defenses">${saveLine}${properties.map(([key, value]) => `<div><dt>${escapeHtml(formatFieldName(key))}</dt><dd>${escapeHtml(formatMetadataValue(value))}</dd></div>`).join('')}</dl>
  </section>`;
}

function createCard(note, index) {
  const card = document.createElement('article');
  card.className = `note-card category-${note.category}`;
  card.dataset.notePath = note.path;
  card.style.setProperty('--card-order', index);
  const hasDndStats = note.metadata.ca !== undefined && note.metadata.pg !== undefined;
  const tags = note.tags.slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const fields = visibleFields(note.metadata);
  const stats = fields.length
    ? `<dl class="card-stats">${fields.slice(0, 4).map(([key, value]) => `<div><dt>${escapeHtml(formatFieldName(key))}</dt><dd>${escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</dd></div>`).join('')}</dl>`
    : '';
  const summary = hasDndStats
    ? '<p class="card-summary">Ficha de combate D&amp;D</p>'
    : note.summary
    ? `<p class="card-summary">${renderInline(note.summary)}</p>`
    : '<p class="card-summary muted">Sin descripción todavía.</p>';

  card.innerHTML = `
    <div class="card-topline"><span class="category-mark" aria-hidden="true">${note.category === 'personaje' ? '✦' : note.category === 'escenario' ? '⌖' : '⚔'}</span><span class="category-label">${escapeHtml(noteCategoryLabel(note))}</span></div>
    <h3>${escapeHtml(note.title)}</h3>
    ${summary}
    ${stats}
    ${tags ? `<div class="tag-row">${tags}</div>` : ''}
    <button class="open-note-button" type="button" aria-label="Abrir la ficha de ${escapeHtml(note.title)}">Ver ficha completa <span aria-hidden="true">→</span></button>`;
  return card;
}

function openNote(note) {
  const isOpen = noteDialog.open;
  const fields = visibleFields(note.metadata);
  const hasDndStats = note.metadata.ca !== undefined && note.metadata.pg !== undefined;
  detailTitle.textContent = note.title;
  detailCategory.textContent = hasDndStats ? noteCategoryLabel(note) : categoryLabel(note.category);
  detailSymbol.textContent = note.category === 'escenario' ? '⌖' : note.category === 'unidad' || note.category === 'ejercito' ? '⚔' : '✦';
  detailMetadata.innerHTML = hasDndStats
    ? renderDndStatBlock(note.metadata)
    : fields.length
      ? `<dl class="metadata-fields detail-metadata-list">${fields.map(([key, value]) => `<div><dt>${escapeHtml(formatFieldName(key))}</dt><dd>${escapeHtml(formatMetadataValue(value))}</dd></div>`).join('')}</dl>`
      : '';
  detailTags.innerHTML = note.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  detailBody.innerHTML = renderMarkdown(note.body) || '<p class="muted">Esta nota todavía no tiene contenido.</p>';
  detailPath.textContent = note.path.replace(/^.*?LOTR GAME\//, '');
  detailScroll.scrollTop = 0;
  if (!isOpen) noteDialog.showModal();
}

function updateCounts() {
  counts.total.textContent = notes.length;
  counts.personaje.textContent = notes.filter((note) => note.category === 'personaje').length;
  counts.ejercito.textContent = notes.filter((note) => note.category === 'ejercito' || note.category === 'unidad').length;
  counts.escenario.textContent = notes.filter((note) => note.category === 'escenario').length;
}

function renderNotes() {
  const query = searchInput.value.trim().toLocaleLowerCase('es');
  const visible = notes.filter((note) => (activeFilter === 'all' || note.category === activeFilter) && (!query || note.searchText.includes(query)));
  grid.replaceChildren(...visible.map(createCard));
  emptyState.hidden = visible.length > 0;
  status.hidden = notes.length > 0;
}

async function loadArchive() {
  status.hidden = false;
  status.textContent = 'Abriendo los archivos...';
  grid.replaceChildren();
  try {
    const { paths: notePaths, source } = await discoverNotePaths();
    if (!notePaths.length) throw new Error('No se encontraron notas Markdown en la bóveda.');
    const loaded = await Promise.all(notePaths.map(async (path) => {
      const encodedPath = `${VAULT_REPOSITORY_PATH}${path}`.split('/').map(encodeURIComponent).join('/');
      const url = source === 'github'
        ? new URL(`https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${GITHUB_BRANCH}/${encodedPath}`)
        : new URL(path.split('/').map(encodeURIComponent).join('/'), VAULT_ROOT);
      const response = await fetch(url);
      if (!response.ok) return null;
      return parseNote(await response.text(), path);
    }));
    notes = loaded.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    updateCounts();
    status.textContent = notes.length ? '' : 'Todavía no hay notas en la bóveda.';
    renderNotes();
  } catch (error) {
    notes = [];
    updateCounts();
    status.textContent = 'No se pudo leer la bóveda. Comprueba que el repositorio sea público y que sus notas estén publicadas.';
    console.error('Error al cargar la bóveda:', error);
  }
}

async function discoverLocalNotePaths() {
  const directories = [VAULT_ROOT];
  const notePaths = [];
  while (directories.length) {
    const directoryUrl = directories.shift();
    const response = await fetch(directoryUrl);
    if (!response.ok) throw new Error(`No se pudo recorrer ${directoryUrl.pathname} (${response.status}).`);
    const listing = new DOMParser().parseFromString(await response.text(), 'text/html');
    for (const anchor of listing.querySelectorAll('a[href]')) {
      const target = new URL(anchor.getAttribute('href'), directoryUrl);
      if (target.origin !== VAULT_ROOT.origin || !target.pathname.startsWith(VAULT_ROOT.pathname)) continue;
      const name = decodeURIComponent(target.pathname.split('/').filter(Boolean).pop() || '');
      if (!name || name.startsWith('.') || name.toLowerCase() === '.trash') continue;
      if (target.pathname.endsWith('/') && target.href !== directoryUrl.href) directories.push(target);
      else if (/\.md$/i.test(name)) notePaths.push(decodeURIComponent(target.pathname.slice(VAULT_ROOT.pathname.length)));
    }
  }
  return [...new Set(notePaths)];
}

async function discoverGitHubNotePaths() {
  const treeUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/git/trees/${GITHUB_BRANCH}?recursive=1`;
  const response = await fetch(treeUrl, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`GitHub no pudo devolver el árbol del repositorio (${response.status}).`);
  const repositoryTree = await response.json();
  if (repositoryTree.truncated) throw new Error('GitHub truncó el árbol del repositorio.');
  return repositoryTree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(VAULT_REPOSITORY_PATH) && /\.md$/i.test(entry.path))
    .map((entry) => entry.path.slice(VAULT_REPOSITORY_PATH.length))
    .filter((path) => path.split('/').every((part) => !part.startsWith('.') && part.toLowerCase() !== '.trash'));
}

async function discoverNotePaths() {
  const isGitHubPages = window.location.hostname.endsWith('.github.io');
  const sources = isGitHubPages
    ? [discoverGitHubNotePaths, discoverLocalNotePaths]
    : [discoverLocalNotePaths, discoverGitHubNotePaths];
  let lastError;
  for (const discover of sources) {
    try {
      const paths = await discover();
      if (paths.length) return { paths, source: discover === discoverGitHubNotePaths ? 'github' : 'local' };
    } catch (error) {
      lastError = error;
      console.info('No se pudieron recorrer las notas desde esta fuente.', error);
    }
  }
  if (lastError) throw lastError;
  return { paths: [], source: 'local' };
}

filterButtons.forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  filterButtons.forEach((item) => {
    const selected = item === button;
    item.classList.toggle('is-active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderNotes();
}));

searchInput.addEventListener('input', renderNotes);
document.querySelector('#refresh-button').addEventListener('click', loadArchive);
grid.addEventListener('click', (event) => {
  const citation = event.target.closest('.wiki-link[data-note-path]');
  if (citation) {
    const citedNote = notes.find((item) => item.path === citation.dataset.notePath);
    if (citedNote) openNote(citedNote);
    return;
  }
  const card = event.target.closest('.note-card');
  if (!card) return;
  const note = notes.find((item) => item.path === card.dataset.notePath);
  if (note) openNote(note);
});
noteDialog.addEventListener('click', (event) => {
  const citation = event.target.closest('.wiki-link[data-note-path]');
  if (!citation) return;
  const citedNote = notes.find((item) => item.path === citation.dataset.notePath);
  if (citedNote) openNote(citedNote);
});
document.querySelector('#detail-back').addEventListener('click', () => noteDialog.close());
document.querySelector('#detail-close').addEventListener('click', () => noteDialog.close());
noteDialog.addEventListener('click', (event) => {
  if (event.target === noteDialog) noteDialog.close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && noteDialog.open) {
    noteDialog.close();
    return;
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) searchInput.blur();
});

loadArchive();