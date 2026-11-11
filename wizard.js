// Анкета настройки целей — по записи экрана продукта: 8 шагов, затем «Ваши ежедневные цели настроены».
// Здесь только разметка и поведение шагов. Полёт целей (в полоску шагов, на финал, в медали профиля)
// делает основной скрипт: он подписывается на Wizard.on.close / .final / .done.
(() => {
  const ICON = (n) => `assets/goals/g-${n}.svg`;
  const nb = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const dec = (n) => n.toFixed(1).replace('.', ',');
  const CHEV = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="#2b6cfc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CROSS = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#2b6cfc" stroke-width="2" stroke-linecap="round"/></svg>';
  const HEART = '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="#2b6cfc"/></svg>';
  const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#21a453"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const STATUS = document.querySelector('.profile .header').innerHTML.replace(/<button[\s\S]*?<\/button>/, '');

  // значения шагов — общие для анкеты, финала и экрана «Цели»
  const val = { weight: 52, kcal: 1377, steps: 7000, water: 1.6, burn: 250, sleep: 8 };
  const STEPS = [
    { id: 'params', icon: 'walk', title: 'Параметры для расчёта', text: 'Проверьте свои данные перед постановкой целей. Это поможет правильно рассчитать дневные нормы всех показателей',
      body: () => `<div class="wz-fields"><div class="wz-f"><span>Пол</span><b>Мужской</b></div><div class="wz-f"><span>Рост</span><b>165 см</b></div><div class="wz-f"><span>Вес</span><b>52 кг</b></div><div class="wz-f wide"><span>Дата рождения и возраст</span><b>26 марта 1991 · 35 лет</b></div></div>` },
    { id: 'level', icon: 'walk', title: 'Ваша активность', text: 'Укажите ваш привычный уровень активности за неделю',
      body: () => '<div class="wz-opts">' + [['Низкая активность', 'Почти не тренируюсь, большую часть дня провожу сидя'], ['Лёгкая активность', '1–3 тренировки в неделю'], ['Регулярная активность', '3–5 тренировок в неделю'], ['Высокая активность', '6–7 тренировок в неделю или активно двигаюсь почти каждый день']]
        .map(([b, s], i) => `<button class="wz-opt${i ? '' : ' on'}" type="button"><b>${b}</b><span>${s}</span></button>`).join('') + '</div>' },
    { id: 'weight', obj: 'scale', icon: 'scales', title: 'Желаемый вес', text: 'Задайте целевой вес и срок для плавного и безопасного прогресса',
      num: { key: 'weight', step: 1, unit: 'кг', fmt: nb }, after: `<div class="wz-ok" style="background:#edf2ff">${HEART}Поддержание веса</div>` },
    { id: 'meal', obj: 'bowl', icon: 'meal', title: 'Питание', text: 'Система подобрала суточную калорийность и баланс БЖУ для вашей цели по весу', tag: `${HEART}<span data-v="weight">52</span>&nbsp;кг`,
      num: { key: 'kcal', step: 10, unit: 'ккал', fmt: nb }, ruler: false,
      after: `<div class="wz-ok">${CHECK}Подходит для вашей цели</div><div class="wz-macro"><h3>Макронутриенты</h3>` +
        [['Белки', '69 г', '20%', 20], ['Жиры', '46 г', '30%', 30], ['Углеводы', '172 г', '50%', 50]].map(([n, g, p, w]) => `<div class="wz-mrow"><span>${n}</span><span>${g} <em>· ${p}</em></span></div><div class="wz-track"><i style="width:${w}%"></i></div>`).join('') + '</div>' },
    { id: 'walk', obj: 'shoe', icon: 'walk', title: 'Шаги', text: 'Задайте планку по шагам, которую вам комфортно выполнять каждый день', skip: true,
      num: { key: 'steps', step: 500, unit: '', fmt: nb }, chips: [[7000, '7 000'], [10000, '10 000'], [12000, '12 000']] },
    { id: 'water', obj: 'bottle', icon: 'water', title: 'Вода', text: 'Укажите объём воды, который планируете выпивать за сутки', skip: true,
      num: { key: 'water', step: 0.1, unit: 'л', fmt: dec }, chips: [[2, '2,0 л'], [3, '3,0 л'], [4, '4,0 л']] },
    { id: 'fire', obj: 'bars', icon: 'fire', title: 'Активность', text: 'Установите дополнительный расход калорий за счёт тренировок и спорта', skip: true,
      num: { key: 'burn', step: 10, unit: 'ккал', fmt: nb }, chips: [[150, '150 ккал'], [200, '200 ккал'], [300, '300 ккал']] },
    { id: 'sleep', obj: 'moon', icon: 'sleep', title: 'Сон', text: 'Укажите время отдыха, при котором вы чувствуете себя бодро', skip: true,
      body: () => `<div class="wz-num" style="justify-content:center"><span class="wz-val">8<small>ч</small>&nbsp;00<small>мин</small></span></div><div class="wz-wheel"><span>06</span><span>50</span><span>07</span><span>55</span><span class="sel">08</span><span class="sel">00</span><span>09</span><span>05</span><span>10</span><span>10</span></div>`,
      chips: [[7.5, '7 ч 30 мин'], [8, '8 ч'], [9.5, '9 ч 30 мин']], chipKey: 'sleep' },
  ];

  const ruler = () => {                                       // линейка: точки по краям, у значения — штрихи
    let s = '';
    for (let i = -16; i <= 16; i++) {
      const x = 172 + i * 10.6, d = Math.abs(i);
      s += d <= 5 ? `<rect x="${(x - 1).toFixed(1)}" y="${(20 - (24 - d * 3.6)).toFixed(1)}" width="2" height="${(24 - d * 3.6).toFixed(1)}" rx="1" fill="#2b6cfc" opacity="${(1 - d * 0.12).toFixed(2)}"/>` : `<circle cx="${x.toFixed(1)}" cy="19" r="1.2" fill="#c4cde0"/>`;
    }
    return `<svg class="wz-ruler" width="345" height="22" viewBox="0 0 345 22">${s}</svg>`;
  };
  const stepHTML = (st) => {
    let h = `<div class="wz-head"><h2><img src="${ICON(st.icon)}" alt="">${st.title}</h2><p>${st.text}</p>${st.tag ? `<span class="wz-tag">${st.tag}</span>` : ''}</div>`;
    if (st.num) h += `<div class="wz-num"><button class="wz-pm" type="button" data-d="-1" aria-label="Меньше">−</button><span class="wz-val"><span data-v="${st.num.key}">${st.num.fmt(val[st.num.key])}</span>${st.num.unit ? `<small>${st.num.unit}</small>` : ''}</span><button class="wz-pm" type="button" data-d="1" aria-label="Больше">+</button></div>` + (st.ruler === false ? '' : ruler());
    if (st.body) h += st.body();
    if (st.chips) h += '<div class="wz-chips">' + st.chips.map(([v, t]) => `<button class="wz-chip" type="button" data-c="${v}">${t}</button>`).join('') + '</div>';
    if (st.after) h += st.after;
    return h;
  };
  const cardsHTML = () => `
    <div class="gcard wide"><h4><img src="${ICON('scales')}" alt="">Вес</h4><div class="v"><span data-v="weight">${nb(val.weight)}</span><small>кг</small></div></div>
    <div class="gcard wide"><h4><img src="${ICON('meal')}" alt="">Питание</h4><div class="v"><span data-v="kcal">${nb(val.kcal)}</span><small>ккал</small></div>
      <div class="bju"><span><i style="background:#4b57e8"></i>Белки<b>69<small>г</small></b></span><span><i style="background:#8a4fe0"></i>Жиры<b>46<small>г</small></b></span><span><i style="background:#f07a4f"></i>Углеводы<b>172<small>г</small></b></span></div></div>
    <div class="gcard"><h4><img src="${ICON('fire')}" alt="">Активность</h4><div class="v"><span data-v="burn">${nb(val.burn)}</span><small>ккал</small></div></div>
    <div class="gcard"><h4><img src="${ICON('walk')}" alt="">Шаги</h4><div class="v"><span data-v="steps">${nb(val.steps)}</span></div></div>
    <div class="gcard"><h4><img src="${ICON('sleep')}" alt="">Сон</h4><div class="v"><span data-v="sleep">8</span><small>ч</small></div></div>
    <div class="gcard"><h4><img src="${ICON('water')}" alt="">Вода</h4><div class="v"><span data-v="water">${dec(val.water)}</span><small>л</small></div></div>`;

  // ---------- разметка ----------
  const wiz = document.createElement('section');
  wiz.className = 'wiz'; wiz.setAttribute('aria-label', 'Настройка целей');
  wiz.innerHTML = `
    <div class="wz-status header" style="background:none">${STATUS}</div>
    <div class="wz-nav"><button type="button" id="wz-back" aria-label="Назад">${CHEV}</button><button type="button" id="wz-close" aria-label="Закрыть">${CROSS}</button></div>
    <div class="wz-bar" aria-hidden="true">${STEPS.map(() => '<i></i>').join('')}</div>
    <div class="wz-steps">${STEPS.map((st) => `<div class="wz-step" data-id="${st.id}">${stepHTML(st)}</div>`).join('')}</div>
    <div class="wz-foot"><button class="btn" id="wz-skip" type="button">Пропустить</button><button class="btn btn-primary" id="wz-next" type="button">Далее</button></div>
    <div class="wz-done">
      <button class="wz-x" type="button" id="wz-x" aria-label="Закрыть">${CROSS}</button>
      <div class="wz-art" aria-hidden="true"></div>
      <h2 class="wz-title rise"><span>Ваши ежедневные</span><span>цели настроены</span></h2>
      <p class="rise">Все выбранные ориентиры сохранены как цели. По ним приложение будет помогать следить за прогрессом и подбирать рекомендации.<br><br>Посмотреть или изменить их можно в профиле в разделе «Мои цели»</p>
      <div class="goal-cards rise">${cardsHTML()}</div>
    </div>
    <div class="wz-done-foot"><button class="btn btn-primary" id="wz-done" type="button">Отлично</button></div>`;
  const fly = document.querySelector('.intro .fly');
  fly.before(wiz);

  // экран «Цели» — открывается из профиля, когда цели настроены
  const gs = document.createElement('section');
  gs.className = 'goalscr'; gs.id = 'goalscr'; gs.setAttribute('aria-label', 'Цели');
  gs.innerHTML = `<div class="gs-scroll"><div class="gs-top"><svg class="gs-art" width="393" height="236" viewBox="0 0 393 236" aria-hidden="true"></svg>
      <div class="wz-status header" style="background:none">${STATUS}</div>
      <div class="wz-nav"><button type="button" id="gs-back" aria-label="Назад">${CHEV}</button><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="#2b6cfc" stroke-width="1.8"/><path d="M12 10.5v6" stroke="#2b6cfc" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.1" fill="#2b6cfc"/></svg></div>
      <h2>Цели</h2></div><div class="goal-cards">${cardsHTML()}</div></div>
    <nav class="p-tabbar" aria-label="Разделы">${document.querySelector('.profile .p-tabbar').innerHTML.replace('id="tab-stats"', 'id="gs-tab-stats"')}</nav>`;
  document.querySelector('.screen').appendChild(gs);

  // ---------- поведение ----------
  const $$ = (q) => [...wiz.querySelectorAll(q)];
  const steps = $$('.wz-step'), segs = $$('.wz-bar i'), foot = wiz.querySelector('.wz-foot');
  let cur = 0;
  const on = { close() {}, final() {}, done() {} };
  const paint = () => {
    steps.forEach((s, i) => { s.classList.toggle('cur', i === cur); s.classList.toggle('past', i < cur); });
    segs.forEach((s, i) => { s.classList.toggle('done', i < cur); s.classList.toggle('cur', i === cur); });
    foot.classList.toggle('skip', !!STEPS[cur].skip);
  };
  const show = (k) => { document.querySelectorAll(`[data-v="${k}"]`).forEach((e) => { e.textContent = k === 'water' ? dec(val[k]) : k === 'sleep' ? String(val[k]).replace('.5', ',5') : nb(val[k]); }); };
  const go = (i) => { cur = Math.max(0, Math.min(STEPS.length - 1, i)); paint(); };
  const next = () => { if (wiz.classList.contains('final')) return; if (cur < STEPS.length - 1) go(cur + 1); else on.final(); };
  const back = () => { if (cur > 0) go(cur - 1); else on.close(); };

  wiz.querySelector('#wz-next').addEventListener('click', next);
  wiz.querySelector('#wz-skip').addEventListener('click', next);
  wiz.querySelector('#wz-back').addEventListener('click', back);
  wiz.querySelector('#wz-close').addEventListener('click', () => on.close());
  wiz.querySelector('#wz-x').addEventListener('click', () => on.done());
  wiz.querySelector('#wz-done').addEventListener('click', () => on.done());
  wiz.addEventListener('click', (e) => {
    const pm = e.target.closest('.wz-pm'), chip = e.target.closest('.wz-chip'), opt = e.target.closest('.wz-opt');
    const st = STEPS[cur];
    if (pm && st.num) { const n = st.num; val[n.key] = Math.max(0, Math.round((val[n.key] + n.step * +pm.dataset.d) * 10) / 10); show(n.key); }
    if (chip) { const k = st.chipKey || st.num.key; chip.parentNode.querySelectorAll('.wz-chip').forEach((c) => c.classList.toggle('on', c === chip)); val[k] = +chip.dataset.c; show(k); }
    if (opt) opt.parentNode.querySelectorAll('.wz-opt').forEach((o) => o.classList.toggle('on', o === opt));
  });

  window.Wizard = {
    el: wiz, goals: gs, steps: STEPS, segs, on,
    get step() { return cur; },
    next, go,
    reset() { cur = 0; wiz.className = 'wiz'; segs.forEach((s) => s.classList.remove('wait')); wiz.querySelector('.wz-bar').classList.remove('gone'); paint(); },
  };
  window.Wizard.reset();
})();
