// Экран «Статистика»: ответ дня, план на остаток дня, питание и активность, остальное плиткой.
(() => {
  const root = document.getElementById('stats');
  const A = 'assets/stats/';
  const nf = (n) => Math.round(n).toLocaleString('ru-RU');
  const dec = (n) => n.toFixed(1).replace('.', ',');
  const hm = (min) => `${Math.floor(min / 60)} ч ${min % 60} мин`;

  const WEEK = [
    { n: 13, wd: 'пн', name: 'Понедельник', meal: [1690, 88, 55, 190], act: [431, 45], steps: 10420, water: 2.0, sleep: 515 },
    { n: 14, wd: 'вт', name: 'Вторник', meal: [2140, 70, 82, 262], act: [240, 0], steps: 6100, water: 1.2, sleep: 520 },
    { n: 15, wd: 'ср', name: 'Среда', meal: [1760, 95, 58, 198], act: [440, 40], steps: 11050, water: 2.0, sleep: 430 },
    { n: 16, wd: 'чт', name: 'Четверг', meal: [1720, 91, 57, 196], act: [452, 50], steps: 10900, water: 2.2, sleep: 525 },
    { n: 17, wd: 'пт', name: 'Пятница', today: true, meal: [1235, 52, 41, 164], act: [269, 18], steps: 5301, water: 1.4, sleep: 378 },
    { n: 18, wd: 'сб', off: true }, { n: 19, wd: 'вс', off: true },
  ];
  const GOAL = { kcal: 1800, p: 93, f: 60, c: 200, act: 427, steps: 10000, water: 2, sleep: 510 };
  const DINNERS = [
    { name: 'Курица с гречкой и овощами', add: [480, 42, 12, 48], tag: 'закроет белок' },
    { name: 'Омлет из трёх яиц с сыром', add: [390, 27, 28, 4] },
    { name: 'Творог 5% с ягодами', add: [260, 34, 9, 14], tag: 'лёгкий' },
  ];

  // ?mock — режим сверки с макетом: данные и состав экрана как в исходном макете
  const MOCK = new URLSearchParams(location.search).has('mock');
  if (MOCK) { GOAL.f = 48; GOAL.c = 48; Object.assign(WEEK.find((d) => d.today), { meal: [1235, 12, 9, 9], water: 0.8 }); }
  root.classList.toggle('mock', MOCK);

  let day, s, done;

  const load = (d) => {
    day = d;
    s = { kcal: d.meal[0], p: d.meal[1], f: d.meal[2], c: d.meal[3], act: d.act[0], train: d.act[1], steps: d.steps, water: d.water, sleep: d.sleep, glasses: 0 };
    done = { meal: false, walk: false, water: false, sleep: false };
  };

  // пять ориентиров дня: доля и закрыт ли
  const marks = (v = s) => {
    const meal = v.kcal / GOAL.kcal;
    return [
      { key: 'meal', label: 'Питание', pct: meal, ok: meal >= 0.8 && meal <= 1.05 },
      { key: 'act', label: 'Активность', pct: v.act / GOAL.act, ok: v.act >= GOAL.act },
      { key: 'water', label: 'Вода', pct: v.water / GOAL.water, ok: v.water >= GOAL.water - 0.001 },
      { key: 'steps', label: 'Шаги', pct: v.steps / GOAL.steps, ok: v.steps >= GOAL.steps },
      { key: 'sleep', label: 'Сон', pct: v.sleep / GOAL.sleep, ok: v.sleep >= GOAL.sleep * 0.95 },
    ];
  };
  const score = (d) => marks({ kcal: d.meal[0], act: d.act[0], water: d.water, steps: d.steps, sleep: d.sleep }).filter((m) => m.ok).length;

  const hero = () => {
    const closed = marks().filter((m) => m.ok).length;
    if (!day.today) {
      return {
        kicker: `${day.name}, ${day.n} сентября`,
        title: closed === 5 ? 'День закрыт: 5 из 5' : `Закрыто ${closed} из 5`,
        sub: closed === 5 ? 'Всё по плану. Такие дни и двигают вес вниз.' : closed >= 4 ? 'Почти всё по плану. Один ориентир не добрали.' : 'День выбился из плана. Один такой день погоды не делает.',
      };
    }
    const left = Object.values(done).filter((v) => !v).length;
    const kicker = 'Пятница, 17 сентября · сейчас 20:01';
    if (left === 4) return { kicker, title: 'День немного отстаёт', sub: 'Четыре шага ниже — и он закрыт.' };
    if (left === 0) return { kicker, title: 'День закрыт', sub: `${closed} из 5 ориентиров. Сон доберёте ночью, напомним в 22:30.` };
    return { kicker, title: left === 1 ? 'Остался один шаг' : `Осталось ${left} шага`, sub: 'Хорошо идёте. Закройте остальное до сна.' };
  };

  const todos = () => [
    { key: 'meal', ico: 'meal', title: 'Ужин с белком', sub: done.meal ? done.meal : `Нужно ещё ${GOAL.p - s.p} г белка`, btn: 'Записать' },
    { key: 'walk', ico: 'steps', title: 'Прогулка 40 минут', sub: done.walk ? '+160 ккал, +4 700 шагов' : 'Закроет активность и шаги', btn: 'Отметить' },
    { key: 'water', ico: 'water', title: 'Три стакана воды', sub: done.water ? 'Норма воды закрыта' : s.glasses ? `Выпито ${s.glasses} из 3` : 'До нормы осталось 0,6 л', btn: '+ стакан' },
    { key: 'sleep', ico: 'sleep', title: 'Лечь до 23:00', sub: done.sleep ? 'Напомним в 22:30' : `Прошлой ночью ${hm(s.sleep)}`, btn: 'Напомнить' },
  ];

  const check = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4.5 10.5l3.6 3.5 7.4-8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const R = 20, C = 2 * Math.PI * R;

  const render = () => {
    const h = hero();
    root.querySelector('.st-scroll').innerHTML = `
      <div class="card cal">
        <div class="cal-top"><span>Сентябрь 2026</span><img src="${A}calendar.svg" alt="" width="24" height="24"></div>
        <div class="cal-days">${WEEK.map((d) => `
          <button class="day" type="button" data-day="${d.n}" aria-pressed="${d === day}" ${d.off ? 'disabled' : ''}>
            <small>${d.wd}</small>${d.n}<i><b style="width:${d.off ? 0 : (d.today && live ? live : score(d)) * 20}%" data-score="${d.n}"></b></i>
          </button>`).join('')}
        </div>
      </div>

      <div class="card hero">
        <div class="swap" data-swap>
          <p class="hero-kicker" data-h="kicker">${h.kicker}</p>
          <h3 data-h="title">${h.title}</h3>
          <p class="hero-sub" data-h="sub">${h.sub}</p>
        </div>
        <div class="marks">${marks().map((m) => `
          <div class="mark${m.ok ? ' done' : ''}" data-mark="${m.key}">
            <div class="mark-ring">
              <svg width="44" height="44" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="${R}"/><circle class="arc" cx="22" cy="22" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - Math.min(1, m.pct))).toFixed(1)}"/></svg>
              <span class="pct">${Math.round(m.pct * 100)}</span>
              <span class="ok">${check}</span>
            </div>
            ${m.label}
          </div>`).join('')}
        </div>
        <div class="goal"><b>68,4 кг</b><span>→ цель 65 кг</span><span class="down">−0,4 кг за неделю</span></div>
      </div>

      <div class="stack">
        ${day.today ? `<div class="card plan">
          <div class="plan-top"><h4>Осталось сегодня</h4><span class="plan-count" data-count></span></div>
          ${todos().map((t) => `
          <div class="todo" data-todo="${t.key}">
            <div class="todo-ico"><img src="${A}${t.ico}.svg" alt="" width="20" height="20">${check}</div>
            <div class="todo-text"><b>${t.title}</b><span data-sub>${t.sub}</span></div>
            <button class="pill" type="button" data-do="${t.key}">${t.btn}</button>
          </div>`).join('')}
        </div>` : ''}

        <div class="card w">
          <div class="w-top"><img src="${A}meal.svg" alt=""><span class="wname">Питание</span></div>
          <div class="num"><b data-n="kcal">${nf(s.kcal)}</b><span>/</span><span class="u"><i>${nf(GOAL.kcal)}</i><i>ккал</i></span><span class="left" data-left="kcal"></span></div>
          <div class="bju">
            ${[['p', 'Белки', '#5a4ff5'], ['f', 'Жиры', '#9245f0'], ['c', 'Углеводы', '#f17c59']].map(([k, label, c]) => `
            <div style="--c:${c}"><p>${label}</p><div class="bar"><b data-bar="${k}"></b></div><strong><i data-n="${k}">${s[k]}</i><span>/</span><span>${GOAL[k]}</span><span class="unit">г</span></strong></div>`).join('')}
          </div>
          ${day.today ? '<button class="add" type="button" data-do="meal" aria-label="Записать еду"><img src="' + A + 'plus.svg" alt="" width="17.5" height="17.5"></button>' : ''}
        </div>

        <div class="card w">
          <div class="w-top"><img src="${A}fire.svg" alt=""><span class="wname">Активность</span></div>
          <div class="num"><b data-n="act">${nf(s.act)}</b><span>/</span><span class="u"><i>${GOAL.act}</i><i>ккал</i></span></div>
          <div class="barrow"><div class="bar"><b data-bar="act"></b></div><em><span data-pct="act"></span><span>%</span></em></div>
          <div class="split">
            <div><p><img src="${A}steps-16.svg" alt="" width="16" height="16">Шаги</p><strong data-n="steps">${nf(s.steps)}</strong></div>
            <div><p><img src="${A}dumbbell.svg" alt="" width="16" height="16">Тренировка</p><strong><i data-n="train">${s.train}</i><span class="unit">мин</span></strong></div>
          </div>
          ${day.today ? '<button class="add" type="button" data-do="walk" aria-label="Отметить активность"><img src="' + A + 'plus.svg" alt="" width="17.5" height="17.5"></button>' : ''}
        </div>

        <div class="grid">
          <div class="card tile">
            <div class="w-top"><img src="${A}water.svg" alt=""><span class="wname">Вода</span></div>
            <div class="num"><b data-n="water">${dec(s.water)}</b><span>/</span><span class="u"><i>2</i><i>л</i></span></div>
            <div class="drops" data-drops></div>
          </div>
          <div class="card tile">
            <div class="w-top"><img src="${A}steps.svg" alt=""><span class="wname">Шаги</span></div>
            <div class="num"><b data-n="steps">${nf(s.steps)}</b><span>/</span><span>10 000</span></div>
            <div class="bar"><b data-bar="steps"></b></div>
          </div>
          <div class="card tile">
            <div class="w-top"><img src="${A}sleep.svg" alt=""><span class="wname">Сон</span></div>
            <div class="num"><b>${Math.floor(s.sleep / 60)}</b><span>ч</span><b>${s.sleep % 60}</b><span>мин</span></div>
            <div class="bar"><b data-bar="sleep"></b></div>
          </div>
          <div class="card tile">
            <div class="w-top"><img src="${A}scales.svg" alt=""><span class="wname">Вес</span></div>
            <div class="num"><b>68,4</b><span>/</span><span class="u"><i>65</i><i>кг</i></span></div>
            <p class="note good">−0,4 кг за неделю</p>
          </div>
        </div>
      </div>`;
    sync(false);
  };

  // обновляет цифры, полоски и кольца на месте, чтобы изменения было видно
  const shown = {};
  const count = (key, to, fmt) => {
    const els = root.querySelectorAll(`[data-n="${key}"]`);
    const from = shown[key] ?? to; shown[key] = to;
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => { e.textContent = fmt(to); }); return; }
    let t0;
    const step = (t) => {
      t0 ??= t; const k = Math.min(1, (t - t0) / 520), e = 1 - (1 - k) ** 3;
      els.forEach((el) => { el.textContent = fmt(from + (to - from) * e); });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const sync = (animate = true) => {
    if (!animate) Object.keys(shown).forEach((k) => delete shown[k]);
    [['kcal', nf], ['p', nf], ['f', nf], ['c', nf], ['act', nf], ['steps', nf], ['train', nf], ['water', dec]].forEach(([k, f]) => count(k, s[k], f));
    const MIN = { p: 0.245, f: 0.245, c: 0.245 };   // в макете у БЖУ заливка не короче 24 pt
    const bars = { p: s.p / GOAL.p, f: s.f / GOAL.f, c: s.c / GOAL.c, act: s.act / GOAL.act, steps: s.steps / GOAL.steps, sleep: s.sleep / GOAL.sleep };
    Object.entries(bars).forEach(([k, v]) => root.querySelectorAll(`[data-bar="${k}"]`).forEach((b) => { b.style.transform = `translateX(${(-(1 - Math.min(1, Math.max(v, MIN[k] && v > 0 ? MIN[k] : 0))) * 100).toFixed(2)}%)`; }));
    root.querySelector('[data-pct="act"]').textContent = Math.round(bars.act * 100);
    const left = GOAL.kcal - s.kcal;
    root.querySelector('[data-left="kcal"]').textContent = left > 0 ? `осталось ${nf(left)}` : `сверх нормы ${nf(-left)}`;
    root.querySelector('[data-drops]').innerHTML = Array.from({ length: 10 }, (_, i) => `<img src="${A}drop-${i < Math.round(s.water / 0.2) ? 'on' : 'off'}.svg" alt="">`).join('');

    marks().forEach((m) => {
      const el = root.querySelector(`[data-mark="${m.key}"]`);
      el.classList.toggle('done', m.ok);
      el.querySelector('.arc').setAttribute('stroke-dashoffset', (C * (1 - Math.min(1, m.pct))).toFixed(1));
      el.querySelector('.pct').textContent = Math.round(m.pct * 100);
    });
    if (day.today) {
      const closed = marks().filter((m) => m.ok).length;
      live = closed;
      root.querySelector('[data-score="17"]').style.width = closed * 20 + '%';
      todos().forEach((t) => {
        const el = root.querySelector(`[data-todo="${t.key}"]`);
        el.classList.toggle('done', !!done[t.key]);
        el.querySelector('[data-sub]').textContent = t.sub;
      });
      const n = Object.values(done).filter(Boolean).length;
      root.querySelector('[data-count]').textContent = `${n} из 4`;
    }
    const h = hero(), box = root.querySelector('[data-swap]');
    if (animate && box.querySelector('[data-h="title"]').textContent !== h.title) {
      box.classList.add('out');
      setTimeout(() => { Object.entries(h).forEach(([k, v]) => { box.querySelector(`[data-h="${k}"]`).textContent = v; }); box.classList.remove('out'); }, 180);
    } else Object.entries(h).forEach(([k, v]) => { box.querySelector(`[data-h="${k}"]`).textContent = v; });
  };

  const sheet = (open) => root.classList.toggle('sheet-open', open);

  const act = (key) => {
    if (!day.today || done[key]) return;
    if (key === 'meal') { sheet(true); return; }
    if (key === 'walk') { s.act += 160; s.steps += 4700; s.train += 40; done.walk = true; }
    if (key === 'water') { s.glasses += 1; s.water = +(s.water + 0.2).toFixed(1); if (s.glasses >= 3) done.water = true; }
    if (key === 'sleep') done.sleep = true;
    sync();
  };

  root.addEventListener('click', (e) => {
    const d = e.target.closest('[data-do]'); if (d) return act(d.dataset.do);
    const dayBtn = e.target.closest('[data-day]');
    if (dayBtn && !dayBtn.disabled) { const d2 = WEEK.find((x) => x.n === +dayBtn.dataset.day); if (d2 !== day) { if (d2.today && saved) { day = d2; s = saved.s; done = saved.done; } else { if (day.today) saved = { s, done }; load(d2); } render(); } return; }
    const opt = e.target.closest('[data-opt]');
    if (opt) {
      const m = DINNERS[+opt.dataset.opt];
      s.kcal += m.add[0]; s.p += m.add[1]; s.f += m.add[2]; s.c += m.add[3];
      done.meal = `${m.add[0]} ккал, ${m.add[1]} г белка`;
      sheet(false); setTimeout(sync, 220);
      return;
    }
    if (e.target.closest('.st-dim')) sheet(false);
  });
  let saved = null, live = 0;

  const reset = () => {
    saved = null; live = 0; sheet(false);
    load(WEEK.find((d) => d.today));
    root.innerHTML = `
      <img class="st-bg" src="${A}bg.svg" alt="">
      <div class="st-scroll"></div>
      <header class="st-head">
        <div class="time">20:01</div>
        <div class="levels"><img class="cellular" src="assets/ui/cellular.svg" alt=""><img class="wifi" src="assets/ui/wifi.svg" alt=""><span class="batt"></span><img class="cap" src="assets/ui/cap.svg" alt=""></div>
        <h2>Статистика</h2>
      </header>
      <nav class="tabbar" aria-label="Разделы">
        <img class="side" src="${A}tab-chart.svg" alt="Статистика" width="32" height="32">
        <img src="${A}tab-chat.svg" alt="Чат" width="44" height="44">
        <img class="side" src="${A}tab-profile.svg" alt="Профиль" width="32" height="32">
      </nav>
      <div class="st-dim"></div>
      <div class="st-sheet" role="dialog" aria-label="Что на ужин?">
        <h3>Что на ужин?</h3>
        <p>Подобрали под остаток дня: ${nf(GOAL.kcal - s.kcal)} ккал и ${GOAL.p - s.p} г белка.</p>
        ${DINNERS.map((m, i) => `<button class="opt" type="button" data-opt="${i}"><div><b>${m.name}</b><span>${m.add[0]} ккал · белок ${m.add[1]} г</span></div>${m.tag ? `<em>${m.tag}</em>` : ''}</button>`).join('')}
      </div>`;
    render();
    root.querySelector('.st-scroll').scrollTop = 0;
  };

  window.Stats = { reset };
  reset();
})();
