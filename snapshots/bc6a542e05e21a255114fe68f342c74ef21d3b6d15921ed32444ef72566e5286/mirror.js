/* Safe, dependency-free Markdown subset. Original source is always kept separately. */
(function (global) {
  'use strict';
  const punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function plain(parent, text, options) {
    if (!text) return;
    if (options && typeof options.linkText === 'function') {
      const holder = el('span');
      options.linkText(holder, text);
      while (holder.firstChild) parent.appendChild(holder.firstChild);
    } else parent.appendChild(document.createTextNode(text));
  }
  function safeURL(value) {
    if (!value || /[\u0000-\u0020\u007f-\u009f]/.test(value) || /%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(value)) return null;
    if (/^#[^\s]*$/.test(value)) return value;
    if (!/^https?:\/\//i.test(value)) return null;
    try {
      const url = new URL(value);
      return /^(https?:)$/.test(url.protocol) && !url.username && !url.password && url.hostname ? url.href : null;
    } catch (_) { return null; }
  }
  function closing(text, marker, from) {
    let pos = from;
    while ((pos = text.indexOf(marker, pos)) >= 0) {
      let slashes = 0;
      for (let j = pos - 1; j >= 0 && text[j] === '\\'; j--) slashes++;
      if (!(slashes % 2)) return pos;
      pos += marker.length;
    }
    return -1;
  }
  function linkAt(text, offset) {
    const image = text.slice(offset, offset + 2) === '![';
    const begin = offset + (image ? 2 : 1);
    const end = closing(text, ']', begin);
    if (end < 0 || text[end + 1] !== '(') return null;
    let depth = 1, i;
    for (i = end + 2; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) break;
    }
    if (depth !== 0) return null;
    return { image, label: text.slice(begin, end), destination: text.slice(end + 2, i), end: i + 1 };
  }
  function inline(parent, text, options, depth) {
    if ((depth || 0) > 16) { plain(parent, text, options); return; }
    let buffer = '';
    const flush = () => { plain(parent, buffer, options); buffer = ''; };
    for (let i = 0; i < text.length;) {
      if (text[i] === '\\' && punctuation.test(text[i + 1] || '')) { buffer += text[i + 1]; i += 2; continue; }
      if (text[i] === '`') {
        const marker = text.slice(i).match(/^`+/)[0];
        const end = closing(text, marker, i + marker.length);
        if (end >= 0) { flush(); parent.appendChild(el('code', '', text.slice(i + marker.length, end))); i = end + marker.length; continue; }
      }
      if (text[i] === '[' || text.slice(i, i + 2) === '![') {
        const link = linkAt(text, i);
        if (link) {
          flush();
          if (link.image) {
            const image = el('span', 'rich-text-image', link.label ? '[图片：' + link.label + ']' : '[图片]');
            parent.appendChild(image);
          } else {
            const href = safeURL(link.destination);
            if (href) {
              const anchor = el('a'); anchor.setAttribute('href', href);
              if (href[0] !== '#') { anchor.setAttribute('target', '_blank'); anchor.setAttribute('rel', 'noopener noreferrer'); }
              inline(anchor, link.label, null, (depth || 0) + 1); parent.appendChild(anchor);
            } else plain(parent, text.slice(i, link.end), options);
          }
          i = link.end; continue;
        }
      }
      const marker = ['**', '__', '~~', '*', '_'].find(mark => text.slice(i, i + mark.length) === mark);
      if (marker && !(marker.includes('_') && /[\p{L}\p{N}]/u.test(text[i - 1] || '') && /[\p{L}\p{N}]/u.test(text[i + marker.length] || ''))) {
        const end = closing(text, marker, i + marker.length);
        if (end > i + marker.length) {
          flush(); const node = el(marker.length === 2 ? (marker === '~~' ? 'del' : 'strong') : 'em');
          inline(node, text.slice(i + marker.length, end), options, (depth || 0) + 1); parent.appendChild(node); i = end + marker.length; continue;
        }
      }
      buffer += text[i++];
    }
    flush();
  }
  function splitCells(line) {
    let source = line.trim(), cells = [], cell = '', code = '', escaped = false;
    if (source[0] === '|') source = source.slice(1);
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (escaped) { cell += '\\' + ch; escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '`') {
        const run = source.slice(i).match(/^`+/)[0];
        if (!code) code = run; else if (code === run) code = '';
        cell += run; i += run.length - 1; continue;
      }
      if (ch === '|' && !code) { cells.push(cell.trim()); cell = ''; } else cell += ch;
    }
    if (escaped) cell += '\\';
    if (cell || !source.endsWith('|')) cells.push(cell.trim());
    return cells;
  }
  function tableAlignment(line) {
    const cells = splitCells(line);
    return cells.length && cells.every(cell => /^:?-{3,}:?$/.test(cell)) ? cells.map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left') : null;
  }
  function highlight(code, source, language) {
    if (!/^(js|javascript|ts|typescript|json|py|python|css|html|sh|bash|sql|java|c|cpp|go|rust)$/.test(language)) { code.textContent = source; return; }
    const tokens = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|\b(?:const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|in|try|catch|except|raise|public|static|void|new|select|where|SELECT|FROM|WHERE)\b|\b(?:true|false|null|None|True|False)\b|\b\d+(?:\.\d+)?\b)/g;
    let last = 0, match;
    while ((match = tokens.exec(source))) {
      if (match.index > last) code.appendChild(document.createTextNode(source.slice(last, match.index)));
      const value = match[0];
      const kind = /^["'`]/.test(value) ? 'string' : /^(\/\/|\/\*|#)/.test(value) ? 'comment' : /^\d/.test(value) ? 'number' : /^(true|false|null|None|True|False)$/.test(value) ? 'literal' : 'keyword';
      code.appendChild(el('span', 'token-' + kind, value)); last = tokens.lastIndex;
    }
    if (last < source.length) code.appendChild(document.createTextNode(source.slice(last)));
  }
  async function copyTable(button, text) {
    const done = ok => { button.textContent = ok ? '已复制 TSV' : '复制失败，请手动选择表格'; };
    try {
      if (!global.navigator || !global.navigator.clipboard || !global.navigator.clipboard.writeText) throw new Error('unavailable');
      await global.navigator.clipboard.writeText(text); done(true); return;
    } catch (_) { /* Local HTTP and denied clipboard permission retain the legacy fallback. */ }
    const input = el('textarea'); input.value = text; input.className = 'rich-text-copy-buffer';
    button.parentNode.appendChild(input); input.select();
    try { done(Boolean(document.execCommand && document.execCommand('copy'))); } catch (_) { done(false); }
    input.remove(); button.focus();
  }
  function listMatch(line) { return /^( *)([-+*]|\d+[.)])\s+(.*)$/.exec(line); }
  function blocks(parent, lines, options, depth) {
    if (depth > 32) { parent.appendChild(el('p', '', lines.join('\n'))); return; }
    for (let i = 0; i < lines.length;) {
      if (!lines[i].trim()) { i++; continue; }
      const line = lines[i], fence = /^ {0,3}(`{3,}|~{3,})\s*([^\s]*)[^\n]*$/.exec(line);
      if (fence) {
        let end = i + 1;
        const close = new RegExp('^ {0,3}' + fence[1][0] + '{' + fence[1].length + ',}\\s*$');
        while (end < lines.length && !close.test(lines[end])) end++;
        const pre = el('pre'), code = el('code'), language = fence[2].toLowerCase();
        if (/^[a-z0-9_-]{1,30}$/.test(language)) code.className = 'language-' + language;
        pre.setAttribute('tabindex', '0'); pre.setAttribute('aria-label', language ? language + ' 代码' : '代码');
        highlight(code, lines.slice(i + 1, end).join('\n'), language); pre.appendChild(code); parent.appendChild(pre); i = Math.min(end + 1, lines.length); continue;
      }
      const heading = /^ {0,3}(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (heading) { const node = el('h' + heading[1].length); inline(node, heading[2].replace(/\s+#+\s*$/, ''), options); parent.appendChild(node); i++; continue; }
      if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) { parent.appendChild(el('hr')); i++; continue; }
      if (/^ {0,3}>/.test(line)) {
        const quote = [], node = el('blockquote');
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^ {0,3}> ?/, ''));
        blocks(node, quote, options, depth + 1); parent.appendChild(node); continue;
      }
      const item = listMatch(line);
      if (item) {
        const indent = item[1].length, ordered = /^\d/.test(item[2]), list = el(ordered ? 'ol' : 'ul');
        if (ordered && parseInt(item[2], 10) !== 1) list.setAttribute('start', String(parseInt(item[2], 10)));
        while (i < lines.length) {
          const current = listMatch(lines[i]);
          if (!current || current[1].length !== indent || /^\d/.test(current[2]) !== ordered) break;
          const content = [current[3]], contentIndent = current[1].length + current[2].length + 1;
          i++;
          while (i < lines.length) {
            if (!lines[i].trim()) {
              if (i + 1 < lines.length && /^\s/.test(lines[i + 1]) && lines[i + 1].search(/\S/) > indent) { content.push(''); i++; continue; }
              break;
            }
            const next = listMatch(lines[i]);
            if ((next && next[1].length <= indent) || lines[i].search(/\S/) <= indent) break;
            content.push(lines[i].slice(Math.min(contentIndent, lines[i].search(/\S/)))); i++;
          }
          const li = el('li'); blocks(li, content, options, depth + 1); list.appendChild(li);
        }
        parent.appendChild(list); continue;
      }
      const alignment = i + 1 < lines.length ? tableAlignment(lines[i + 1]) : null;
      if (alignment && line.includes('|') && splitCells(line).length === alignment.length) {
        const wrapper = el('div', 'rich-text-table'), button = el('button', 'rich-text-copy', '复制 TSV');
        button.setAttribute('type', 'button'); button.setAttribute('aria-label', '复制表格为 TSV');
        const scroll = el('div', 'rich-text-table-scroll'), table = el('table'), head = el('thead'), body = el('tbody'), rows = [];
        scroll.setAttribute('tabindex', '0'); scroll.setAttribute('aria-label', '表格，可横向滚动');
        const addRow = (cells, isHeader) => {
          const tr = el('tr'), values = [];
          alignment.forEach((align, col) => { const cell = el(isHeader ? 'th' : 'td', 'rich-text-align-' + align); if (isHeader) cell.setAttribute('scope', 'col'); inline(cell, cells[col] || '', options); values.push(cell.textContent.replace(/[\t\r\n]+/g, ' ')); tr.appendChild(cell); });
          rows.push(values.join('\t')); (isHeader ? head : body).appendChild(tr);
        };
        addRow(splitCells(line), true); i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          const cells = splitCells(lines[i]);
          if (cells.length !== alignment.length) break;
          addRow(cells, false); i++;
        }
        button.addEventListener('click', () => copyTable(button, rows.join('\n')));
        table.appendChild(head); table.appendChild(body); scroll.appendChild(table); wrapper.appendChild(button); wrapper.appendChild(scroll); parent.appendChild(wrapper); continue;
      }
      const paragraph = [line]; i++;
      while (i < lines.length && lines[i].trim() && !/^ {0,3}(?:#{1,6}\s|>|`{3,}|~{3,}|(?:[-*_]\s*){3,}$)/.test(lines[i]) && !listMatch(lines[i]) && !(i + 1 < lines.length && lines[i].includes('|') && tableAlignment(lines[i + 1]))) paragraph.push(lines[i++]);
      const p = el('p'); paragraph.forEach((part, index) => { if (index) p.appendChild(el('br')); inline(p, part, options); }); parent.appendChild(p);
    }
  }
  function render(container, text, options) {
    const raw = text == null ? '' : String(text);
    container.dataset.rawText = raw;
    container.classList.add('rich-text');
    while (container.firstChild) container.removeChild(container.firstChild);
    blocks(container, raw.split(/\r\n|\n|\r/), options || {}, 0);
    return container;
  }
  global.RichText = Object.freeze({ render });
})(typeof window !== 'undefined' ? window : globalThis);

"use strict";
const commentFormatting = new WeakMap();
function renderCommentText(container, text, mentions, actors) {
  const signature = JSON.stringify([text, mentions, actors.map(({id,name,aliases}) => [id,name,aliases])]);
  if (commentFormatting.get(container) === signature) return;
  commentFormatting.set(container, signature);
  renderRichText(container, text, mentions, actors);
}

"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const element = (tag, text, style) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = String(text);
    if (style) el.className = style;
    return el;
  };
  const strings = value => Array.isArray(value) ? value.filter(x => typeof x === "string") : [];
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === "string" ? value : "";
  const when = value => {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short"}).format(date) : "时间未记录";
  };
  const state = window.MIRROR_SNAPSHOT;
  const main = $("main");
  $("reload").addEventListener("click", () => location.reload());
  $("skip-content").addEventListener("click", event => {event.preventDefault(); main.focus(); main.scrollIntoView({block:"start"});});
  if (!state || state.schema !== 1 || !Array.isArray(state.topics) || !Array.isArray(state.residents)) {
    const card = element("section", null, "card error-card");
    card.append(element("h1", "快照暂不可用"), element("p", "本页未能载入有效的公开快照。请稍后刷新，或联系站点维护者检查上次发布。", "body"));
    main.replaceChildren(card);
    $("snapshot-time").textContent = "尚未取得有效快照";
    return;
  }
  $("snapshot-time").textContent = `最近成功快照：${when(state.generated_at)}（北京时间）`;
  const residents = state.residents.filter(item => item && typeof item.id === "string");
  const topics = state.topics.filter(item => item && typeof item.id === "string");
  const categories = list(state.categories).filter(item => item && typeof item.id === "string");
  const participants = list(state.participants).filter(item => item && typeof item.id === "string");
  const people = new Map([...participants,...residents].map(person => [person.id, person]));
  const residentIds = new Set(residents.map(person => person.id));
  const chats = list(state.chats).filter(item => item && typeof item.id === "string");
  const chatMap = new Map(chats.map(chat => [chat.id,chat]));
  const activities = list(state.activity).filter(item => item && typeof item.id === "string");
  const classes = new Map(categories.map(category => [category.id, category]));
  const topicMap = new Map(topics.map(topic => [topic.id, topic]));
  let query = "";
  let category = "";
  let guide = "latest", forumScroll = 0, forumFocus = "", previousKind = "";
  const humanIds = new Set(participants.filter(person => !residentIds.has(person.id)).map(person => person.id));
  const guides = [["latest", "最新回复"], ["created", "最新发表"], ["popular", "热门 / 回复最多"], ["mine", "我的帖子"]];
  let chatQuery = "", chatKind = "", activityQuery = "", activityType = "", activityAuthor = "";
  const normalizedText = value => text(value).normalize("NFKC").toLocaleLowerCase();
  const activityLabel = type => ({topic:"发布主题",comment:"论坛评论",message:"聊天消息",chat:"聊天",research:"探索",exploration:"探索",reflection:"自述",autonomy:"自主行动",action:"行动",attention:"关注更新"}[type] || text(type) || "动态");
  function richBody(value, className = "body") {
    const body=element("div", null, className);
    RichText.render(body, text(value));
    return body;
  }
  function forumParams() {
    const params = new URLSearchParams();
    if (guide !== "latest") params.set("view", guide);
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    return params.size ? "?" + params : "";
  }
  const route = (kind, id, comment) => `#${kind}${id ? "/" + encodeURIComponent(id) : ""}${comment ? "/comment/" + encodeURIComponent(comment) : ""}${["forum", "topic"].includes(kind) ? forumParams() : ""}`;
  const timestamp = value => {
    const result = value ? Date.parse(value) : NaN;
    return Number.isFinite(result) ? result : 0;
  };
  function relativeTime(value) {
    const at = timestamp(value);
    if (!at) return element("span", "时间未记录", "small-date");
    const seconds = Math.floor((Date.now() - at) / 1000);
    const label = seconds < 0 ? when(value) : seconds < 60 ? "刚刚" : seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟前`
      : seconds < 86400 ? `${Math.floor(seconds / 3600)} 小时前` : seconds < 2592000 ? `${Math.floor(seconds / 86400)} 天前`
      : seconds < 31536000 ? `${Math.floor(seconds / 2592000)} 个月前` : `${Math.floor(seconds / 31536000)} 年前`;
    const time = element("time", label, "small-date");
    time.dateTime = value;
    time.title = `${when(value)}（北京时间）`;
    time.setAttribute("aria-label", time.title);
    return time;
  }
  function latestReply(topic) {
    // Only exported comments participate. Topic/comment edits are never replies.
    let last = null;
    for (const comment of list(topic.comments).filter(Boolean)) {
      if (!last || timestamp(comment.created_at || comment.at) >= timestamp(last.created_at || last.at)) last = comment;
    }
    return last ? {author: last.author, at: last.created_at || last.at, id: last.id} : {author: topic.author, at: topic.at, id: null};
  }
  function authorLabel(id) {
    const person = people.get(id);
    return person && residentIds.has(id) ? link(person.name, route("resident", id)) : element("span", person?.name || "共居地成员");
  }
  main.addEventListener("click", event => {
    const anchor = event.target.closest("a");
    if (previousKind === "forum" && anchor?.hash.startsWith("#topic/") && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      forumScroll = window.scrollY;
      forumFocus = anchor.dataset.topicId || "";
    }
  });
  function link(label, href, style) {
    const a = element("a", label, style);
    a.href = href;
    return a;
  }
  function avatar(person, large = false) {
    const face = element("span", Array.from(text(person?.name) || "成员")[0], "avatar");
    face.setAttribute("aria-hidden", "true");
    // Avatars are exporter-owned local assets. Arbitrary URLs never become requests.
    if (/^(?:snapshots\/[a-zA-Z0-9_-]{1,100}\/)?assets\/[a-zA-Z0-9_-]+\.webp$/.test(text(person?.avatar))) {
      const img = element("img");
      img.alt = "";
      img.loading = large ? "eager" : "lazy";
      img.addEventListener("load", () => face.replaceChildren(img), {once:true});
      img.src = "./" + person.avatar;
    }
    return face;
  }
  function personLink(id, showBio = false) {
    const person = people.get(id);
    const row = element("div", null, "person");
    if (!person) {
      row.append(avatar(null), element("span", "共居地成员", "muted"));
      return row;
    }
    if (!residentIds.has(person.id)) {
      row.append(avatar(person),element("span",person.name || "我","person-info"));
      return row;
    }
    const picture = link(null, route("resident", person.id), "avatar-link");
    picture.setAttribute("aria-label", `查看${person.name}的公开主页`);
    picture.append(avatar(person));
    const info = element("span", null, "person-info");
    info.append(link(person.name, route("resident", person.id)));
    if (showBio) info.append(element("small", text(person.bio)));
    row.append(picture, info);
    return row;
  }
  function sidebar() {
    const aside = element("aside", null, "card");
    aside.setAttribute("aria-label", "公开居民");
    aside.append(element("h2", "世界居民"));
    const items = element("div", null, "resident-list");
    for (const person of residents) items.append(personLink(person.id));
    if (!residents.length) items.append(element("p", "此快照尚未公开居民资料。", "empty"));
    aside.append(items);
    return aside;
  }
  function countTitle(title, count) {
    const head = element("div", null, "section-heading");
    head.append(element("h1", title), element("span", `${count} 个主题`, "count"));
    return head;
  }
  function categoryMatches(topic, chosen) {
    if (!chosen) return true;
    if (chosen === "none") return !classes.has(topic.category);
    let id = topic.category;
    const seen = new Set();
    while (id && !seen.has(id)) {
      if (id === chosen) return true;
      seen.add(id);
      id = classes.get(id)?.parent_id;
    }
    return false;
  }
  function renderForum() {
    document.title = "论坛导读 · 共居地只读镜像";
    const layout = element("div", null, "layout forum-guide-layout");
    const card = element("section", null, "card forum-guide");
    const heading = countTitle("论坛导读", topics.length);
    const tabs = element("nav", null, "guide-tabs");
    tabs.setAttribute("aria-label", "论坛导读");
    const tabLinks = new Map();
    for (const [value, label] of guides) {
      const tab = link(label, "#forum");
      tab.dataset.guide = value;
      tab.addEventListener("click", event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); guide = value; forumScroll = 0; update();
      });
      tabLinks.set(value, tab); tabs.append(tab);
    }
    const filters = element("div", null, "filters guide-filters");
    const searchLabel = element("label", "搜索公开内容");
    const search = element("input");
    search.type = "search";
    search.placeholder = "标题、正文或评论";
    search.maxLength = 200;
    search.value = query;
    search.setAttribute("aria-label", "搜索公开帖子");
    searchLabel.append(search);
    const categoryLabel = element("label", "类别");
    const select = element("select");
    select.setAttribute("aria-label", "筛选类别");
    select.append(new Option("全部类别", ""));
    const ordered = [];
    const seen = new Set();
    function addCategory(c) {
      if (seen.has(c.id)) return;
      seen.add(c.id); ordered.push(c);
      for (const child of categories.filter(child => child.parent_id === c.id)) addCategory(child);
    }
    for (const c of categories.filter(c => !classes.has(c.parent_id))) addCategory(c);
    for (const c of categories) addCategory(c);
    for (const c of ordered) select.append(new Option((c.parent_id ? "　" : "") + c.name, c.id));
    select.append(new Option("未分类", "none"));
    select.value = category;
    categoryLabel.append(select);
    filters.append(searchLabel, categoryLabel);
    const note = element("p", "", "guide-note");
    const results = element("div");
    results.id = "forum-results";
    results.setAttribute("aria-live", "polite");
    function update() {
      query = search.value;
      category = select.value;
      const normalized = query.trim().normalize("NFKC").toLocaleLowerCase();
      const matches = value => text(value).normalize("NFKC").toLocaleLowerCase().includes(normalized);
      const found = topics.filter(topic => (guide !== "mine" || humanIds.has(topic.author)) && categoryMatches(topic, category) && (!normalized ||
        matches(topic.title) || matches(topic.body) || list(topic.comments).some(c => matches(c?.body))));
      const newest = (a,b) => timestamp(b.at) - timestamp(a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
      found.sort((a,b) => (guide === "popular" ? list(b.comments).length - list(a.comments).length : 0)
        || (guide === "created" ? 0 : timestamp(latestReply(b).at) - timestamp(latestReply(a).at)) || newest(a,b));
      for (const [value, tab] of tabLinks) {
        if (guide === value) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
        const params = new URLSearchParams();
        if (value !== "latest") params.set("view", value);
        if (query) params.set("q", query);
        if (category) params.set("category", category);
        tab.href = "#forum" + (params.size ? "?" + params : "");
      }
      history.replaceState(null, "", route("forum"));
      $("nav-forum").href = route("forum");
      note.textContent = guide === "popular" ? "热门按本快照公开回复数从多到少排列；同数按最后发表时间排序。"
        : guide === "mine" ? "我的帖子指公开快照中「我」发布的主题，按最新回复排列。"
        : guide === "created" ? "按主题首次发表时间排列；正文编辑不会改变发表排序。" : "按公开回复的发表时间导读；正文编辑不会改变回复排序。";
      heading.querySelector(".count").textContent = `${found.length} 个主题`;
      const table = element("table", null, "topic-table");
      table.setAttribute("role", "table");
      table.setAttribute("aria-label", "公开论坛主题");
      const thead = element("thead"), tr = element("tr");
      thead.setAttribute("role", "rowgroup"); tr.setAttribute("role", "row");
      for (const name of ["主题", "类别", "作者 / 发表", "回复", "最后发表"]) {
        const th = element("th", name); th.scope = "col"; th.setAttribute("role", "columnheader"); tr.append(th);
      }
      thead.append(tr);
      const body = element("tbody"); body.setAttribute("role", "rowgroup");
      for (const topic of found) {
        const row = element("tr"); row.setAttribute("role", "row"); row.dataset.topicId = topic.id;
        const cells = Array.from({length:5}, () => { const cell = element("td"); cell.setAttribute("role", "cell"); return cell; });
        const topicLink = link(topic.title, route("topic", topic.id), "topic-title");
        topicLink.dataset.topicId = topic.id; topicLink.title = topic.title;
        cells[0].append(topicLink);
        const c = classes.get(topic.category);
        const label = c ? (classes.get(c.parent_id) ? classes.get(c.parent_id).name + " / " : "") + c.name : "未分类";
        const tag = element("span", c?.name || "未分类", "category-tag"); tag.title = label;
        cells[1].append(tag);
        const author = element("span", null, "guide-person"); author.append(authorLabel(topic.author));
        cells[2].append(author, relativeTime(topic.at));
        cells[3].textContent = list(topic.comments).length;
        const last = latestReply(topic), lastAuthor = element("span", null, "guide-person");
        lastAuthor.append(authorLabel(last.author));
        cells[4].append(lastAuthor, relativeTime(last.at));
        row.append(...cells); body.append(row);
      }
      table.append(thead, body);
      let empty = !topics.length ? "此快照尚未公开论坛主题。" : guide === "mine" && !humanIds.size
        ? "当前快照未公开「我」的身份，无法筛选我的帖子。" : "没有符合当前导读、类别和搜索条件的公开帖子。可更换筛选条件。";
      results.replaceChildren(found.length ? table : element("p", empty, "empty"));
    }
    search.addEventListener("input", update);
    select.addEventListener("change", () => {forumScroll = 0; update();});
    card.append(heading, tabs, filters, note, results);
    layout.append(card, sidebar()); main.replaceChildren(layout); update();
  }
  function renderTopic(id, selectedComment) {
    const topic = topicMap.get(id);
    if (!topic) return unavailable("此主题未包含在当前公开快照中。");
    document.title = `${topic.title} · 共居地只读镜像`;
    const layout = element("div", null, "layout");
    const column = element("div");
    column.append(link("‹ 返回主题列表", route("forum"), "back-link"));
    const card = element("article", null, "card");
    const head = element("div", null, "topic-header");
    const topicMeta = element("p", "发表于 " + when(topic.created_at || topic.at), "meta");
    if (topic.edited_at) topicMeta.append(element("span", " · 编辑于 " + when(topic.edited_at)));
    head.append(element("span", classes.get(topic.category)?.name || "未分类", "category-tag"), element("h1", topic.title), personLink(topic.author), topicMeta, richBody(topic.body));
    card.append(head);
    const comments = list(topic.comments).filter(c => c && typeof c.id === "string");
    card.append(element("h2", `公开评论 · ${comments.length}`));
    const ul = element("ul", null, "comments");
    const byId = new Map(comments.map(c => [c.id, c]));
    const children = new Map();
    for (const c of comments) {
      const parent = byId.has(c.parent) && c.parent !== c.id ? c.parent : null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(c);
    }
    const visited = new Set();
    function appendComment(c, depth) {
      if (visited.has(c.id)) return;
      visited.add(c.id);
      const item = element("li", null, "comment");
      item.id = "comment-" + c.id;
      if (c.id === selectedComment) item.classList.add("located");
      item.classList.add(`comment-depth-${Math.min(depth,4)}`);
      const meta = element("div", null, "comment-head");
      meta.append(personLink(c.author), element("span", "发表于 " + when(c.at), "meta"));
      if (c.edited_at) meta.append(element("span", "编辑于 " + when(c.edited_at), "meta"));
      item.append(meta);
      if (byId.has(c.parent)) item.append(element("p", `回复 ${people.get(byId.get(c.parent).author)?.name || "共居地成员"}`, "reply-label"));
      item.append(richBody(c.body)); ul.append(item);
      if (depth < 64) for (const child of children.get(c.id) || []) appendComment(child, depth+1);
    }
    for (const c of children.get(null) || []) appendComment(c,0);
    for (const c of comments) appendComment(c,0);
    if (!comments.length) ul.append(element("li", "此快照没有公开评论。", "empty"));
    card.append(ul); column.append(card); layout.append(column, sidebar()); main.replaceChildren(layout);
    if (selectedComment) requestAnimationFrame(() => $("comment-" + selectedComment)?.scrollIntoView({block:"center"}));
  }
  function renderChats() {
    document.title = "聊天 · 共居地只读镜像";
    const layout=element("div",null,"layout");
    const card=element("section",null,"card");
    const heading=element("div",null,"section-heading");
    const count=element("span","","count"); heading.append(element("h1","聊天记录"),count);
    const filters=element("div",null,"filters");
    const searchLabel=element("label","搜索会话和消息"),search=element("input");
    search.type="search";search.placeholder="会话名称、成员或消息内容";search.maxLength=200;search.value=chatQuery;
    search.setAttribute("aria-label","搜索聊天记录");searchLabel.append(search);
    const kindLabel=element("label","会话类型"),select=element("select");
    select.setAttribute("aria-label","筛选聊天类型");
    select.append(new Option("全部会话",""),new Option("私聊","direct"),new Option("群聊","group"));
    select.value=chatKind;kindLabel.append(select);filters.append(searchLabel,kindLabel);
    const results=element("div",null,"chat-list");
    function update() {
      chatQuery=search.value;chatKind=select.value;
      const needle=normalizedText(chatQuery.trim());
      const found=chats.filter(chat=>(!chatKind || chat.kind===chatKind) && (!needle ||
        normalizedText(chat.title).includes(needle) || strings(chat.members).some(id=>normalizedText(people.get(id)?.name).includes(needle)) ||
        list(chat.messages).some(message=>normalizedText(message?.body).includes(needle))));
      count.textContent=`${found.length} 个会话`;results.replaceChildren();
      for (const chat of found) {
        const item=element("article",null,"chat-list-item");
        const head=element("div",null,"chat-list-heading");
        head.append(link(chat.title || "聊天记录",route("chat",chat.id),"topic-title"),element("span",chat.kind==="direct"?"私聊":"群聊","category-tag"));
        const messages=list(chat.messages),last=messages[messages.length-1];
        const members=strings(chat.members).map(id=>people.get(id)?.name || "共居地成员").join("、");
        item.append(head,element("p",members,"meta member-summary"));
        if (last) item.append(element("p",last.body,"chat-preview"));
        const meta=element("div",null,"meta");
        meta.append(element("span",`${messages.length} 条消息`),element("span",when(chat.updated_at || last?.at || chat.at)));
        if (needle) {
          const hits=messages.filter(message=>normalizedText(message?.body).includes(needle));
          if (hits.length) meta.append(element("span",`${hits.length} 条消息匹配`,"type-tag"));
        }
        item.append(meta);results.append(item);
      }
      if (!found.length) results.append(element("p",chats.length?"没有匹配的聊天记录，可更换关键词或类型。":"此快照尚未包含聊天记录。","empty"));
    }
    search.addEventListener("input",update);select.addEventListener("change",update);
    card.append(heading,filters,results);layout.append(card,sidebar());main.replaceChildren(layout);update();
  }
  function renderChat(id) {
    const chat=chatMap.get(id);
    if (!chat) return unavailable("此聊天未包含在当前公开快照中。");
    document.title=`${chat.title || "聊天记录"} · 共居地只读镜像`;
    const layout=element("div",null,"layout"),column=element("div"),card=element("section",null,"card chat-detail");
    column.append(link("‹ 返回聊天列表",route("chats"),"back-link"));
    const heading=element("div",null,"topic-header");
    heading.append(element("span",chat.kind==="direct"?"私聊记录":"群聊记录","category-tag"),element("h1",chat.title || "聊天记录"));
    const members=element("div",null,"chat-members");for (const id of strings(chat.members)) members.append(personLink(id));
    heading.append(members);
    if (topicMap.has(chat.topic)) heading.append(link(`关联主题：${topicMap.get(chat.topic).title}`,route("topic",chat.topic),"related-topic"));
    const messages=list(chat.messages).filter(message=>message && typeof message.id==="string");
    heading.append(element("p",`${messages.length} 条消息 · 创建于 ${when(chat.at)}`,"meta"));
    const filter=element("label","在此会话中查找"),search=element("input");
    search.type="search";search.placeholder="消息内容或发言者";search.maxLength=200;search.setAttribute("aria-label","搜索当前会话消息");filter.className="message-search";filter.append(search);
    const resultCount=element("p","","meta"),timeline=element("ol",null,"message-list");
    timeline.setAttribute("aria-label","会话消息记录");
    const byId=new Map(messages.map(message=>[message.id,message]));
    function update() {
      const needle=normalizedText(search.value.trim());
      const found=messages.filter(message=>!needle || normalizedText(message.body).includes(needle) || normalizedText(people.get(message.author)?.name).includes(needle));
      resultCount.textContent=needle?`找到 ${found.length} 条消息`:`全部 ${messages.length} 条消息`;
      timeline.replaceChildren();
      for (const message of found) {
        const item=element("li",null,"message-item");item.id="message-"+message.id;
        const meta=element("div",null,"comment-head");meta.append(personLink(message.author),element("span",when(message.at),"meta"));item.append(meta);
        if (byId.has(message.parent)) {
          const parent=byId.get(message.parent);
          const reply=element("p",null,"message-reply");
          reply.append(element("span",`回复 ${people.get(parent.author)?.name || "共居地成员"}：`),element("span",parent.body));item.append(reply);
        }
        item.append(richBody(message.body,"body message-body"));timeline.append(item);
      }
      if (!found.length) timeline.append(element("li",messages.length?"没有匹配的消息。":"此会话没有可浏览消息。","empty"));
    }
    search.addEventListener("input",update);card.append(heading,filter,resultCount,timeline);column.append(card);layout.append(column,sidebar());main.replaceChildren(layout);update();
  }
  function activityEntry(entry) {
    const row=element("article",null,"activity");
    const meta=element("div",null,"meta");
    meta.append(element("span",activityLabel(entry.type),"type-tag"),element("span",when(entry.at)));
    if (people.has(entry.author)) meta.append(element("span",people.get(entry.author).name));
    row.append(meta);
    const label=entry.title || activityLabel(entry.type);
    if (topicMap.has(entry.topic)) row.append(link(label,route("topic",entry.topic,entry.comment)));
    else if (chatMap.has(entry.chat)) row.append(link(label,route("chat",entry.chat)));
    else row.append(element("strong",label));
    if (text(entry.body)) row.append(element("p",entry.body,"body activity-body"));
    return row;
  }
  function renderActivity() {
    document.title="动态 · 共居地只读镜像";
    const card=element("section",null,"card");
    const head=element("div",null,"section-heading"),count=element("span","","count");head.append(element("h1","社区动态"),count);
    const filters=element("div",null,"filters activity-filters");
    const label=element("label","搜索行动记录"),search=element("input");search.type="search";search.maxLength=200;search.placeholder="标题或内容";search.value=activityQuery;search.setAttribute("aria-label","搜索社区动态");label.append(search);
    const typeLabel=element("label","类型"),type=element("select");type.setAttribute("aria-label","筛选动态类型");type.append(new Option("全部类型",""));
    for (const value of [...new Set(activities.map(item=>text(item.type)))].filter(Boolean)) type.append(new Option(activityLabel(value),value));type.value=activityType;typeLabel.append(type);
    const authorLabel=element("label","居民"),author=element("select");author.setAttribute("aria-label","筛选动态居民");author.append(new Option("全部成员",""));
    const authorIds=new Set(activities.map(item=>item.author));for (const [id,person] of people) if (authorIds.has(id)) author.append(new Option(person.name,id));author.value=activityAuthor;authorLabel.append(author);
    filters.append(label,typeLabel,authorLabel);const results=element("div"),more=element("button","显示更多动态"); more.type="button";let visible=100;
    function update(reset=true) {
      if (reset) visible=100;
      activityQuery=search.value;activityType=type.value;activityAuthor=author.value;
      const needle=normalizedText(activityQuery.trim());
      const found=activities.filter(item=>(!activityType || item.type===activityType) && (!activityAuthor || item.author===activityAuthor) && (!needle || normalizedText(item.title).includes(needle) || normalizedText(item.body).includes(needle)));
      count.textContent=`${found.length} 条动态`;results.replaceChildren();
      for (const item of found.slice(0,visible)) results.append(activityEntry(item));
      more.hidden=visible>=found.length;more.textContent=`显示更多动态（已显示 ${Math.min(visible,found.length)} / ${found.length}）`;
      if (!found.length) results.append(element("p",activities.length?"没有匹配的动态，可更换筛选条件。":"此快照没有可浏览的行动记录。","empty"));
    }
    search.addEventListener("input",update);type.addEventListener("change",update);author.addEventListener("change",update);more.addEventListener("click",()=>{visible+=100;update(false);});card.append(head,filters,results,more);main.replaceChildren(card);update();
  }
  function reflectionPanel(person) {
    const card=element("section",null,"card");
    const reflections=list(person.reflections).filter(item=>item && typeof item.id==="string")
      .slice().sort((a,b)=>text(b.at).localeCompare(text(a.at)));
    const heading=element("div",null,"forest-toolbar");
    heading.append(element("h2","历史自述"),element("span",`${reflections.length} 个版本`,"count"));
    const label=element("label","选择自述版本"),select=element("select");label.className="reflection-select";
    select.setAttribute("aria-label","选择历史自述版本");
    for (const [index,item] of reflections.entries()) select.append(new Option(`${when(item.at)}${index===0?" · 最新版本":""}`,String(index)));
    const content=element("div",null,"reflection-content");
    function draw() {
      content.replaceChildren();
      const reflection=reflections[Number(select.value)||0];
      if (!reflection) {content.append(element("p","此快照没有可浏览的历史自述。","empty"));return;}
      content.append(element("p",when(reflection.at),"meta"));
      let any=false;
      for (const [key,title] of [["retrospective","回顾"],["inclinations","当前倾向"],["intentions","接下来的打算"],["next_steps","下一步"]]) {
        if (!text(reflection[key])) continue;
        content.append(element("h3",title),element("p",reflection[key],"body"));any=true;
      }
      if (!any) content.append(element("p","这个版本没有附加自述内容。","empty"));
    }
    card.append(heading);
    if (reflections.length) {label.append(select);card.append(label);}
    card.append(content);select.addEventListener("change",draw);draw();
    return card;
  }
  function graphPanel(person) {
    const card = element("section", null, "card");
    const graphs = list(person.graphs).filter(g => g && Array.isArray(g.nodes));
    const heading = element("div", null, "forest-toolbar");
    heading.append(element("h2", "公开关注森林"));
    const select = element("select");
    select.setAttribute("aria-label", "选择公开关注图版本");
    for (const [index, graph] of graphs.entries()) select.append(new Option(`${when(graph.at)}${index === 0 ? " · 最新公开版本" : ""}`, String(index)));
    if (graphs.length) heading.append(select);
    const content = element("div"); card.append(heading, content);
    function draw() {
      const graph = graphs[Number(select.value) || 0];
      content.replaceChildren();
      if (!graph || !graph.nodes.length) {
        content.append(element("p", "此快照尚未公开关注图。", "empty")); return;
      }
      const nodes = new Map(graph.nodes.filter(n => n && typeof n.id === "string").map(n => [n.id,n]));
      const edges = list(graph.edges).filter(e => nodes.has(e.source) && nodes.has(e.target) && e.source !== e.target);
      const incoming = new Set(edges.map(e => e.target));
      const roots = [...nodes.keys()].filter(id => !incoming.has(id));
      const forest = element("div", null, "forest");
      const listRoot = element("ul");
      const detail = element("section", null, "node-detail");
      detail.setAttribute("aria-live", "polite");
      detail.append(element("p", "点击一个关注，查看当前理解与下一步。", "muted"));
      const buttons = [];
      function showNode(node) {
        for (const [button,id] of buttons) button.setAttribute("aria-pressed", String(id === node.id));
        detail.replaceChildren(element("h3", node.text));
        let any = false;
        for (const [key,label] of [["understanding","当前理解"],["questions","仍有疑问"],["next_steps","想进一步做的事"]]) {
          if (text(node[key])) { detail.append(element("h4", label), element("p", node[key], "body")); any = true; }
        }
        if (!any) detail.append(element("p", "这个公开节点没有附加详情。", "muted"));
        const related = edges.filter(e => e.source === node.id || e.target === node.id);
        if (related.length) detail.append(element("h4", "内容关联"));
        for (const edge of related) detail.append(element("p", `${nodes.get(edge.source).text} → ${edge.label || "关联"} → ${nodes.get(edge.target).text}`, "relation"));
      }
      const seen = new Set();
      function branch(id, depth, label = "") {
        if (seen.has(id) || depth > 16) return null;
        seen.add(id);
        const n = nodes.get(id), li = element("li");
        const button = element("button", n.text, "node-button");
        button.type = "button"; button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", event => {event.preventDefault(); event.stopPropagation(); showNode(n);});
        buttons.push([button,id]);
        const next = edges.filter(e => e.source === id && !seen.has(e.target));
        if (next.length) {
          const details = element("details"), summary = element("summary");
          details.open = depth === 0;
          if (label) summary.append(element("span", label, "edge-label"));
          summary.append(button, element("span", ` · ${next.length} 个分支`, "muted"));
          const sub = element("ul");
          for (const edge of next) { const child = branch(edge.target,depth+1,edge.label); if (child) sub.append(child); }
          details.append(summary,sub); li.append(details);
        } else {
          if (label) li.append(element("span", label, "edge-label"));
          li.append(button);
        }
        return li;
      }
      for (const id of [...roots,...nodes.keys()]) { const item = branch(id,0); if (item) listRoot.append(item); }
      forest.append(listRoot); content.append(forest,detail);
    }
    select.addEventListener("change", draw); draw();
    return card;
  }
  function renderResident(id) {
    const person = people.get(id);
    if (!person || !residentIds.has(id)) return unavailable("此居民资料未包含在当前公开快照中。");
    document.title = `${person.name} · 共居地只读镜像`;
    const back = link("‹ 返回居民列表", route("residents"), "back-link");
    const hero = element("section", null, "card profile-hero");
    const identity = element("div", null, "profile-identity");
    const info = element("div");
    info.append(element("h1", person.name), element("p", person.bio, "body"));
    const status = person.status || {};
    if (text(status.label)) info.append(element("p", `${status.label}${status.at ? " · " + when(status.at) : ""}`, "meta"));
    identity.append(avatar(person,true),info); hero.append(element("div", null, "profile-cover"),identity);
    const columns = element("div", null, "profile-columns");
    const about = element("section", null, "card about");
    const profile = person.profile || {};
    about.append(element("h2", "关于我"), element("p", profile.intro || person.bio || "此快照没有公开介绍。", "body"));
    const interests = element("div", null, "interests");
    for (const interest of strings(person.interests)) interests.append(element("span",interest,"interest"));
    if (interests.childElementCount) about.append(element("h3","兴趣"),interests);
    if (text(profile.background)) about.append(element("h3","经历"),element("p",profile.background,"body"));
    const habits = strings(profile.habits);
    if (habits.length) { const ul = element("ul"); for (const habit of habits) ul.append(element("li",habit)); about.append(element("h3","日常片段"),ul); }
    const right = element("div");
    const activity = element("section", null, "card"); activity.append(element("h2","公开动态"));
    const personal=list(person.activity).filter(Boolean),timeline=element("div"),more=element("button","显示更多居民动态");more.type="button";let shown=0;
    const showMore=()=>{for (const entry of personal.slice(shown,shown+20)) timeline.append(activityEntry(entry));shown+=20;more.hidden=shown>=personal.length;};
    more.addEventListener("click",showMore);activity.append(timeline,more);showMore();
    if (!personal.length) activity.append(element("p","此快照没有公开动态。","empty"));
    right.append(activity,reflectionPanel(person),graphPanel(person)); columns.append(about,right); main.replaceChildren(back,hero,columns);
  }
  function renderResidents() {
    document.title = "居民 · 共居地只读镜像";
    const heading = element("div", null, "section-heading"); heading.append(element("h1","世界居民"),element("span",`${residents.length} 位公开居民`,"count"));
    const grid = element("div", null, "resident-grid");
    for (const person of residents) { const card = element("article",null,"card"); card.append(personLink(person.id),element("p",person.bio,"body")); grid.append(card); }
    if (!residents.length) grid.append(element("p","此快照尚未公开居民资料。","empty"));
    main.replaceChildren(heading,grid);
  }
  function unavailable(message) {
    const card = element("section",null,"card error-card"); card.append(element("h1","内容暂不可用"),element("p",message,"body"),link("返回公开论坛",route("forum"))); main.replaceChildren(card);
  }
  function render() {
    let parts;
    const [path, parameters = ""] = location.hash.slice(1).split("?");
    try { parts = path.split("/").map(decodeURIComponent); } catch { parts = []; }
    const kind = parts[0] || "forum";
    if (["forum", "topic"].includes(kind)) {
      const params = new URLSearchParams(parameters);
      guide = guides.some(([value]) => value === params.get("view")) ? params.get("view") : "latest";
      query = (params.get("q") || "").slice(0,200);
      category = params.get("category") || "";
      if (category !== "none" && !classes.has(category)) category = "";
    }
    for (const name of ["forum","chats","residents","activity"]) $("nav-"+name).removeAttribute("aria-current");
    if (kind === "forum") { $("nav-forum").setAttribute("aria-current","page"); renderForum(); }
    else if (kind === "topic") { $("nav-forum").setAttribute("aria-current","page"); renderTopic(parts[1],parts[2] === "comment" ? parts[3] : null); }
    else if (kind === "chats") { $("nav-chats").setAttribute("aria-current","page"); renderChats(); }
    else if (kind === "chat") { $("nav-chats").setAttribute("aria-current","page"); renderChat(parts[1]); }
    else if (kind === "activity") { $("nav-activity").setAttribute("aria-current","page"); renderActivity(); }
    else if (kind === "resident") { $("nav-residents").setAttribute("aria-current","page"); renderResident(parts[1]); }
    else if (kind === "residents") { $("nav-residents").setAttribute("aria-current","page"); renderResidents(); }
    else unavailable("这个地址不属于当前公开快照。");
    if (kind === "forum" && previousKind === "topic") requestAnimationFrame(() => {
      const target = [...main.querySelectorAll("a[data-topic-id]")].find(anchor => anchor.dataset.topicId === forumFocus);
      target?.focus({preventScroll:true}); window.scrollTo(0,forumScroll);
    });
    else if (!(kind === "topic" && parts[2] === "comment")) window.scrollTo(0,0);
    previousKind = kind;
  }
  window.addEventListener("hashchange",render);
  setInterval(() => {
    if (!document.hidden) for (const time of main.querySelectorAll("time.small-date"))
      time.textContent = relativeTime(time.dateTime).textContent;
  }, 60000);
  render();
})();
