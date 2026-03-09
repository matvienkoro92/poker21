/**
 * Tournament Master Pro — MTT покерные задачи.
 * 80 уровней по спецификации PDF, задачи с полной структурой.
 * requiredPoints — кумулятивная сумма баллов для достижения уровня.
 */
(function () {
  var LEVELS_RAW = [
    { level: 1, name: "Основы префлопа", points: 50, description: "Сильные руки на ранней позиции" },
    { level: 2, name: "Позиционная игра", points: 110, description: "Открытие с разных позиций" },
    { level: 3, name: "Защита блайндов", points: 185, description: "Защита SB/BB" },
    { level: 4, name: "3-бет префлоп", points: 275, description: "Ответ на рейзы" },
    { level: 5, name: "Ранняя стадия MTT", points: 380, description: "Глубокие стеки (40-100ББ)" },
    { level: 6, name: "Средние стеки", points: 500, description: "Игра с 20-40ББ" },
    { level: 7, name: "Короткие стеки", points: 635, description: "Игра с 10-20ББ" },
    { level: 8, name: "Очень короткие стеки", points: 785, description: "Игра с 5-10ББ" },
    { level: 9, name: "Пузырные основы", points: 950, description: "Первые ICM решения" },
    { level: 10, name: "Пузырный префлоп", points: 1130, description: "Префлоп на пузыре" },
    { level: 11, name: "Финальные столы", points: 1325, description: "Вход в финальный стол" },
    { level: 12, name: "Выплатные зоны", points: 1535, description: "Игра за призовые места" },
    { level: 13, name: "Хедз-ап основы", points: 1760, description: "Основы хедз-апа" },
    { level: 14, name: "Продвинутый префлоп", points: 2000, description: "Балансировка диапазонов" },
    { level: 15, name: "Постфлоп: флоп", points: 2255, description: "C-bet стратегия" },
    { level: 16, name: "Постфлоп: терн", points: 2525, description: "Баррели на терне" },
    { level: 17, name: "Постфлоп: ривер", points: 2810, description: "Вэлью и блеф на ривере" },
    { level: 18, name: "Сложные ICM", points: 3110, description: "Многоходовые ICM решения" },
    { level: 19, name: "Турнирная мета-игра", points: 3425, description: "Адаптация к оппонентам" },
    { level: 20, name: "Профессиональный уровень", points: 3755, description: "Комплексные решения" },
    { level: 21, name: "Эксперт префлопа", points: 4115, description: "Продвинутые префлоп решения" },
    { level: 22, name: "Мастер постфлопа", points: 4500, description: "Сложные постфлоп линии" },
    { level: 23, name: "ICM стратег", points: 4910, description: "Оптимизация ICM" },
    { level: 24, name: "Пузырный мастер", points: 5345, description: "Экспертная игра на пузыре" },
    { level: 25, name: "Финальный стол мастер", points: 5805, description: "Доминирование на ФТ" },
    { level: 26, name: "Хедз-ап эксперт", points: 6290, description: "Продвинутый хедз-ап" },
    { level: 27, name: "Глубокие стеки мастер", points: 6800, description: "Сложная игра с 50+ББ" },
    { level: 28, name: "Короткие стеки эксперт", points: 7335, description: "Оптимальный push/fold" },
    { level: 29, name: "Банкролл менеджер", points: 7895, description: "Риск менеджмент" },
    { level: 30, name: "Психология турниров", points: 8480, description: "Ментальная игра" },
    { level: 31, name: "GTO основы", points: 9090, description: "Введение в GTO" },
    { level: 32, name: "Эквити калькулятор", points: 9725, description: "Расчеты эквити" },
    { level: 33, name: "Рейндж строитель", points: 10385, description: "Построение диапазонов" },
    { level: 34, name: "Блеф мастер", points: 11070, description: "Оптимальный блеф" },
    { level: 35, name: "Вэлью хантер", points: 11780, description: "Максимизация вэлью" },
    { level: 36, name: "Мультипоте стратег", points: 12515, description: "Игра в мультипотах" },
    { level: 37, name: "Позиционный мастер", points: 13275, description: "Максимизация позиции" },
    { level: 38, name: "Агрессивный игрок", points: 14060, description: "Контролируемая агрессия" },
    { level: 39, name: "Пассивный мастер", points: 14870, description: "Игра в пассивном стиле" },
    { level: 40, name: "Балансированный игрок", points: 15705, description: "Идеальный баланс" },
    { level: 41, name: "Турнирный аналитик", points: 16565, description: "Анализ турниров" },
    { level: 42, name: "Спутниковый мастер", points: 17450, description: "Спутниковые турниры" },
    { level: 43, name: "Мега турниры", points: 18360, description: "Крупные поля" },
    { level: 44, name: "Быстрые турниры", points: 19295, description: "Турбо/Хипер-турбо" },
    { level: 45, name: "Глубокие турниры", points: 20255, description: "Глубокие структуры" },
    { level: 46, name: "Кэш-аут стратег", points: 21240, description: "Игра за кэшаут" },
    { level: 47, name: "Финальный баттл", points: 22250, description: "Битва за первое" },
    { level: 48, name: "Турнирный чемпион", points: 23285, description: "Победная стратегия" },
    { level: 49, name: "Покерный мыслитель", points: 24345, description: "Стратегическое мышление" },
    { level: 50, name: "Мастер адаптации", points: 25430, description: "Адаптация к стилям" },
    { level: 51, name: "Эксперт по таймингу", points: 26540, description: "Идеальный тайминг" },
    { level: 52, name: "Банк менеджер", points: 27675, description: "Управление банком" },
    { level: 53, name: "Риск стратег", points: 28835, description: "Расчет рисков" },
    { level: 54, name: "Эмоциональный контроль", points: 30020, description: "Контроль эмоций" },
    { level: 55, name: "Тильт мастер", points: 31230, description: "Преодоление тильта" },
    { level: 56, name: "Концентрация мастер", points: 32465, description: "Максимальная концентрация" },
    { level: 57, name: "Выносливость эксперт", points: 33725, description: "Длительные сессии" },
    { level: 58, name: "Скорость мысли", points: 35010, description: "Быстрое принятие решений" },
    { level: 59, name: "Интуиция мастер", points: 36320, description: "Развитие интуиции" },
    { level: 60, name: "Покерный философ", points: 37655, description: "Философия покера" },
    { level: 61, name: "Легенда префлопа", points: 39015, description: "Мифические префлоп решения" },
    { level: 62, name: "Легенда постфлопа", points: 40400, description: "Нереальные постфлоп линии" },
    { level: 63, name: "ICM легенда", points: 41810, description: "Сверхчеловеческий ICM" },
    { level: 64, name: "Пузырная легенда", points: 43245, description: "Божественная игра на пузыре" },
    { level: 65, name: "Финальный стол легенда", points: 44705, description: "Непобедимость на ФТ" },
    { level: 66, name: "Хедз-ап легенда", points: 46190, description: "Абсолютный хедз-ап" },
    { level: 67, name: "Глубокие стеки легенда", points: 47700, description: "Магия глубоких стеков" },
    { level: 68, name: "Короткие стеки легенда", points: 49235, description: "Чудо коротких стеков" },
    { level: 69, name: "Банкролл легенда", points: 50795, description: "Алхимия банкролла" },
    { level: 70, name: "Психология легенда", points: 52380, description: "Чтение мыслей" },
    { level: 71, name: "GTO легенда", points: 53990, description: "Совершенный GTO" },
    { level: 72, name: "Эквити легенда", points: 55625, description: "Мгновенный расчет эквити" },
    { level: 73, name: "Рейндж легенда", points: 57285, description: "Безупречные диапазоны" },
    { level: 74, name: "Блеф легенда", points: 58970, description: "Непроницаемый блеф" },
    { level: 75, name: "Вэлью легенда", points: 60680, description: "Максимальное извлечение" },
    { level: 76, name: "Мультипоте легенда", points: 62415, description: "Мастер мультипотов" },
    { level: 77, name: "Позиция легенда", points: 64175, description: "Абсолютная позиция" },
    { level: 78, name: "Агрессия легенда", points: 65960, description: "Идеальная агрессия" },
    { level: 79, name: "Баланс легенда", points: 67770, description: "Абсолютный баланс" },
    { level: 80, name: "ПОКЕРНЫЙ БОГ", points: 69605, description: "Вершина мастерства" }
  ];
  var cumul = 0;
  var MTT_LEVELS = LEVELS_RAW.map(function (l) {
    var req = cumul;
    cumul += l.points;
    return { level: l.level, name: l.name, points: l.points, description: l.description, requiredPoints: req };
  });
  window.MTT_LEVELS = MTT_LEVELS;
})();

var MTT_TASKS = [
  { id: "mtt_001", level: 1, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на UTG с AK.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 5ББ (250)" }], correct_answer: "C", explanation: "На ранней стадии MTT с 100ББ и AK на ранней позиции нужно рейзить стандартный размер 2.5ББ. Это позволяет построить банк, получить информацию и не переплачивать.", player_cards: ["A", "K"] },
  { id: "mtt_002", level: 1, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на UTG с 72.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 5ББ (250)" }], correct_answer: "A", explanation: "С 72 на UTG нужно всегда фолдить. Это одна из худших возможных рук, даже с 100ББ.", player_cards: ["7", "2"] },
  { id: "mtt_003", level: 1, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на UTG с QQ.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 5ББ (250)" }], correct_answer: "C", explanation: "С QQ на UTG нужно рейзить стандартный размер 2.5ББ. QQ — сильная рука, но не настолько, чтобы рейзить больше.", player_cards: ["Q", "Q"] },
  { id: "mtt_004", level: 1, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на UTG с AA.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 5ББ (250)" }], correct_answer: "C", explanation: "С AA на UTG нужно рейзить стандартный размер 2.5ББ. Даже с AA не нужно рейзить больше на ранней стадии.", player_cards: ["A", "A"] },
  { id: "mtt_005", level: 1, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на UTG с KK.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 5ББ (250)" }], correct_answer: "C", explanation: "С KK на UTG нужно рейзить стандартный размер 2.5ББ. KK — вторая по силе рука.", player_cards: ["K", "K"] },
  { id: "mtt_006", level: 2, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на катоффе с AK. Все фолдили до вас.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 3ББ (150)" }], correct_answer: "C", explanation: "С AK на катоффе можно рейзить 2.5ББ. Позиция позволяет играть более агрессивно.", player_cards: ["A", "K"] },
  { id: "mtt_007", level: 2, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на баттоне с KQ. Все фолдили до вас.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 3ББ (150)" }], correct_answer: "C", explanation: "С KQ на баттоне можно рейзить 2.5ББ. Баттон — лучшая позиция, позволяет играть широкий диапазон.", player_cards: ["K", "Q"] },
  { id: "mtt_008", level: 2, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на средней позиции с AQ.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 3ББ (150)" }], correct_answer: "C", explanation: "С AQ на средней позиции нужно рейзить 2.5ББ. AQs — сильная рука, но не премиум.", player_cards: ["A", "Q"] },
  { id: "mtt_009", level: 2, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на UTG+1 с JJ.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 3ББ (150)" }], correct_answer: "C", explanation: "С JJ на UTG+1 нужно рейзить 2.5ББ. JJ — сильная рука на ранней позиции.", player_cards: ["J", "J"] },
  { id: "mtt_010", level: 2, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на UTG+2 с TT.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 50" }, { id: "C", text: "Рейз 2.5ББ (125)" }, { id: "D", text: "Рейз 3ББ (150)" }], correct_answer: "C", explanation: "С TT на UTG+2 нужно рейзить 2.5ББ. TT — пограничная рука на ранней позиции, но всё же рейзимая.", player_cards: ["T", "T"] },
  { id: "mtt_011", level: 3, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на SB с AJ. Все лимпили.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Завершить блайнд (25)" }, { id: "C", text: "Рейз до 4ББ (200)" }, { id: "D", text: "Олл-ин" }], correct_answer: "B", explanation: "С AJ в мультипоте лучше завершить блайнд. Рейзить против нескольких лимперов рискованно.", player_cards: ["A", "J"] },
  { id: "mtt_012", level: 3, situation: "MTT, ранняя стадия. Блайнды 25/50. У вас 100ББ. Вы на BB с KT. SB лимпит.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Чек" }, { id: "C", text: "Рейз до 3ББ (150)" }, { id: "D", text: "Олл-ин" }], correct_answer: "B", explanation: "С KT против лимпа можно чекнуть. Нет необходимости рейзить.", player_cards: ["K", "T"] },
  { id: "mtt_013", level: 1, situation: "MTT, ранняя стадия. Блайнды 10/20. Ваш стек 1500 (75BB). Вы на UTG с AK.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 20" }, { id: "C", text: "Рейз 2.5BB (50)" }, { id: "D", text: "Рейз 3BB (60)" }], correct_answer: "D", explanation: "На ранней стадии MTT с глубоким стеком (75BB) и сильной рукой AKs на ранней позиции оптимально рейзить 3BB для построения банка и получения информации.", player_cards: ["A", "K"] },
  { id: "mtt_014", level: 1, situation: "MTT, ранняя стадия. Блайнды 25/50. Ваш стек 2000 (40BB). Вы на большом блайнде с KK. UTG рейзит 3BB (150).", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Колл 150" }, { id: "C", text: "Рерайз до 450 (3-бет)" }, { id: "D", text: "Олл-ин" }], correct_answer: "C", explanation: "С парой королей против рейза с ранней позиции нужно 3-бетить для изоляции и построения банка.", player_cards: ["K", "K"] },
  { id: "mtt_015", level: 1, situation: "MTT, ранняя стадия. Блайнды 10/20. Ваш стек 1800 (90BB). Вы на малом блайнде с 33. Все лимпили.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Завершить блайнд (доплатить 10)" }, { id: "C", text: "Рейз до 80" }, { id: "D", text: "Олл-ин" }], correct_answer: "B", explanation: "С маленькой парой в мультипоте лучше просто завершить блайнд, надеясь поймать сет.", player_cards: ["3", "3"] },
  { id: "mtt_016", level: 1, situation: "MTT, ранняя стадия. Блайнды 20/40. Ваш стек 1600 (40BB). Вы на катоффе с QJ. Все фолдили до вас.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 40" }, { id: "C", text: "Рейз 2.5BB (100)" }, { id: "D", text: "Рейз 5BB (200)" }], correct_answer: "C", explanation: "С suited connector на поздней позиции можно агрессивно рейзить для украшения блайндов.", player_cards: ["Q", "J"] },
  { id: "mtt_017", level: 1, situation: "MTT, ранняя стадия. Блайнды 30/60. Ваш стек 900 (15BB). Вы на баттоне с AQ. Все фолдили до вас.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 60" }, { id: "C", text: "Рейз 2.5BB (150)" }, { id: "D", text: "Олл-ин" }], correct_answer: "C", explanation: "С 15BB и сильной рукой на баттоне стандартный рейз 2.5BB оптимальнее олл-ина.", player_cards: ["A", "Q"] },
  { id: "mtt_018", level: 1, situation: "MTT, ранняя стадия. Блайнды 40/80. Ваш стек 2000 (25BB). Вы на большом блайнде с 99. UTG рейзит 3BB (240).", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Колл 240" }, { id: "C", text: "Рерайз до 720" }, { id: "D", text: "Олл-ин" }], correct_answer: "B", explanation: "С парой девяток против рейза с ранней позиции лучше просто коллить, контролируя банк.", player_cards: ["9", "9"] },
  { id: "mtt_019", level: 1, situation: "MTT, ранняя стадия. Блайнды 100/200. Ваш стек 4000 (20BB). Вы на баттоне с 88. Все фолдили до вас.", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Лимп 200" }, { id: "C", text: "Рейз 2.5BB (500)" }, { id: "D", text: "Олл-ин" }], correct_answer: "C", explanation: "С парой восьмёрок и 20BB на баттоне стандартный рейз оптимальнее олл-ина.", player_cards: ["8", "8"] },
  { id: "mtt_020", level: 1, situation: "MTT, ранняя стадия. Блайнды 75/150. Ваш стек 2250 (15BB). Вы на катоффе с AK. UTG рейзит 3BB (450).", question: "Ваше действие?", options: [{ id: "A", text: "Фолд" }, { id: "B", text: "Колл 450" }, { id: "C", text: "Рерайз до 1350" }, { id: "D", text: "Олл-ин" }], correct_answer: "D", explanation: "С 15BB и AK против рейза оптимально идти олл-ин для защиты эквити.", player_cards: ["A", "K"] }
];

var MTT_LEADERBOARD = [
  { place: 1, nick: "—", points: 0, level: 1 },
  { place: 2, nick: "—", points: 0, level: 1 },
  { place: 3, nick: "—", points: 0, level: 1 },
  { place: 4, nick: "—", points: 0, level: 1 },
  { place: 5, nick: "—", points: 0, level: 1 }
];
