
    const storageKey = 'lingua-custom-cards-v2';
    const now = new Date();
    const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    let dayKey = dateKey(now);
    let saved = {};
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
    } catch (e) { saved = {}; }
    const isSavedCard = card => card && typeof card === 'object' && !Array.isArray(card) &&
      typeof card.id === 'string' && card.id.trim().length > 0 && card.id.length <= 64 &&
      typeof card.en === 'string' && card.en.trim().length > 0 && card.en.length <= 120 &&
      typeof card.ru === 'string' && card.ru.trim().length > 0 && card.ru.length <= 180 &&
      (card.example == null || typeof card.example === 'string') &&
      (typeof card.example !== 'string' || card.example.length <= 260);
    let cards = Array.isArray(saved.cards)
      ? saved.cards.filter(isSavedCard).map(card => ({
          id: card.id,
          en: card.en.trim(),
          ru: card.ru.trim(),
          example: typeof card.example === 'string' ? card.example : ''
        }))
      : [];
    const cardIds = new Set(cards.map(card => card.id));
    let knownIds = new Set(Array.isArray(saved.knownIds)
      ? saved.knownIds.filter(id => typeof id === 'string' && cardIds.has(id))
      : []);
    const storedTodayCount = typeof saved.todayCount === 'number' && Number.isFinite(saved.todayCount)
      ? Math.trunc(saved.todayCount)
      : 0;
    let todayCount = saved.dayKey === dayKey
      ? Math.max(0, Math.min(10, storedTodayCount))
      : 0;
    let streakDays = Number.isFinite(saved.streakDays) ? Math.max(0, Math.min(10000, Math.trunc(saved.streakDays))) : 0;
    let lastStudyDate = typeof saved.lastStudyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.lastStudyDate) ? saved.lastStudyDate : '';
    let cardIndex = 0, quizIndex = 0, quizScore = 0, quizLocked = false;
    let quizOrder = [], matchItems = [], matchSelected = [], matchFound = 0, audioOn = true, toastTimer, quizAdvanceTimer = null;
    let miniOrder = [], miniIndex = 0, miniScore = 0, miniLocked = false, miniMode = '', letterBank = [], selectedLetters = [], truthExpected = false;
    let memoryItems = [], memoryDeck = [], memoryFlipped = [], memoryFound = 0, memoryMoves = 0, memoryBusy = false, memoryRound = 0;
    let sprintDeck = [], sprintIndex = 0, sprintScore = 0, sprintErrors = 0, sprintTimeLeft = 45, sprintTimer = null, sprintLocked = false;
    const views = ['home', 'cards', 'test', 'match', 'packs'];
    let activeView = 'home';
    let activeStudyPack = null;
    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));
    const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function shuffle(list) {
      const result = list.slice();
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }
    const normalizeEnglish = value => String(value || '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
    const normalize = value => String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/[.,!?;:]+$/g, '');
    function studyCards() {
      return activeStudyPack ? cards.filter(card => card.id.startsWith('pk-' + activeStudyPack + '-')) : cards;
    }
    function studySetTitle() {
      const pack = activeStudyPack && READY_PACKS.find(item => item.id === activeStudyPack);
      return pack ? pack.title : 'Мои карточки';
    }
    function cardCountWord(count) {
      const lastTwo = count % 100, last = count % 10;
      if (lastTwo >= 11 && lastTwo <= 14) return 'карточек';
      return last === 1 ? 'карточка' : last >= 2 && last <= 4 ? 'карточки' : 'карточек';
    }
    function visibleStreak() {
      if (!lastStudyDate) return 0;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return lastStudyDate === dayKey || lastStudyDate === dateKey(yesterday) ? streakDays : 0;
    }
    function recordStudyActivity() {
      const today = dateKey(new Date());
      if (dayKey !== today) { dayKey = today; todayCount = 0; }
      todayCount = Math.min(10, todayCount + 1);
      if (lastStudyDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        streakDays = lastStudyDate === dateKey(yesterday) ? streakDays + 1 : 1;
        lastStudyDate = today;
      }
    }
    function persist() {
      try { localStorage.setItem(storageKey, JSON.stringify({cards:cards, knownIds:Array.from(knownIds), todayCount:todayCount, dayKey:dayKey, streakDays:streakDays, lastStudyDate:lastStudyDate})); } catch (e) {}
      window.dispatchEvent(new Event('leximo:state-changed'));
    }
    function updateStats() {
      const currentDay = dateKey(new Date());
      if (dayKey !== currentDay) { dayKey = currentDay; todayCount = 0; persist(); }
      const total = cards.length;
      const knownCount = cards.filter(c => knownIds.has(c.id)).length;
      const goal = Math.min(todayCount, 10);
      $('#goal-count').textContent = goal + ' / 10';
      $('#goal-fill').style.width = (goal * 10) + '%';
      $('#learned-stat').textContent = goal;
      $('#cards-stat').textContent = total;
      $('#mastered-stat').textContent = knownCount + ' из ' + total;
      $('#deck-fill').style.width = (total ? knownCount / total * 100 : 0) + '%';
      $('#deck-progress-label').textContent = total ? knownCount + ' из ' + total + ' знакомы' : 'Добавьте первую карточку';
      $('#owned-count').textContent = total + (total === 1 ? ' карточка' : total > 1 && total < 5 ? ' карточки' : ' карточек');
      $('#nav-card-count').textContent = total;
      if ($('#streak-stat')) {
        const streak = visibleStreak();
        $('#streak-stat').textContent = streak;
        $('#streak-unit').textContent = streak % 10 === 1 && streak % 100 !== 11 ? 'день' : streak % 10 >= 2 && streak % 10 <= 4 && (streak % 100 < 12 || streak % 100 > 14) ? 'дня' : 'дней';
        $('#streak-fire').classList.toggle('streak-active', lastStudyDate === dayKey);
        $('#streak-label').textContent = lastStudyDate === dayKey ? 'занимаетесь сегодня' : streak ? 'занимайтесь сегодня, чтобы продолжить' : 'начните с одного слова';
      }
    }
    window.leximoAccountBridge = {
      getState: () => ({cards:cards.map(card => ({id:card.id, en:card.en, ru:card.ru, example:card.example || ''})), knownIds:Array.from(knownIds), todayCount:todayCount, dayKey:dayKey, streakDays:streakDays, lastStudyDate:lastStudyDate}),
      setState: raw => {
        const nextCards = Array.isArray(raw && raw.cards) ? raw.cards.filter(isSavedCard).map(card => ({id:card.id, en:card.en.trim(), ru:card.ru.trim(), example:typeof card.example === 'string' ? card.example : ''})) : [];
        const nextIds = new Set(nextCards.map(card => card.id));
        cards = nextCards;
        knownIds = new Set(Array.isArray(raw && raw.knownIds) ? raw.knownIds.filter(id => typeof id === 'string' && nextIds.has(id)) : []);
        todayCount = raw && raw.dayKey === dayKey && Number.isFinite(raw.todayCount) ? Math.max(0, Math.min(10, Math.trunc(raw.todayCount))) : 0;
        streakDays = Number.isFinite(raw && raw.streakDays) ? Math.max(0, Math.min(10000, Math.trunc(raw.streakDays))) : 0;
        lastStudyDate = typeof (raw && raw.lastStudyDate) === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastStudyDate) ? raw.lastStudyDate : '';
        try { localStorage.setItem(storageKey, JSON.stringify({cards:cards, knownIds:Array.from(knownIds), todayCount:todayCount, dayKey:dayKey, streakDays:streakDays, lastStudyDate:lastStudyDate})); } catch (e) {}
        updateStats();
        if (activeView === 'cards') renderLibrary();
      }
    };
    function showToast(message) {
      const el = $('#toast');
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), 2100);
    }
    function setView(view) {
      if (view !== 'test' && quizAdvanceTimer) { clearTimeout(quizAdvanceTimer); quizAdvanceTimer = null; }
      activeView = view;
      if (view !== 'match') { memoryRound++; memoryBusy = false; if (sprintTimer) { clearInterval(sprintTimer); sprintTimer = null; } }
      views.forEach(v => { const page = $('#view-' + v); if (page) page.classList.toggle('hidden', v !== view); });
      $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
      $('#sidebar').classList.remove('open');
      if (view === 'cards') renderLibrary();
      if (view === 'test') startQuiz();
      if (view === 'match') startMatch();
      if (view === 'packs') renderPacks();
      window.scrollTo({top:0, behavior:'smooth'});
    }
    function speak(text) {
      if (!audioOn || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = .88;
      window.speechSynthesis.speak(utterance);
    }
    function emptyState(title, message, buttonId, buttonText) {
      return '<div class="empty-state"><div class="empty-emoji">✍️</div><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(message) + '</p><button class="small-primary" id="' + buttonId + '">' + escapeHtml(buttonText) + '</button></div>';
    }
    const READY_PACKS = [
      {id:'starter', level:'НАЧАЛО · A1', title:'Английский с нуля', description:'Самые нужные слова и фразы для первых разговоров.', topic:'Базовый словарь', cards:[
        ['hello','привет','Hello, Anna!'],['name','имя','My name is Sam.'],['family','семья','My family is at home.'],['friend','друг','Tom is my friend.'],['home','дом','I am at home.'],['school','школа','The school is near my home.'],['book','книга','This is a good book.'],['water','вода','Can I have some water?'],['food','еда','The food is ready.'],['want','хотеть','I want a cup of tea.'],['need','нуждаться','We need more time.'],['thank you','спасибо','Thank you for your help.'],['please','пожалуйста','One coffee, please.'],['today','сегодня','I am busy today.'],['good','хороший','Have a good day!']
      ]},
      {id:'everyday', level:'БАЗОВЫЙ · A2', title:'Каждый день', description:'Распорядок дня, привычки и простые разговоры.', topic:'Повседневная жизнь', cards:[
        ['wake up','просыпаться','I wake up at seven.'],['breakfast','завтрак','We have breakfast together.'],['usually','обычно','I usually walk to work.'],['sometimes','иногда','Sometimes I read before bed.'],['busy','занятый','I am busy this afternoon.'],['free time','свободное время','What do you do in your free time?'],['weather','погода','The weather is warm today.'],['plan','план','What is your plan for tomorrow?'],['enjoy','нравиться; получать удовольствие','I enjoy learning English.'],['favourite','любимый','Blue is my favourite colour.'],['tired','уставший','She feels tired after work.'],['tomorrow','завтра','See you tomorrow!'],['early','рано','He gets up early.'],['often','часто','We often cook at home.'],['together','вместе','Let’s study together.']
      ]},
      {id:'travel', level:'ПУТЕШЕСТВИЯ · A2–B1', title:'В поездке', description:'Аэропорт, отель, дорога и просьба о помощи.', topic:'Путешествия', cards:[
        ['passport','паспорт','Here is my passport.'],['ticket','билет','I have a ticket to London.'],['platform','платформа','Which platform does the train leave from?'],['luggage','багаж','My luggage is heavy.'],['reservation','бронь; бронирование','I have a reservation for tonight.'],['check in','зарегистрироваться; заселиться','We need to check in at the hotel.'],['boarding pass','посадочный талон','Please show me your boarding pass.'],['delayed','задержанный; задерживается','The flight is delayed by an hour.'],['directions','как пройти; указания','Could you give me directions?'],['turn left','повернуть налево','Turn left at the next street.'],['go straight','идти прямо','Go straight for two blocks.'],['Where is the station?','Где находится вокзал?','Excuse me, where is the station?'],['I need help','Мне нужна помощь','I need help with my suitcase.'],['single room','одноместный номер','I would like a single room.'],['How much is it?','Сколько это стоит?','How much is it to the airport?']
      ]},
      {id:'cafe', level:'ПОВСЕДНЕВНЫЙ · A2', title:'Кафе и еда', description:'Заказывайте еду, уточняйте состав и просите счёт.', topic:'Еда и кафе', cards:[
        ['menu','меню','Could I see the menu, please?'],['order','заказывать; заказ','Are you ready to order?'],['bill','счёт','Could we have the bill, please?'],['table for two','столик на двоих','A table for two, please.'],['still water','вода без газа','Could I have still water?'],['sparkling water','газированная вода','She would like sparkling water.'],['starter','закуска','The soup is a good starter.'],['main course','основное блюдо','The main course comes with rice.'],['dessert','десерт','Would you like some dessert?'],['allergic to','иметь аллергию на','I am allergic to nuts.'],['vegetarian','вегетарианец; вегетарианский','Do you have a vegetarian option?'],['delicious','вкусный','This cake is delicious.'],['take away','с собой','Can I get this to take away?'],['without sugar','без сахара','Tea without sugar, please.'],['tip','чаевые','Is service included, or should I leave a tip?']
      ]},
      {id:'work', level:'РАБОТА · B1–B2', title:'Работа и общение', description:'Встречи, задачи, сроки и деловая переписка.', topic:'Профессиональный английский', cards:[
        ['meeting','встреча; совещание','The meeting starts at ten.'],['deadline','крайний срок','The deadline is next Friday.'],['task','задача','I finished the task this morning.'],['schedule','расписание; планировать','Let’s check the project schedule.'],['update','обновление; сообщить новости','Could you send me an update?'],['colleague','коллега','My colleague will join the call.'],['feedback','обратная связь','Thank you for your feedback.'],['available','свободный; доступный','Are you available this afternoon?'],['discuss','обсуждать','We need to discuss the next steps.'],['solve a problem','решить проблему','The team solved the problem quickly.'],['project','проект','Our project is almost ready.'],['take notes','делать заметки','I will take notes during the meeting.'],['reschedule','перенести на другое время','Can we reschedule our call?'],['responsibility','ответственность; обязанность','This is my responsibility.'],['let me know','дайте мне знать','Let me know if you need help.']
      ]},
      {id:'it', level:'IT · B1–C1', title:'IT-специалист', description:'Слова для разработки, командной работы и выпуска продукта.', topic:'Технологии', cards:[
        ['deployment','развёртывание','The deployment is scheduled for tonight.'],['branch','ветка','Create a new branch for this change.'],['commit','коммит; зафиксировать изменения','I will commit the fix after the review.'],['bug','ошибка; баг','We found a bug in the login flow.'],['issue','проблема; задача','Please create an issue for this bug.'],['feature','функция; возможность','This feature is available to all users.'],['requirement','требование','The requirement is not clear yet.'],['database','база данных','The app stores user data in a database.'],['query','запрос','This query takes too long to run.'],['backup','резервная копия; создавать копию','Make a backup before the update.'],['release','релиз; выпускать','The release includes three fixes.'],['security','безопасность','Security is part of every review.'],['user interface','пользовательский интерфейс','The user interface should work on mobile.'],['performance','производительность','We need to improve page performance.'],['code review','проверка кода','The change is waiting for a code review.']
      ]}
    ];
    function packCardId(pack, index) { return 'pk-' + pack.id + '-' + String(index + 1).padStart(2, '0'); }
    function renderPacks() {
      const packRows = READY_PACKS.map(pack => {
        const addedCount = pack.cards.filter((card, index) => cards.some(savedCard => savedCard.id === packCardId(pack, index))).length;
        const missingCount = pack.cards.length - addedCount;
        const addButton = missingCount
          ? '<button class="small-primary" data-pack-add="' + pack.id + '">Добавить ' + missingCount + ' ' + cardCountWord(missingCount) + '</button>'
          : '<button class="small-secondary" disabled>Набор уже добавлен</button>';
        const studyButton = addedCount === pack.cards.length
          ? '<button class="small-secondary" data-pack-study="' + pack.id + '">Учить набор</button>'
          : '<button class="small-secondary" disabled>Сначала добавьте набор</button>';
        return '<article class="ready-pack"><div class="ready-pack-head"><span class="pack-level">' + escapeHtml(pack.level) + '</span><span class="pack-count">' + pack.cards.length + ' ' + cardCountWord(pack.cards.length) + '</span></div><h2>' + escapeHtml(pack.title) + '</h2><p>' + escapeHtml(pack.description) + '</p><div class="pack-topic">' + escapeHtml(pack.topic) + '</div><div class="pack-actions">' + addButton + studyButton + '</div></article>';
      }).join('');
      const selectedName = activeStudyPack && READY_PACKS.find(pack => pack.id === activeStudyPack);
      $('#view-packs').innerHTML = '<div class="view-title"><h1>Готовые наборы</h1><p>Выберите тему и добавьте слова в свой словарь. Каждый набор можно учить отдельно.</p></div>' +
        (selectedName ? '<div class="pack-current">Сейчас выбран набор «' + escapeHtml(selectedName.title) + '». <button class="text-btn" id="clear-pack-filter">Учить все мои карточки</button></div>' : '') +
        '<div class="ready-packs-grid">' + packRows + '</div>';
      $$('[data-pack-add]').forEach(button => button.onclick = () => addReadyPack(button.dataset.packAdd));
      $$('[data-pack-study]').forEach(button => button.onclick = () => studyReadyPack(button.dataset.packStudy));
      const clearFilter = $('#clear-pack-filter');
      if (clearFilter) clearFilter.onclick = () => { activeStudyPack = null; renderPacks(); showToast('Выбраны все ваши карточки'); };
    }
    function addReadyPack(packId) {
      const pack = READY_PACKS.find(item => item.id === packId);
      if (!pack) return;
      const existingIds = new Set(cards.map(card => card.id));
      let added = 0;
      pack.cards.forEach((entry, index) => {
        const id = packCardId(pack, index);
        if (existingIds.has(id)) return;
        cards.push({id:id, en:entry[0], ru:entry[1], example:entry[2] || ''});
        existingIds.add(id);
        added++;
      });
      if (added) {
        persist();
        updateStats();
        showToast('Добавлено карточек: ' + added);
      }
      renderPacks();
    }
    function studyReadyPack(packId) {
      const pack = READY_PACKS.find(item => item.id === packId);
      if (!pack || pack.cards.some((_, index) => !cards.some(card => card.id === packCardId(pack, index)))) return;
      activeStudyPack = pack.id;
      cardIndex = 0;
      setView('cards');
      renderStudy();
    }
    function renderLibrary() {
      const learningDeck = studyCards();
      const selectedPack = activeStudyPack && READY_PACKS.find(pack => pack.id === activeStudyPack);
      const rows = cards.map(card =>
        '<article class="owned-card"><div class="owned-terms"><div class="owned-en">' + escapeHtml(card.en) + '</div><div class="owned-ru">' + escapeHtml(card.ru) + '</div>' +
        (card.example ? '<div class="owned-example">“' + escapeHtml(card.example) + '”</div>' : '') +
        '</div><div class="owned-actions"><button class="tiny-btn" data-edit="' + escapeHtml(card.id) + '">Изменить</button><button class="tiny-btn danger" data-delete="' + escapeHtml(card.id) + '">Удалить</button></div></article>'
      ).join('');
      const listContent = cards.length ? '<div class="owned-list">' + rows + '</div>' : emptyState('Пока нет карточек', 'Добавьте английское слово или фразу и свой перевод. Затем сможете учить их здесь.', 'empty-add', 'Создать первую карточку');
      $('#view-cards').innerHTML =
        '<div class="view-title"><h1>Мои карточки</h1><p>' + (selectedPack ? 'Для занятий выбран набор «' + escapeHtml(selectedPack.title) + '». Остальные карточки остаются в вашем словаре.' : 'Ваш личный набор слов и фраз. Добавляйте, редактируйте и повторяйте его.') + '</p></div>' +
        '<div class="library-toolbar"><div class="library-count">В наборе: <strong>' + cards.length + '</strong></div><div class="library-actions">' +
        (selectedPack ? '<button class="small-secondary" id="all-cards-btn">Учить все карточки</button>' : '<button class="small-secondary" id="browse-packs-btn">Готовые наборы</button>') +
        '<button class="small-secondary" id="study-btn"' + (learningDeck.length ? '' : ' disabled') + '>' + (selectedPack ? 'Учить этот набор' : 'Учить карточки') + '</button>' +
        '<button class="small-secondary" id="test-btn"' + (learningDeck.length ? '' : ' disabled') + '>Тест</button>' +
        '<button class="small-secondary" id="match-btn"' + (learningDeck.length < 1 ? ' disabled' : '') + '>Мини-игры</button>' +
        '<button class="small-primary" id="add-card-btn">+ Добавить карточку</button></div></div>' +
        '<div id="owned-list">' + listContent + '</div>' +
        (learningDeck.length === 1 ? '<p class="disabled-note">Для игр «Подбор пар», «Память» и «Верно или нет» в этом наборе нужна ещё одна карточка. Остальные режимы доступны.</p>' : '');
      $('#add-card-btn').onclick = () => showCardForm();
      if ($('#browse-packs-btn')) $('#browse-packs-btn').onclick = () => setView('packs');
      if ($('#all-cards-btn')) $('#all-cards-btn').onclick = () => { activeStudyPack = null; renderLibrary(); };
      if ($('#empty-add')) $('#empty-add').onclick = () => showCardForm();
      if ($('#study-btn')) $('#study-btn').onclick = () => { cardIndex = 0; renderStudy(); };
      if ($('#test-btn')) $('#test-btn').onclick = () => setView('test');
      if ($('#match-btn')) $('#match-btn').onclick = () => setView('match');
      $$('[data-edit]').forEach(button => button.onclick = () => showCardForm(button.dataset.edit));
      $$('[data-delete]').forEach(button => button.onclick = () => {
        const card = cards.find(c => c.id === button.dataset.delete);
        if (!card || !window.confirm('Удалить карточку «' + card.en + '»?')) return;
        cards = cards.filter(c => c.id !== card.id);
        knownIds.delete(card.id);
        persist();
        updateStats();
        renderLibrary();
        showToast('Карточка удалена');
      });
    }
    function showCardForm(id) {
      const card = id ? cards.find(c => c.id === id) : null;
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.id = 'card-modal';
      overlay.innerHTML =
        '<form class="modal" id="card-form"><div class="modal-head"><div><h2>' + (card ? 'Изменить карточку' : 'Новая карточка') + '</h2><p>Заполните английскую сторону и перевод.</p></div><button type="button" class="modal-close" id="modal-close" aria-label="Закрыть">×</button></div>' +
        '<div class="form-field"><label for="card-en">Слово или фраза на английском *</label><input id="card-en" maxlength="120" required placeholder="Введите своё слово или фразу" value="' + escapeHtml(card ? card.en : '') + '"></div>' +
        '<div class="form-field"><label for="card-ru">Перевод *</label><input id="card-ru" maxlength="180" required placeholder="Введите свой перевод" value="' + escapeHtml(card ? card.ru : '') + '"></div>' +
        '<div class="form-field"><label for="card-example">Пример предложения (необязательно)</label><textarea id="card-example" maxlength="260" placeholder="Добавьте свой пример, если нужно">' + escapeHtml(card ? card.example || '' : '') + '</textarea></div>' +
        '<div class="modal-actions"><button type="button" class="small-secondary" id="cancel-card">Отмена</button><button type="submit" class="small-primary">Сохранить</button></div></form>';
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      $('#modal-close').onclick = close;
      $('#cancel-card').onclick = close;
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
      $('#card-en').focus();
      $('#card-form').addEventListener('submit', e => {
        e.preventDefault();
        const updated = {
          id: card ? card.id : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          en: $('#card-en').value.trim(),
          ru: $('#card-ru').value.trim(),
          example: $('#card-example').value.trim()
        };
        if (!updated.en || !updated.ru) return;
        if (card) cards = cards.map(c => c.id === card.id ? updated : c);
        else cards.push(updated);
        persist();
        close();
        updateStats();
        renderLibrary();
        showToast(card ? 'Изменения сохранены' : 'Карточка добавлена');
      });
    }
    function renderStudy() {
      const learningDeck = studyCards();
      if (!learningDeck.length) { renderLibrary(); return; }
      const card = learningDeck[cardIndex % learningDeck.length];
      const selectedPack = activeStudyPack && READY_PACKS.find(pack => pack.id === activeStudyPack);
      $('#view-cards').innerHTML =
        '<div class="view-title"><h1>' + (selectedPack ? escapeHtml(selectedPack.title) : 'Учить карточки') + '</h1><p>Вспомните перевод, затем откройте ответ.</p></div>' +
        '<div class="study-shell"><div class="study-topline"><div class="study-type">' + (selectedPack ? 'ГОТОВЫЙ НАБОР' : 'МОЙ НАБОР') + '</div><div class="counter">' + (cardIndex + 1) + ' / ' + learningDeck.length + '</div></div>' +
        '<div class="study-progress"><div style="width:' + ((cardIndex + 1) / learningDeck.length * 100) + '%"></div></div>' +
        '<div class="flashcard" id="flashcard" role="button" tabindex="0" aria-label="Нажмите, чтобы открыть перевод"><div class="word-type">МОЯ КАРТОЧКА</div>' +
        '<button class="speaker" id="speak-card" aria-label="Прослушать слово"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7"/></svg></button>' +
        '<div class="word">' + escapeHtml(card.en) + '</div><div class="hint">Нажмите, чтобы увидеть перевод</div><div class="answer"><div class="answer-translation">' + escapeHtml(card.ru) + '</div>' +
        (card.example ? '<div class="answer-example">“' + escapeHtml(card.example) + '”</div>' : '') +
        '</div><div class="flip-label">ПЕРЕВЕРНУТЬ КАРТОЧКУ</div></div>' +
        '<div class="flash-controls"><button class="control-btn" id="back-library">К моим карточкам</button><button class="control-btn" id="again-card">Повторить</button><button class="control-btn success" id="known-card">Знаю ✓</button><button class="control-btn" id="next-card">Дальше →</button></div></div>';
      const flip = () => $('#flashcard').classList.toggle('revealed');
      $('#flashcard').addEventListener('click', e => { if (!e.target.closest('button')) flip(); });
      $('#flashcard').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
      $('#speak-card').onclick = e => { e.stopPropagation(); speak(card.en); };
      $('#back-library').onclick = renderLibrary;
      $('#again-card').onclick = () => { cardIndex = (cardIndex + 1) % learningDeck.length; showToast('Вернёмся к этой карточке позже'); renderStudy(); };
      $('#next-card').onclick = () => { cardIndex = (cardIndex + 1) % learningDeck.length; renderStudy(); };
      $('#known-card').onclick = () => {
        knownIds.add(card.id);
        recordStudyActivity();
        persist();
        updateStats();
        showToast('Отлично! Карточка отмечена как знакомая');
        cardIndex = (cardIndex + 1) % learningDeck.length;
        renderStudy();
      };
    }
    function startQuiz() {
      if (quizAdvanceTimer) { clearTimeout(quizAdvanceTimer); quizAdvanceTimer = null; }
      const learningDeck = studyCards();
      if (!learningDeck.length) { renderQuizEmpty(); return; }
      const nextOrder = shuffle(learningDeck.map((_, i) => i)).slice(0, Math.min(learningDeck.length, 10));
      if (nextOrder.length > 1 && nextOrder.join(',') === quizOrder.join(',')) nextOrder.push(nextOrder.shift());
      quizOrder = nextOrder;
      quizIndex = 0;
      quizScore = 0;
      quizLocked = false;
      renderQuizQuestion();
    }
    function renderQuizEmpty() {
      $('#view-test').innerHTML = '<div class="view-title"><h1>Тест по моим карточкам</h1><p>Вопросы будут составлены из вашего набора.</p></div>' +
        '<div class="finish-card">' + emptyState('Сначала создайте карточки', 'Добавьте хотя бы одно слово, чтобы начать тест по собственному набору.', 'quiz-add-card', 'Создать карточку') + '</div>';
      $('#quiz-add-card').onclick = () => { setView('cards'); showCardForm(); };
    }
    function renderQuizQuestion() {
      const learningDeck = studyCards();
      if (quizIndex >= quizOrder.length) {
        $('#view-test').innerHTML = '<div class="view-title"><h1>Тест: ' + escapeHtml(studySetTitle()) + '</h1><p>Ваш результат.</p></div><div class="finish-card"><div class="finish-emoji">' + (quizScore === quizOrder.length ? '🎉' : '🌱') + '</div><h2>' + (quizScore === quizOrder.length ? 'Отличная работа!' : 'Хорошая практика!') + '</h2><p>Правильных ответов: <strong>' + quizScore + ' из ' + quizOrder.length + '</strong>.</p><button class="small-primary" id="restart-quiz">Пройти ещё раз</button> <button class="small-secondary" id="quiz-to-cards">Мои карточки</button></div>';
        $('#restart-quiz').onclick = startQuiz;
        $('#quiz-to-cards').onclick = () => setView('cards');
        return;
      }
      const index = quizOrder[quizIndex];
      const card = learningDeck[index];
      const candidateIndexes = shuffle(learningDeck.map((_, i) => i).filter(i => i !== index && normalize(learningDeck[i].ru) !== normalize(card.ru)));
      const options = shuffle([index].concat(candidateIndexes.slice(0, 3)));
      const useChoices = options.length > 1;
      quizLocked = false;
      const questionBody = useChoices
        ? '<div class="quiz-choices">' + options.map((i, n) => '<button class="choice" data-answer="' + i + '"><span class="choice-letter">' + String.fromCharCode(65 + n) + '</span>' + escapeHtml(learningDeck[i].ru) + '</button>').join('') + '</div>'
        : '<form class="quiz-input" id="typed-answer"><input id="answer-input" autocomplete="off" required placeholder="Введите перевод"><button class="small-primary" type="submit">Проверить</button></form>';
      $('#view-test').innerHTML = '<div class="view-title"><h1>Тест: ' + escapeHtml(studySetTitle()) + '</h1><p>Выберите или введите перевод карточки.</p></div><div class="quiz-shell"><div class="study-topline"><div class="study-type">ВОПРОС ' + (quizIndex + 1) + '</div><div class="counter">' + (quizIndex + 1) + ' / ' + quizOrder.length + '</div></div><div class="study-progress"><div style="width:' + ((quizIndex + 1) / quizOrder.length * 100) + '%"></div></div><div class="quiz-card"><div class="quiz-question-label">КАК ПЕРЕВОДИТСЯ</div><div class="quiz-question">' + escapeHtml(card.en) + '</div>' + questionBody + '<div class="quiz-feedback" id="quiz-feedback" role="status" aria-live="polite"></div><div class="quiz-bottom"><button class="small-secondary" id="quit-quiz">Мои карточки</button><button class="small-primary hidden" id="next-question">Продолжить →</button></div></div></div>';
      function answerQuestion(correct, selectedButton) {
        if (quizLocked) return;
        quizLocked = true;
        if (quizAdvanceTimer) clearTimeout(quizAdvanceTimer);
        if (correct) {
          quizScore++;
          knownIds.add(card.id);
          recordStudyActivity();
          persist();
          updateStats();
        }
        if (useChoices) {
          $$('.choice').forEach(button => {
            button.disabled = true;
            const answerIndex = Number(button.dataset.answer);
            if (answerIndex === index) {
              button.classList.add(correct ? 'correct' : 'reveal-correct');
            } else if (!correct && button === selectedButton) {
              button.classList.add('wrong');
            } else {
              button.classList.add('muted');
            }
          });
        } else {
          const answerInput = $('#answer-input');
          const submitButton = $('#typed-answer button[type="submit"]');
          if (answerInput) answerInput.disabled = true;
          if (submitButton) submitButton.disabled = true;
        }
        const feedback = $('#quiz-feedback');
        feedback.textContent = correct ? (useChoices ? '' : 'Верно!') : 'Правильный ответ: ' + card.ru;
        feedback.classList.toggle('is-correct', correct);
        feedback.classList.toggle('is-wrong', !correct);
        const nextButton = $('#next-question');
        if (correct) {
          nextButton.classList.add('hidden');
          quizAdvanceTimer = setTimeout(() => {
            quizAdvanceTimer = null;
            if (activeView !== 'test') return;
            quizIndex++;
            renderQuizQuestion();
          }, 720);
        } else {
          quizAdvanceTimer = setTimeout(() => {
            quizAdvanceTimer = null;
            if (activeView !== 'test') return;
            nextButton.classList.remove('hidden');
            nextButton.focus({preventScroll:true});
          }, 480);
        }
      }
      if (useChoices) {
        $$('.choice').forEach(button => button.onclick = () => answerQuestion(Number(button.dataset.answer) === index, button));
      } else {
        $('#typed-answer').onsubmit = e => { e.preventDefault(); answerQuestion(normalize($('#answer-input').value) === normalize(card.ru), null); };
      }
      $('#next-question').onclick = () => {
        if (quizAdvanceTimer) clearTimeout(quizAdvanceTimer);
        quizAdvanceTimer = null;
        quizIndex++;
        renderQuizQuestion();
      };
      $('#quit-quiz').onclick = () => setView('cards');
    }
    function startMatch() { renderGameHub(); }
    function renderGameHub() {
      const learningDeck = studyCards();
      if (sprintTimer) { clearInterval(sprintTimer); sprintTimer = null; }
      memoryRound++;
      memoryBusy = false;
      if (!learningDeck.length) {
        $('#view-match').innerHTML = '<div class="view-title"><h1>Мини-игры</h1><p>Игры будут собраны из ваших карточек.</p></div><div class="finish-card">' + emptyState('Пока нечего повторять', 'Добавьте свои слова и переводы — и они появятся во всех игровых режимах.', 'game-add-card', 'Создать карточку') + '</div>';
        $('#game-add-card').onclick = () => { setView('cards'); showCardForm(); };
        return;
      }
      const pairDisabled = learningDeck.length < 2 ? ' disabled' : '';
      const pairNote = learningDeck.length < 2 ? '<div class="disabled-note">Добавьте вторую карточку, чтобы играть.</div>' : '';
      $('#view-match').innerHTML =
        '<div class="view-title"><h1>Мини-игры</h1><p>Выберите режим. Все задания используют только карточки из вашего набора (' + learningDeck.length + ').</p></div>' +
        '<div class="game-options">' +
        '<section class="game-option"><div class="game-emoji">🧩</div><h3>Подбор пар</h3><p>Соедините каждое английское слово с вашим переводом.</p><button class="small-primary" id="play-pairs"' + pairDisabled + '>Играть</button>' + pairNote + '</section>' +
        '<section class="game-option"><div class="game-emoji">🔤</div><h3>Собери слово</h3><p>По переводу соберите английское слово из перемешанных букв.</p><button class="small-primary" id="play-build">Играть</button></section>' +
        '<section class="game-option"><div class="game-emoji">✅</div><h3>Верно или нет</h3><p>Решите, подходит ли показанный перевод к слову.</p><button class="small-primary" id="play-truth"' + pairDisabled + '>Играть</button>' + pairNote + '</section>' +
        '<section class="game-option"><div class="game-emoji">🧠</div><h3>Память</h3><p>Переворачивайте карточки и находите пары слов с переводами.</p><button class="small-primary" id="play-memory"' + pairDisabled + '>Играть</button>' + pairNote + '</section>' +
        '<section class="game-option"><div class="game-emoji">⏱️</div><h3>Спринт перевода</h3><p>За 45 секунд введи как можно больше переводов из своих карточек.</p><button class="small-primary" id="play-sprint">Играть</button></section>' +
        '</div><div class="text-center"><button class="small-secondary" id="games-to-cards">Мои карточки</button></div>';
      $('#play-pairs').onclick = startPairGame;
      $('#play-build').onclick = startBuildGame;
      $('#play-truth').onclick = startTruthGame;
      $('#play-memory').onclick = startMemoryGame;
      $('#play-sprint').onclick = startSprintGame;
      $('#games-to-cards').onclick = () => setView('cards');
    }
    function renderGameHeader(title, description, count, total) {
      return '<div class="view-title"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(description) + '</p></div><button class="text-btn" id="back-games">← Все игры</button></div></div>' +
        '<div class="study-topline"><div class="study-type">' + (activeStudyPack ? 'ГОТОВЫЙ НАБОР' : 'МОЙ НАБОР') + '</div><div class="counter" id="game-progress">' + count + ' / ' + total + '</div></div>' +
        '<div class="study-progress"><div style="width:' + (count / total * 100) + '%"></div></div>';
    }
    function finishMiniGame(title, emoji, description, replay) {
      $('#view-match').innerHTML = '<div class="view-title"><h1>Мини-игры</h1><p>Результат по вашим карточкам.</p></div><div class="finish-card"><div class="finish-emoji">' + emoji + '</div><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(description) + '</p><button class="small-primary" id="replay-mini">Сыграть ещё</button> <button class="small-secondary" id="finish-all-games">Все игры</button></div>';
      $('#replay-mini').onclick = replay;
      $('#finish-all-games').onclick = renderGameHub;
    }
    function startPairGame() {
      const learningDeck = studyCards();
      if (learningDeck.length < 2) { renderGameHub(); return; }
      matchItems = shuffle(learningDeck.map((card, index) => ({card:card, index:index}))).slice(0, 6);
      matchSelected = [];
      matchFound = 0;
      const tiles = [];
      matchItems.forEach(item => {
        tiles.push({id:item.card.id, side:'en', text:item.card.en});
        tiles.push({id:item.card.id, side:'ru', text:item.card.ru});
      });
      const mixed = shuffle(tiles);
      $('#view-match').innerHTML = renderGameHeader('Подбор пар', 'Сопоставьте английские слова и ваши переводы.', 0, matchItems.length) +
        '<div class="match-shell"><div class="match-head"><div class="match-status">Найдено пар: <strong id="match-count">0 из ' + matchItems.length + '</strong></div><button class="text-btn" id="reshuffle-match">Перемешать</button></div><div class="match-grid">' +
        mixed.map((item, i) => '<button class="match-tile" data-card-id="' + escapeHtml(item.id) + '" data-side="' + item.side + '" data-id="' + i + '">' + escapeHtml(item.text) + '</button>').join('') +
        '</div><div class="text-center" style="margin-top:20px"><button class="small-secondary" id="exit-match">Все игры</button></div></div>';
      $$('.match-tile').forEach(tile => tile.onclick = () => selectTile(tile));
      $('#reshuffle-match').onclick = startPairGame;
      $('#exit-match').onclick = renderGameHub;
      $('#back-games').onclick = renderGameHub;
    }
    function selectTile(tile) {
      if (tile.classList.contains('matched') || tile.classList.contains('selected') || matchSelected.length >= 2) return;
      tile.classList.add('selected');
      matchSelected.push(tile);
      if (matchSelected.length !== 2) return;
      const first = matchSelected[0], second = matchSelected[1];
      if (first.dataset.cardId === second.dataset.cardId && first.dataset.side !== second.dataset.side) {
        setTimeout(() => {
          first.classList.remove('selected');
          second.classList.remove('selected');
          first.classList.add('matched');
          second.classList.add('matched');
          matchFound++;
          const card = studyCards().find(c => c.id === first.dataset.cardId);
          if (card) knownIds.add(card.id);
          recordStudyActivity();
          persist();
          updateStats();
          $('#game-progress').textContent = matchFound + ' / ' + matchItems.length;
          $('#match-count').textContent = matchFound + ' из ' + matchItems.length;
          matchSelected = [];
          if (matchFound === matchItems.length) {
            setTimeout(() => finishMiniGame('Все пары собраны!', '🏆', 'Вы сопоставили ' + matchFound + ' пар.', startPairGame), 250);
          }
        }, 160);
      } else {
        first.classList.add('mismatch');
        second.classList.add('mismatch');
        setTimeout(() => {
          first.classList.remove('selected', 'mismatch');
          second.classList.remove('selected', 'mismatch');
          matchSelected = [];
        }, 600);
      }
    }
    function startBuildGame() {
      miniMode = 'build';
      const learningDeck = studyCards();
      miniOrder = shuffle(learningDeck.map((card, index) => index).filter(index => normalizeEnglish(learningDeck[index].en).length > 0)).slice(0, 10);
      if (!miniOrder.length) { renderGameHub(); showToast('В карточках нет английских букв для этой игры'); return; }
      miniIndex = 0;
      miniScore = 0;
      renderBuildQuestion();
    }
    function renderBuildQuestion() {
      const learningDeck = studyCards();
      if (miniIndex >= miniOrder.length) {
        finishMiniGame('Раунд завершён', '🔤', 'Вы собрали ' + miniScore + ' из ' + miniOrder.length + ' слов.', startBuildGame);
        return;
      }
      const card = learningDeck[miniOrder[miniIndex]];
      letterBank = shuffle(Array.from(normalizeEnglish(card.en))).map((letter, index) => ({id:index, letter:letter}));
      selectedLetters = [];
      miniLocked = false;
      $('#view-match').innerHTML = renderGameHeader('Собери слово', 'Соберите английскую карточку по русскому переводу. Пробелы и знаки добавятся автоматически.', miniIndex + 1, miniOrder.length) +
        '<div class="quiz-shell"><div class="quiz-card"><div class="quiz-question-label">АНГЛИЙСКОЕ СЛОВО ДЛЯ ПЕРЕВОДА</div><div class="quiz-question">' + escapeHtml(card.ru) + '</div>' +
        '<div class="letter-answer" id="letter-answer"><span class="placeholder">Нажимайте буквы по порядку</span></div><div class="letter-bank" id="letter-bank"></div>' +
        '<div class="mini-feedback" id="build-feedback"></div><div class="quiz-bottom"><button class="small-secondary" id="build-reset">Сбросить</button><div><button class="small-primary" id="check-word">Проверить</button><button class="small-primary hidden" id="next-build">Дальше →</button></div></div></div></div>';
      $('#back-games').onclick = renderGameHub;
      $('#build-reset').onclick = () => { if (!miniLocked) { selectedLetters = []; renderLetterBoard(); } };
      $('#check-word').onclick = checkBuiltWord;
      $('#next-build').onclick = () => { miniIndex++; renderBuildQuestion(); };
      renderLetterBoard();
    }
    function renderLetterBoard() {
      const chosen = selectedLetters.map(id => letterBank.find(item => item.id === id).letter).join('');
      $('#letter-answer').innerHTML = chosen ? escapeHtml(chosen.split('').join(' ')) : '<span class="placeholder">Нажимайте буквы по порядку</span>';
      $('#letter-bank').innerHTML = letterBank.map(item => '<button class="letter-tile' + (selectedLetters.includes(item.id) ? ' used' : '') + '" data-letter-id="' + item.id + '"' + (selectedLetters.includes(item.id) || miniLocked ? ' disabled' : '') + '>' + escapeHtml(item.letter) + '</button>').join('');
      $$('.letter-tile').forEach(button => button.onclick = () => {
        if (miniLocked || selectedLetters.includes(Number(button.dataset.letterId))) return;
        selectedLetters.push(Number(button.dataset.letterId));
        renderLetterBoard();
      });
    }
    function checkBuiltWord() {
      if (miniLocked || !selectedLetters.length) return;
      const answer = selectedLetters.map(id => letterBank.find(item => item.id === id).letter).join('');
      const card = studyCards()[miniOrder[miniIndex]];
      const correct = answer === normalizeEnglish(card.en);
      miniLocked = true;
      if (correct) {
        miniScore++;
        knownIds.add(card.id);
        recordStudyActivity();
        persist();
        updateStats();
      }
      $('#build-feedback').textContent = correct ? 'Верно! Отлично собрали слово.' : 'Правильный ответ: ' + card.en;
      $('#build-feedback').style.color = correct ? '#286340' : '#a34f43';
      $('#check-word').classList.add('hidden');
      $('#build-reset').classList.add('hidden');
      $('#next-build').classList.remove('hidden');
      renderLetterBoard();
    }
    function startTruthGame() {
      const learningDeck = studyCards();
      if (learningDeck.length < 2) { renderGameHub(); return; }
      miniMode = 'truth';
      miniOrder = shuffle(learningDeck.map((_, index) => index)).slice(0, Math.min(learningDeck.length, 10));
      miniIndex = 0;
      miniScore = 0;
      renderTruthQuestion();
    }
    function renderTruthQuestion() {
      const learningDeck = studyCards();
      if (miniIndex >= miniOrder.length) {
        finishMiniGame('Раунд завершён', '✅', 'Вы правильно определили ' + miniScore + ' из ' + miniOrder.length + ' ответов.', startTruthGame);
        return;
      }
      const card = learningDeck[miniOrder[miniIndex]];
      const otherTranslations = learningDeck.map((item, index) => ({item:item, index:index})).filter(row => row.index !== miniOrder[miniIndex] && normalize(row.item.ru) !== normalize(card.ru));
      truthExpected = Math.random() < .5 || !otherTranslations.length;
      const shownTranslation = truthExpected ? card.ru : otherTranslations[Math.floor(Math.random() * otherTranslations.length)].item.ru;
      miniLocked = false;
      $('#view-match').innerHTML = renderGameHeader('Верно или нет', 'Проверьте, совпадает ли перевод с английской карточкой.', miniIndex + 1, miniOrder.length) +
        '<div class="quiz-shell"><div class="binary-prompt"><div class="quiz-question-label">ЭТОТ ПЕРЕВОД ПОДХОДИТ?</div><div class="binary-word">' + escapeHtml(card.en) + '</div><div class="binary-translation">' + escapeHtml(shownTranslation) + '</div><div class="binary-controls"><button class="small-primary" id="truth-yes">Да, верно</button><button class="small-secondary" id="truth-no">Нет, другой перевод</button></div><div class="mini-feedback" id="truth-feedback"></div><div style="margin-top:18px"><button class="small-primary hidden" id="next-truth">Дальше →</button></div></div></div>';
      $('#back-games').onclick = renderGameHub;
      $('#truth-yes').onclick = () => answerTruth(true, card);
      $('#truth-no').onclick = () => answerTruth(false, card);
      $('#next-truth').onclick = () => { miniIndex++; renderTruthQuestion(); };
    }
    function answerTruth(answer, card) {
      if (miniLocked) return;
      miniLocked = true;
      const correct = answer === truthExpected;
      if (correct) {
        miniScore++;
        knownIds.add(card.id);
        recordStudyActivity();
        persist();
        updateStats();
      }
      $('#truth-yes').disabled = true;
      $('#truth-no').disabled = true;
      $('#truth-feedback').textContent = (correct ? 'Верно! ' : 'Не совсем. ') + 'Перевод карточки: ' + card.ru;
      $('#truth-feedback').style.color = correct ? '#286340' : '#a34f43';
      $('#next-truth').classList.remove('hidden');
    }
    function startMemoryGame() {
      const learningDeck = studyCards();
      if (learningDeck.length < 2) { renderGameHub(); return; }
      memoryRound++;
      memoryItems = shuffle(learningDeck).slice(0, Math.min(learningDeck.length, 6));
      memoryDeck = shuffle(memoryItems.flatMap(card => [
        {cardId:card.id, side:'en', text:card.en},
        {cardId:card.id, side:'ru', text:card.ru}
      ]));
      memoryFlipped = [];
      memoryFound = 0;
      memoryMoves = 0;
      memoryBusy = false;
      $('#view-match').innerHTML = renderGameHeader('Память', 'Найди пары: английское слово и его перевод.', 0, memoryItems.length) +
        '<div class="memory-shell"><div class="match-head"><div class="match-status">Найдено пар: <strong id="memory-pairs">0 из ' + memoryItems.length + '</strong><span class="memory-separator">·</span>Ходы: <strong id="memory-moves">0</strong></div><button class="text-btn" id="memory-reshuffle">Перемешать</button></div><div class="memory-board" id="memory-board">' +
        memoryDeck.map((item, index) => '<button class="memory-tile" data-card-id="' + escapeHtml(item.cardId) + '" data-side="' + item.side + '" data-face="' + escapeHtml(item.text) + '" data-slot="' + index + '" aria-label="Закрытая карточка"><span class="memory-back" aria-hidden="true">?</span></button>').join('') +
        '</div><div class="text-center" style="margin-top:20px"><button class="small-secondary" id="exit-memory">Все игры</button></div></div>';
      $$('.memory-tile').forEach(tile => tile.onclick = () => selectMemoryTile(tile));
      $('#memory-reshuffle').onclick = startMemoryGame;
      $('#exit-memory').onclick = renderGameHub;
      $('#back-games').onclick = renderGameHub;
    }
    function revealMemoryTile(tile) {
      tile.classList.add('revealed');
      tile.innerHTML = '<span class="memory-side">' + (tile.dataset.side === 'en' ? 'EN' : 'RU') + '</span><span class="memory-face">' + escapeHtml(tile.dataset.face) + '</span>';
      tile.setAttribute('aria-label', (tile.dataset.side === 'en' ? 'Английское слово: ' : 'Перевод: ') + tile.dataset.face);
    }
    function hideMemoryTile(tile) {
      tile.classList.remove('revealed', 'wrong');
      tile.innerHTML = '<span class="memory-back" aria-hidden="true">?</span>';
      tile.setAttribute('aria-label', 'Закрытая карточка');
    }
    function selectMemoryTile(tile) {
      if (memoryBusy || tile.classList.contains('matched') || tile.classList.contains('revealed')) return;
      revealMemoryTile(tile);
      memoryFlipped.push(tile);
      if (memoryFlipped.length < 2) return;
      memoryMoves++;
      $('#memory-moves').textContent = memoryMoves;
      const first = memoryFlipped[0], second = memoryFlipped[1];
      const isPair = first.dataset.cardId === second.dataset.cardId && first.dataset.side !== second.dataset.side;
      const round = memoryRound;
      memoryBusy = true;
      if (isPair) {
        setTimeout(() => {
          if (round !== memoryRound || !$('#memory-board')) return;
          memoryBusy = false;
          first.classList.add('matched');
          second.classList.add('matched');
          first.disabled = true;
          second.disabled = true;
          first.setAttribute('aria-label', 'Пара найдена: ' + first.dataset.face);
          second.setAttribute('aria-label', 'Пара найдена: ' + second.dataset.face);
          const card = studyCards().find(item => item.id === first.dataset.cardId);
          if (card) knownIds.add(card.id);
          recordStudyActivity();
          persist();
          updateStats();
          memoryFound++;
          $('#memory-pairs').textContent = memoryFound + ' из ' + memoryItems.length;
          $('#game-progress').textContent = memoryFound + ' / ' + memoryItems.length;
          memoryFlipped = [];
          if (memoryFound === memoryItems.length) {
            setTimeout(() => { if (round === memoryRound && $('#memory-board')) finishMiniGame('Все пары найдены!', '🧠', 'Вы собрали ' + memoryFound + ' пар за ' + memoryMoves + ' ходов.', startMemoryGame); }, 300);
          }
        }, 250);
      } else {
        first.classList.add('wrong');
        second.classList.add('wrong');
        setTimeout(() => {
          if (round !== memoryRound || !$('#memory-board')) return;
          memoryBusy = false;
          hideMemoryTile(first);
          hideMemoryTile(second);
          memoryFlipped = [];
        }, 800);
      }
    }
    function renderSprintHeader() {
      return '<div class="view-title"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><h1>Спринт перевода</h1><p>Введи перевод своих слов, пока не закончились 45 секунд.</p></div><button class="text-btn" id="back-games">← Все игры</button></div></div>' +
        '<div class="sprint-clock-row"><div class="study-type">БЫСТРЫЙ РАУНД</div><strong class="sprint-clock" id="sprint-clock">' + sprintTimeLeft + ' сек</strong></div><div class="study-progress sprint-progress"><div id="sprint-progress" class="' + (sprintTimeLeft <= 10 ? 'urgent' : '') + '" style="width:' + (sprintTimeLeft / 45 * 100) + '%"></div></div>';
    }
    function startSprintGame() {
      const learningDeck = studyCards();
      if (!learningDeck.length) { renderGameHub(); return; }
      if (sprintTimer) { clearInterval(sprintTimer); sprintTimer = null; }
      sprintDeck = shuffle(learningDeck.map((_, index) => index));
      sprintIndex = 0;
      sprintScore = 0;
      sprintErrors = 0;
      sprintTimeLeft = 45;
      sprintLocked = false;
      renderSprintQuestion();
      sprintTimer = setInterval(() => {
        sprintTimeLeft = Math.max(0, sprintTimeLeft - 1);
        const clock = $('#sprint-clock'), progress = $('#sprint-progress');
        if (clock) clock.textContent = sprintTimeLeft + ' сек';
        if (progress) {
          progress.style.width = (sprintTimeLeft / 45 * 100) + '%';
          progress.classList.toggle('urgent', sprintTimeLeft <= 10);
        }
        if (sprintTimeLeft <= 0) {
          clearInterval(sprintTimer);
          sprintTimer = null;
          finishMiniGame('Время вышло!', '⏱️', 'Верных переводов: ' + sprintScore + '. Ошибок: ' + sprintErrors + '.', startSprintGame);
        }
      }, 1000);
    }
    function renderSprintQuestion() {
      const learningDeck = studyCards();
      if (sprintIndex >= sprintDeck.length) {
        const previous = sprintDeck[sprintDeck.length - 1];
        sprintDeck = shuffle(learningDeck.map((_, index) => index));
        if (sprintDeck.length > 1 && sprintDeck[0] === previous) [sprintDeck[0], sprintDeck[1]] = [sprintDeck[1], sprintDeck[0]];
        sprintIndex = 0;
      }
      const card = learningDeck[sprintDeck[sprintIndex]];
      sprintLocked = false;
      $('#view-match').innerHTML = renderSprintHeader() +
        '<div class="sprint-shell"><div class="sprint-scoreline">Верно: <strong id="sprint-score">' + sprintScore + '</strong><span>·</span>Ошибки: <strong id="sprint-errors">' + sprintErrors + '</strong></div><section class="sprint-card"><div class="quiz-question-label">КАК ПЕРЕВОДИТСЯ</div><div class="sprint-word">' + escapeHtml(card.en) + '</div><form id="sprint-form"><label for="sprint-answer">Твой перевод</label><div class="sprint-entry"><input id="sprint-answer" autocomplete="off" autocapitalize="off" placeholder="Введи перевод" required><button class="small-primary" id="sprint-check" type="submit">Проверить</button><button class="small-primary hidden" id="sprint-next" type="button">Дальше →</button></div></form><div class="mini-feedback" id="sprint-feedback" role="status" aria-live="polite"></div></section></div>';
      $('#back-games').onclick = renderGameHub;
      $('#sprint-form').onsubmit = event => {
        event.preventDefault();
        if (sprintLocked) return;
        const answer = $('#sprint-answer').value;
        if (!answer.trim()) return;
        sprintLocked = true;
        const correct = normalize(answer) === normalize(card.ru);
        if (correct) {
          sprintScore++;
          knownIds.add(card.id);
          recordStudyActivity();
          persist();
          updateStats();
          $('#sprint-feedback').textContent = 'Точно! Отличный темп.';
          $('#sprint-feedback').style.color = '#286340';
        } else {
          sprintErrors++;
          $('#sprint-feedback').textContent = 'Правильный перевод: ' + card.ru;
          $('#sprint-feedback').style.color = '#a34f43';
        }
        $('#sprint-score').textContent = sprintScore;
        $('#sprint-errors').textContent = sprintErrors;
        $('#sprint-answer').disabled = true;
        $('#sprint-check').classList.add('hidden');
        $('#sprint-next').classList.remove('hidden');
        $('#sprint-next').focus();
      };
      $('#sprint-next').onclick = () => { sprintIndex++; renderSprintQuestion(); $('#sprint-answer').focus(); };
      $('#sprint-answer').focus();
    }    $$('.nav-btn').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-go]');
      if (button) setView(button.dataset.go);
    });
    $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    const themePreferenceKey = 'leximo-theme-v1';
    const themeToggle = $('#theme-toggle');
    const themeLabel = $('#theme-label');
    let savedTheme = 'light';
    try { savedTheme = localStorage.getItem(themePreferenceKey) === 'dark' ? 'dark' : 'light'; } catch (e) {}
    function applyTheme(theme, persistTheme) {
      const isDark = theme === 'dark';
      document.body.classList.toggle('theme-studio', isDark);
      if (themeToggle) themeToggle.setAttribute('aria-checked', String(isDark));
      if (themeLabel) themeLabel.textContent = isDark ? 'Тёмная' : 'Светлая';
      const themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor) themeColor.setAttribute('content', isDark ? '#09171f' : '#f1f6f7');
      if (persistTheme) {
        try { localStorage.setItem(themePreferenceKey, isDark ? 'dark' : 'light'); } catch (e) {}
      }
    }
    applyTheme(savedTheme, false);
    themeToggle.addEventListener('click', () => {
      applyTheme(document.body.classList.contains('theme-studio') ? 'light' : 'dark', true);
    });
    $('#sound-toggle').addEventListener('click', () => {
      audioOn = !audioOn;
      $('#sound-toggle').style.color = audioOn ? '#78847a' : '#c08b72';
      $('#sound-toggle').setAttribute('aria-label', audioOn ? 'Озвучивание включено' : 'Озвучивание выключено');
      showToast(audioOn ? 'Озвучивание включено' : 'Озвучивание выключено');
    });
    $('#today-date').textContent = now.toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'}).toLocaleUpperCase('ru-RU');
    updateStats();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }
  
