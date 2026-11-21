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
  const people = new Map(residents.map(person => [person.id, person]));
  const classes = new Map(categories.map(category => [category.id, category]));
  const topicMap = new Map(topics.map(topic => [topic.id, topic]));
  let query = "";
  let category = "";
  const route = (kind, id, comment) => `#${kind}${id ? "/" + encodeURIComponent(id) : ""}${comment ? "/comment/" + encodeURIComponent(comment) : ""}`;
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
    document.title = "论坛 · 共居地只读镜像";
    const layout = element("div", null, "layout");
    const card = element("section", null, "card");
    const heading = countTitle("论坛", topics.length);
    const filters = element("div", null, "filters");
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
    for (const c of categories) select.append(new Option((c.parent_id ? "　" : "") + c.name, c.id));
    select.append(new Option("未分类", "none"));
    select.value = category;
    categoryLabel.append(select);
    filters.append(searchLabel, categoryLabel);
    const results = element("div");
    function update() {
      query = search.value;
      category = select.value;
      const normalized = query.trim().normalize("NFKC").toLocaleLowerCase();
      const matches = value => text(value).normalize("NFKC").toLocaleLowerCase().includes(normalized);
      const found = topics.filter(topic => categoryMatches(topic, category) && (!normalized ||
        matches(topic.title) || matches(topic.body) || list(topic.comments).some(c => matches(c?.body))));
      heading.querySelector(".count").textContent = `${found.length} 个主题`;
      const table = element("table", null, "topic-table");
      table.setAttribute("aria-label", "公开论坛主题");
      const thead = element("thead"), tr = element("tr");
      for (const name of ["标题", "类别", "作者", "回复", "最后活动"]) {
        const th = element("th", name); th.scope = "col"; tr.append(th);
      }
      thead.append(tr);
      const body = element("tbody");
      for (const topic of found) {
        const row = element("tr");
        const cells = Array.from({length:5}, () => element("td"));
        cells[0].append(link(topic.title, route("topic", topic.id), "topic-title"));
        cells[1].append(element("span", classes.get(topic.category)?.name || "未分类", "category-tag"));
        const person = people.get(topic.author);
        cells[2].append(person ? link(person.name, route("resident", person.id)) : document.createTextNode("共居地成员"));
        cells[3].textContent = list(topic.comments).length;
        cells[4].append(element("span", when(topic.updated_at || topic.at), "small-date"));
        row.append(...cells); body.append(row);
      }
      table.append(thead, body);
      results.replaceChildren(found.length ? table : element("p", topics.length ? "没有找到匹配的公开帖子，可更换关键词或类别。" : "此快照尚未公开论坛主题。", "empty"));
    }
    search.addEventListener("input", update);
    select.addEventListener("change", update);
    card.append(heading, filters, results);
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
    head.append(element("span", classes.get(topic.category)?.name || "未分类", "category-tag"), element("h1", topic.title), personLink(topic.author), element("p", when(topic.at), "meta"), element("p", topic.body, "body"));
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
      meta.append(personLink(c.author), element("span", when(c.at), "meta"));
      item.append(meta);
      if (byId.has(c.parent)) item.append(element("p", `回复 ${people.get(byId.get(c.parent).author)?.name || "共居地成员"}`, "reply-label"));
      item.append(element("p", c.body, "body")); ul.append(item);
      if (depth < 64) for (const child of children.get(c.id) || []) appendComment(child, depth+1);
    }
    for (const c of children.get(null) || []) appendComment(c,0);
    for (const c of comments) appendComment(c,0);
    if (!comments.length) ul.append(element("li", "此快照没有公开评论。", "empty"));
    card.append(ul); column.append(card); layout.append(column, sidebar()); main.replaceChildren(layout);
    if (selectedComment) requestAnimationFrame(() => $("comment-" + selectedComment)?.scrollIntoView({block:"center"}));
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
    if (!person) return unavailable("此居民资料未包含在当前公开快照中。");
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
    let count = 0;
    for (const entry of list(person.activity)) {
      if (!entry || !topicMap.has(entry.topic)) continue;
      const row = element("article", null, "activity"), meta = element("div", null, "meta");
      meta.append(element("span",entry.type === "comment" ? "论坛评论" : "发布主题","type-tag"),element("span",when(entry.at)));
      row.append(meta,link(entry.title,route("topic",entry.topic,entry.comment))); activity.append(row); count++;
    }
    if (!count) activity.append(element("p","此快照没有公开动态。","empty"));
    right.append(activity,graphPanel(person)); columns.append(about,right); main.replaceChildren(back,hero,columns);
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
    try { parts = location.hash.slice(1).split("/").map(decodeURIComponent); } catch { parts = []; }
    const kind = parts[0] || "forum";
    $("nav-forum").removeAttribute("aria-current"); $("nav-residents").removeAttribute("aria-current");
    if (kind === "forum") { $("nav-forum").setAttribute("aria-current","page"); renderForum(); }
    else if (kind === "topic") { $("nav-forum").setAttribute("aria-current","page"); renderTopic(parts[1],parts[2] === "comment" ? parts[3] : null); }
    else if (kind === "resident") { $("nav-residents").setAttribute("aria-current","page"); renderResident(parts[1]); }
    else if (kind === "residents") { $("nav-residents").setAttribute("aria-current","page"); renderResidents(); }
    else unavailable("这个地址不属于当前公开快照。");
    if (!(kind === "topic" && parts[2] === "comment")) window.scrollTo(0,0);
  }
  window.addEventListener("hashchange",render); render();
})();
